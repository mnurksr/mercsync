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

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
import crypto from 'crypto';

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
        console.log(`${logPrefix} Received event: ${eventType}`);

        switch (eventType) {
            case 'order.paid':
            case 'ORDER_PAID': // Legacy format support
                await handleOrderPaid(payload, supabase, logPrefix);
                break;

            case 'order.canceled':
            case 'ORDER_CANCELED':
                console.log(`${logPrefix} Order canceled: ${payload.receipt_id || 'unknown'}`);
                // Future: could restore stock here
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
    // Extract receipt_id — may be directly in payload OR embedded in resource_url
    let receiptId = payload.receipt_id?.toString();
    const resourceUrl = payload.resource_url || '';
    const etsyShopId = payload.shop_id?.toString() || '';

    // Parse receipt_id from resource_url if not directly available
    if (!receiptId && resourceUrl) {
        const receiptMatch = resourceUrl.match(/receipts\/(\d+)/);
        if (receiptMatch) {
            receiptId = receiptMatch[1];
        }
    }

    if (!receiptId) {
        console.log(`${logPrefix} No receipt_id found in payload or resource_url. Skipping.`);
        console.log(`${logPrefix} Payload keys: ${Object.keys(payload).join(', ')}`);
        return;
    }

    // Parse shop_id from resource_url if not in payload
    let parsedShopId = etsyShopId;
    if (!parsedShopId && resourceUrl) {
        const shopMatch = resourceUrl.match(/shops\/(\d+)/);
        if (shopMatch) {
            parsedShopId = shopMatch[1];
        }
    }

    console.log(`${logPrefix} Processing order.paid for receipt ${receiptId} (shop: ${parsedShopId})`);

    // 1. Find the shop
    let shop = null;
    
    if (parsedShopId) {
        const { data } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id')
            .eq('etsy_shop_id', parsedShopId)
            .eq('is_active', true)
            .maybeSingle();
        shop = data;
    }

    if (!shop) {
        // Fallback: find any active Etsy-connected shop
        const { data: shops } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id')
            .eq('is_active', true)
            .not('etsy_shop_id', 'is', null)
            .not('etsy_access_token', 'is', null);

        if (!shops || shops.length === 0) {
            console.log(`${logPrefix} No matching shop found for Etsy shop_id ${parsedShopId}`);
            return;
        }
        shop = shops[0];
    }

    return processReceipt(shop, receiptId, supabase, logPrefix);
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
        .select('auto_sync_enabled, sync_direction, location_deduction_order')
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
            .select('id, master_stock, shopify_inventory_item_id, selected_location_ids, location_inventory_map')
            .eq('shop_id', shop.id)
            .eq('etsy_listing_id', listingId)
            .maybeSingle();

        if (!item || !item.shopify_inventory_item_id) {
            console.log(`${logPrefix} No Shopify match for Etsy listing ${listingId}. Skipping.`);
            continue;
        }

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

        if (deductionOrder.length > 0 && shop.access_token) {
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
        await supabase.from('inventory_items').update({
            master_stock: newStock,
            etsy_stock_snapshot: Math.max(0, (item.master_stock || 0) - quantity),
            etsy_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', item.id);

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
