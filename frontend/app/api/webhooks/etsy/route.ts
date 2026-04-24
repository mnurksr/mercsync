/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Etsy Webhook Handler
 * 
 * Etsy supports webhooks for order-related events:
 * - order.paid
 * - order.canceled
 * - order.shipped
 * - order.delivered
 *
 * When an order.paid event is received, we immediately process it
 * instead of waiting for the 15-minute cron polling cycle.
 * The cron continues to run as a fallback safety net.
 *
 * Endpoint: POST /api/webhooks/etsy
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
import { createNotification } from '../../../actions/notifications';
import crypto from 'crypto';
import { classifyInventoryState } from '@/utils/inventoryStatus';
import { canProcessMonthlyOrderSync } from '@/utils/planLimits';
import { claimWebhookEvent } from '@/utils/webhookIdempotency';

function parseReceiptIdentifiers(payload: any) {
    let receiptId = payload.receipt_id?.toString();
    const resourceUrl = payload.resource_url || '';
    let parsedShopId = payload.shop_id?.toString() || '';

    if (!receiptId && resourceUrl) {
        const receiptMatch = resourceUrl.match(/receipts\/(\d+)/);
        if (receiptMatch) {
            receiptId = receiptMatch[1];
        }
    }

    if (!parsedShopId && resourceUrl) {
        const shopMatch = resourceUrl.match(/shops\/(\d+)/);
        if (shopMatch) {
            parsedShopId = shopMatch[1];
        }
    }

    return { receiptId, parsedShopId, resourceUrl };
}

async function getCurrentEtsyVariantStock(listingId: string, variantId: string, accessToken: string): Promise<number> {
    const currentInventory = await etsyApi.getInventory(listingId, accessToken);
    const products = Array.isArray(currentInventory?.products) ? currentInventory.products : [];
    const matchedProduct = products.find((product: any) => product.product_id?.toString() === variantId.toString());

    if (!matchedProduct) {
        return 0;
    }

    return (matchedProduct.offerings || []).reduce(
        (sum: number, offering: any) => sum + Math.max(0, Number(offering.quantity || 0)),
        0
    );
}

async function restoreShopifyStockToTrackedLocations(
    shop: any,
    item: any,
    desiredTotal: number,
    locationPreference: string[]
) {
    if (!shop.access_token || !item.shopify_inventory_item_id || locationPreference.length === 0) {
        return;
    }

    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
    const levelsData = await shopifyApi.getInventoryLevels(creds, locationPreference, item.shopify_inventory_item_id);
    const levels = Array.isArray(levelsData?.inventory_levels) ? levelsData.inventory_levels : [];

    const currentTotal = levels
        .filter((level: any) => level.inventory_item_id?.toString() === item.shopify_inventory_item_id?.toString())
        .reduce((sum: number, level: any) => sum + Math.max(0, Number(level.available || 0)), 0);

    const delta = desiredTotal - currentTotal;
    if (delta === 0) {
        return;
    }

    const primaryLocationId = locationPreference[0];
    const primaryLevel = levels.find((level: any) => level.location_id?.toString() === primaryLocationId) || { available: 0 };
    const nextPrimaryStock = Math.max(0, Number(primaryLevel.available || 0) + delta);

    await shopifyApi.setInventoryLevel(creds, primaryLocationId, item.shopify_inventory_item_id, nextPrimaryStock);
}

export async function POST(req: NextRequest) {
    const logPrefix = '[Etsy Webhook]';
    const supabase = createAdminClient();

    try {
        const rawBody = await req.text();

        // ── 1. Validate Webhook Signature ──
        const signature = req.headers.get('x-etsy-signature') || req.headers.get('X-Etsy-Signature');
        const etsyWebhookSecret = process.env.ETSY_WEBHOOK_SECRET;

        if (etsyWebhookSecret && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', etsyWebhookSecret)
                .update(rawBody)
                .digest('hex');

            if (signature !== expectedSignature) {
                console.warn(`${logPrefix} HMAC validation failed`);
                return new Response('Unauthorized', { status: 401 });
            }
        } else if (etsyWebhookSecret) {
            // Secret is configured but no signature was sent
            console.warn(`${logPrefix} No signature header, rejecting`);
            return new Response('Missing signature', { status: 401 });
        }
        // If no secret configured, accept all (development mode)

        const payload = JSON.parse(rawBody);
        const eventType = payload.event_type || payload.type || '';
        const { receiptId, parsedShopId, resourceUrl } = parseReceiptIdentifiers(payload);
        console.log(`${logPrefix} Received event: ${eventType}`);

        const deliveryId = req.headers.get('webhook-id') || req.headers.get('Webhook-Id');
        const eventKey = deliveryId || [eventType, parsedShopId || 'unknown-shop', receiptId || resourceUrl || 'unknown-resource'].join(':');
        const claimed = await claimWebhookEvent(supabase, 'etsy', eventKey, eventType, parsedShopId || null);
        if (!claimed) {
            console.log(`${logPrefix} Duplicate event ignored: ${eventKey}`);
            return new Response('OK', { status: 200 });
        }

        switch (eventType) {
            case 'order.paid':
            case 'ORDER_PAID': // Legacy format support
                await handleOrderPaid(payload, supabase, logPrefix);
                break;

            case 'order.canceled':
            case 'ORDER_CANCELED':
                await handleOrderCanceled(payload, supabase, logPrefix);
                break;

            case 'order.shipped':
            case 'ORDER_SHIPPED':
            case 'order.delivered':
            case 'ORDER_DELIVERED':
                console.log(`${logPrefix} Order ${eventType}: ${payload.receipt_id || 'unknown'} (no action needed)`);
                break;

            default:
                console.log(`${logPrefix} Unhandled event type: ${eventType}`);
        }

        // Always respond 200 quickly
        return new Response('OK', { status: 200 });
    } catch (err: any) {
        console.error(`${logPrefix} Internal Error:`, err);
        return new Response('Server Error', { status: 500 });
    }
}

/**
 * Process an Etsy order.paid webhook event.
 * Uses the same cascade deduction logic as the cron job.
 * 
 * Etsy webhook payload format:
 * { "event_type": "order.paid", "resource_url": "https://openapi.etsy.com/v3/application/shops/{shop_id}/receipts/{receipt_id}", "shop_id": 12345 }
 */
async function handleOrderPaid(payload: any, supabase: any, logPrefix: string) {
    const { receiptId, parsedShopId } = parseReceiptIdentifiers(payload);

    if (!receiptId) {
        console.log(`${logPrefix} No receipt_id found in payload or resource_url. Skipping.`);
        console.log(`${logPrefix} Payload keys: ${Object.keys(payload).join(', ')}`);
        return;
    }

    console.log(`${logPrefix} Processing order.paid for receipt ${receiptId} (shop: ${parsedShopId})`);

    // 1. Find the shop
    if (!parsedShopId) {
        console.log(`${logPrefix} Missing shop_id for Etsy receipt ${receiptId}. Skipping.`);
        return;
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id')
        .eq('etsy_shop_id', parsedShopId)
        .eq('is_active', true)
        .maybeSingle();

    if (!shop) {
        console.log(`${logPrefix} No matching active shop found for Etsy shop_id ${parsedShopId}`);
        return;
    }

    return processReceipt(shop, receiptId, supabase, logPrefix);
}

async function handleOrderCanceled(payload: any, supabase: any, logPrefix: string) {
    const { receiptId, parsedShopId } = parseReceiptIdentifiers(payload);

    if (!receiptId || !parsedShopId) {
        console.log(`${logPrefix} Missing receipt_id or shop_id for cancellation payload. Skipping.`);
        return;
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id')
        .eq('etsy_shop_id', parsedShopId)
        .eq('is_active', true)
        .maybeSingle();

    if (!shop) {
        console.log(`${logPrefix} No matching active shop found for canceled Etsy receipt ${receiptId}`);
        return;
    }

    const { data: settings } = await supabase
        .from('shop_settings')
        .select('auto_sync_enabled, sync_direction, location_deduction_order')
        .eq('shop_id', shop.id)
        .maybeSingle();

    if (!settings?.auto_sync_enabled) {
        console.log(`${logPrefix} Auto-sync disabled for shop ${shop.id}. Skipping cancellation restore.`);
        return;
    }

    const direction = settings.sync_direction || 'bidirectional';
    if (direction === 'shopify_to_etsy') {
        console.log(`${logPrefix} Direction is shopify_to_etsy. Skipping Etsy cancellation restore.`);
        return;
    }

    const txData = await etsyApi.getReceiptTransactions(shop.etsy_shop_id, receiptId, shop.etsy_access_token);
    const transactions = txData.results || [];

    let restoredItems = 0;
    let skippedItems = 0;
    let failedItems = 0;

    for (const tx of transactions) {
        const listingId = tx.listing_id?.toString();
        if (!listingId) continue;

        const { data: item } = await supabase
            .from('inventory_items')
            .select('id, name, master_stock, shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, shopify_inventory_item_id, selected_location_ids, etsy_listing_id, etsy_variant_id')
            .eq('shop_id', shop.id)
            .eq('etsy_listing_id', listingId)
            .maybeSingle();

        if (!item || !item.shopify_inventory_item_id || !item.etsy_variant_id) {
            skippedItems++;
            continue;
        }

        let currentEtsyStock = Math.max(0, Number(item.etsy_stock_snapshot ?? item.master_stock ?? 0));
        try {
            currentEtsyStock = await getCurrentEtsyVariantStock(listingId, item.etsy_variant_id.toString(), shop.etsy_access_token);
        } catch (err: any) {
            console.error(`${logPrefix} Failed to fetch live Etsy inventory for listing ${listingId}:`, err.message);
        }

        const itemStateBeforeSync = classifyInventoryState({
            shopifyVariantId: item.shopify_variant_id,
            etsyVariantId: item.etsy_variant_id,
            masterStock: item.master_stock,
            shopifyStock: item.shopify_stock_snapshot,
            etsyStock: item.etsy_stock_snapshot,
        });

        const desiredTotal = currentEtsyStock;
        const locationPreference = Array.isArray(settings?.location_deduction_order) && settings.location_deduction_order.length > 0
            ? settings.location_deduction_order.map((id: any) => id.toString())
            : Array.isArray(item.selected_location_ids) && item.selected_location_ids.length > 0
                ? item.selected_location_ids.map((id: any) => id.toString())
                : (shop.main_location_id ? [shop.main_location_id.toString()] : []);

        const updatePayload: Record<string, unknown> = {
            master_stock: desiredTotal,
            etsy_stock_snapshot: desiredTotal,
            updated_at: new Date().toISOString(),
            etsy_updated_at: new Date().toISOString()
        };

        try {
            if (itemStateBeforeSync !== 'action_required') {
                await restoreShopifyStockToTrackedLocations(shop, item, desiredTotal, locationPreference);
                updatePayload.shopify_stock_snapshot = desiredTotal;
                updatePayload.shopify_updated_at = new Date().toISOString();
            } else {
                skippedItems++;
            }
        } catch (err: any) {
            failedItems++;
            console.error(`${logPrefix} Failed to restore Shopify stock for listing ${listingId}:`, err.message);
            continue;
        }

        await supabase.from('inventory_items').update(updatePayload).eq('id', item.id);

        restoredItems++;
    }

    const status = failedItems > 0 ? 'failed' : restoredItems > 0 ? 'success' : 'skipped';
    await supabase.from('sync_logs').insert({
        shop_id: shop.id,
        source: 'etsy',
        event_type: 'order_cancel',
        direction: 'etsy_to_shopify',
        status,
        error_message: failedItems > 0 ? 'One or more Shopify restock updates failed during Etsy cancellation sync.' : null,
        metadata: {
            etsy_receipt_id: receiptId.toString(),
            source: 'webhook',
            restored_items: restoredItems,
            skipped_items: skippedItems,
            failed_items: failedItems,
            transaction_count: transactions.length
        },
        created_at: new Date().toISOString()
    });
}

async function processReceipt(shop: any, receiptId: string, supabase: any, logPrefix: string) {
    // Check if already processed
    const { data: existing } = await supabase
        .from('sync_logs')
        .select('id')
        .eq('shop_id', shop.id)
        .eq('event_type', 'order')
        .eq('metadata->>etsy_receipt_id', receiptId)
        .maybeSingle();

    if (existing) {
        console.log(`${logPrefix} Receipt ${receiptId} already processed. Skipping.`);
        return;
    }

    // Fetch settings
    const { data: settings } = await supabase
        .from('shop_settings')
        .select('auto_sync_enabled, sync_direction, location_deduction_order, low_stock_threshold')
        .eq('shop_id', shop.id)
        .maybeSingle();

    if (!settings?.auto_sync_enabled) {
        console.log(`${logPrefix} Auto-sync disabled for shop ${shop.id}. Skipping.`);
        return;
    }

    const direction = settings.sync_direction || 'bidirectional';
    if (direction === 'shopify_to_etsy') {
        console.log(`${logPrefix} Direction is shopify_to_etsy. Skipping Etsy order processing.`);
        return;
    }

    const orderLimit = await canProcessMonthlyOrderSync(supabase, shop.id);
    if (!orderLimit.ok) {
        console.warn(`${logPrefix} Monthly order sync limit reached for shop ${shop.id}: ${orderLimit.current}/${orderLimit.limit}`);
        await supabase.from('sync_logs').insert({
            shop_id: shop.id,
            source: 'etsy',
            event_type: 'order',
            direction: 'etsy_to_shopify',
            status: 'skipped',
            error_message: orderLimit.message,
            metadata: {
                etsy_receipt_id: receiptId.toString(),
                source: 'webhook',
                plan: orderLimit.planName,
                monthly_order_sync_count: orderLimit.current,
                monthly_order_sync_limit: orderLimit.limit
            },
            created_at: new Date().toISOString()
        });
        return;
    }

    // Fetch receipt transactions from Etsy API
    const txData = await etsyApi.getReceiptTransactions(shop.etsy_shop_id, receiptId, shop.etsy_access_token);
    const transactions = txData.results || [];

    let itemsSynced = 0;

    for (const tx of transactions) {
        const listingId = tx.listing_id?.toString();
        const quantity = tx.quantity || 1;

        if (!listingId) continue;

        // Find matching inventory_item
        const { data: item } = await supabase
            .from('inventory_items')
            .select('id, master_stock, shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, shopify_inventory_item_id, selected_location_ids, location_inventory_map')
            .eq('shop_id', shop.id)
            .eq('etsy_listing_id', listingId)
            .maybeSingle();

        if (!item || !item.shopify_inventory_item_id) {
            console.log(`${logPrefix} No Shopify match for Etsy listing ${listingId}. Skipping.`);
            continue;
        }

        const itemStateBeforeOrder = classifyInventoryState({
            shopifyVariantId: item.shopify_variant_id,
            etsyVariantId: listingId,
            masterStock: item.master_stock,
            shopifyStock: item.shopify_stock_snapshot,
            etsyStock: item.etsy_stock_snapshot,
        });

        // Cascade Deduction: decrease Shopify stock across locations
        const newStock = Math.max(0, (item.master_stock || 0) - quantity);
        let deductionOrder: string[] = settings?.location_deduction_order || [];

        if (!deductionOrder || deductionOrder.length === 0) {
            if (item.selected_location_ids && item.selected_location_ids.length > 0) {
                deductionOrder = item.selected_location_ids;
            } else if (shop.main_location_id) {
                deductionOrder = [shop.main_location_id.toString()];
            }
        }

        if (itemStateBeforeOrder !== 'action_required' && deductionOrder.length > 0 && shop.access_token) {
            try {
                const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
                
                const levelsData = await shopifyApi.getInventoryLevels(creds, deductionOrder, item.shopify_inventory_item_id);
                const levels = (levelsData.inventory_levels || []).filter(
                    (l: any) => l.inventory_item_id.toString() === item.shopify_inventory_item_id
                );

                let remainingToDeduct = quantity;
                
                for (const locId of deductionOrder) {
                    if (remainingToDeduct <= 0) break;

                    const level = levels.find((l: any) => l.location_id.toString() === locId);
                    if (level) {
                        const currentShopifyStock = level.available || 0;
                        if (currentShopifyStock > 0) {
                            const deductAmount = Math.min(currentShopifyStock, remainingToDeduct);
                            const newShopifyStock = currentShopifyStock - deductAmount;
                            
                            await shopifyApi.setInventoryLevel(creds, locId, item.shopify_inventory_item_id, newShopifyStock);
                            console.log(`${logPrefix} ✅ Shopify location ${locId} stock: ${currentShopifyStock} → ${newShopifyStock} (-${deductAmount})`);
                            
                            remainingToDeduct -= deductAmount;
                        }
                    }
                }

                if (remainingToDeduct > 0) {
                    console.log(`${logPrefix} ⚠️ Could not deduct all stock. Remaining: ${remainingToDeduct}`);
                }
            } catch (shopifyErr: any) {
                console.error(`${logPrefix} ❌ Shopify cascade stock update failed:`, shopifyErr.message);
            }
        }

        // Update DB
        const oldStock = item.master_stock || 0;
        await supabase.from('inventory_items').update({
            master_stock: newStock,
            etsy_stock_snapshot: Math.max(0, (item.master_stock || 0) - quantity),
            etsy_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', item.id);

        const threshold = settings?.low_stock_threshold || 0;
        if (newStock === 0) {
            await createNotification(
                supabase,
                shop.id,
                'stock_zero',
                'Stock Reached Zero',
                `Product (Item ID: ${item.shopify_inventory_item_id}) is out of stock after an Etsy order.`,
                '/dashboard/inventory'
            );
        } else if (threshold > 0 && newStock <= threshold && oldStock > threshold) {
            await createNotification(
                supabase,
                shop.id,
                'oversell_risk',
                'Low Stock Alert',
                `Product (Item ID: ${item.shopify_inventory_item_id}) dropped to ${newStock} units after an Etsy order.`,
                '/dashboard/inventory'
            );
        }

        itemsSynced++;
    }

    // Log the receipt
    await supabase.from('sync_logs').insert({
        shop_id: shop.id,
        source: 'etsy',
        event_type: 'order',
        direction: 'etsy_to_shopify',
        status: 'success',
        metadata: {
            etsy_receipt_id: receiptId,
            transaction_count: transactions.length,
            source: 'webhook' // Distinguish from cron-processed orders
        },
        created_at: new Date().toISOString()
    });

    console.log(`${logPrefix} ✅ Receipt ${receiptId} processed. ${itemsSynced} items synced.`);
}
