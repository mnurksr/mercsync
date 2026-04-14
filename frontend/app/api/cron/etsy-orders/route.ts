/**
 * Etsy Order Polling Cron
 * 
 * Etsy has no webhooks, so we poll for recent receipts every 15 minutes.
 * When a new Etsy order is found, we decrease Shopify stock accordingly.
 * 
 * Protected by CRON_SECRET header.
 * Trigger: GET /api/cron/etsy-orders?secret=CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';

const POLL_WINDOW_MS = 20 * 60 * 1000; // 20 minutes overlap to avoid missing orders

export async function GET(req: NextRequest) {
    const logPrefix = '[Etsy Order Sync]';

    // Auth check
    const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    try {
        // 1. Get all active shops with Etsy connected
        const { data: shops, error: shopsError } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id, last_etsy_order_check_at')
            .eq('is_active', true)
            .eq('etsy_connected', true)
            .not('etsy_access_token', 'is', null)
            .not('etsy_shop_id', 'is', null);

        if (shopsError || !shops || shops.length === 0) {
            console.log(`${logPrefix} No active Etsy shops found.`);
            return NextResponse.json({ status: 'ok', message: 'No shops to poll', shops_processed: 0 });
        }

        console.log(`${logPrefix} Polling ${shops.length} shops for new Etsy orders...`);

        let totalOrdersProcessed = 0;
        let totalItemsSynced = 0;

        for (const shop of shops) {
            try {
                // 2. Check settings
                const { data: settings } = await supabase
                    .from('shop_settings')
                    .select('auto_sync_enabled, sync_direction, location_deduction_order')
                    .eq('shop_id', shop.id)
                    .maybeSingle();

                if (!settings?.auto_sync_enabled) {
                    console.log(`${logPrefix} Auto-sync disabled for shop ${shop.id}. Skipping.`);
                    continue;
                }

                // Must allow etsy → shopify direction
                const direction = settings.sync_direction || 'bidirectional';
                if (direction === 'shopify_to_etsy') {
                    console.log(`${logPrefix} Direction is shopify_to_etsy for shop ${shop.id}. Skipping.`);
                    continue;
                }

                // 3. Calculate min_created timestamp
                const lastCheck = shop.last_etsy_order_check_at
                    ? new Date(shop.last_etsy_order_check_at).getTime()
                    : Date.now() - POLL_WINDOW_MS;

                const minCreated = Math.floor((lastCheck - (5 * 60 * 1000)) / 1000); // 5min overlap buffer

                // 4. Fetch recent receipts from Etsy
                const receiptsData = await etsyApi.getShopReceipts(shop.etsy_shop_id, shop.etsy_access_token, minCreated);
                const receipts = receiptsData.results || [];

                if (receipts.length === 0) {
                    console.log(`${logPrefix} No new receipts for shop ${shop.id}.`);
                    // Still update check timestamp
                    await supabase.from('shops').update({
                        last_etsy_order_check_at: new Date().toISOString()
                    }).eq('id', shop.id);
                    continue;
                }

                console.log(`${logPrefix} Found ${receipts.length} receipts for shop ${shop.id}`);

                // 5. Process each receipt
                for (const receipt of receipts) {
                    const receiptId = receipt.receipt_id;

                    // Skip if already processed (check sync_logs)
                    const { data: existing } = await supabase
                        .from('sync_logs')
                        .select('id')
                        .eq('shop_id', shop.id)
                        .eq('event_type', 'order')
                        .eq('metadata->>etsy_receipt_id', receiptId.toString())
                        .maybeSingle();

                    if (existing) {
                        continue; // Already processed this receipt
                    }

                    // Get transactions (line items) for this receipt
                    const txData = await etsyApi.getReceiptTransactions(shop.etsy_shop_id, receiptId, shop.etsy_access_token);
                    const transactions = txData.results || [];

                    for (const tx of transactions) {
                        const listingId = tx.listing_id?.toString();
                        const quantity = tx.quantity || 1;
                        const variationData = tx.variations || [];

                        if (!listingId) continue;

                        // 6. Find matching inventory_item
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

                        // 7. Decrease Shopify stock using Cascade Deduction
                        const newStock = Math.max(0, (item.master_stock || 0) - quantity);
                        let deductionOrder: string[] = settings?.location_deduction_order || [];

                        // Fallback to selected locations or main location if no custom order
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
                                
                                // Fetch stock at all relevant locations to know where we can deduct
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
                                            
                                            // Execute push
                                            await shopifyApi.setInventoryLevel(creds, locId, item.shopify_inventory_item_id, newShopifyStock);
                                            console.log(`${logPrefix} ✅ Shopify location ${locId} stock decreased: ${currentShopifyStock} → ${newShopifyStock} (-${deductAmount})`);
                                            
                                            remainingToDeduct -= deductAmount;
                                        }
                                    }
                                }

                                // If still remaining, maybe the total Shopify stock was lower than ordered quantity.
                                if (remainingToDeduct > 0) {
                                    console.log(`${logPrefix} ⚠️ Could not deduct all stock. Remaining: ${remainingToDeduct}`);
                                }

                            } catch (shopifyErr: any) {
                                console.error(`${logPrefix} ❌ Shopify cascade stock update failed:`, shopifyErr.message);
                            }
                        }

                        // 8. Update DB
                        await supabase.from('inventory_items').update({
                            master_stock: newStock,
                            etsy_stock_snapshot: Math.max(0, (item.master_stock || 0) - quantity),
                            etsy_updated_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }).eq('id', item.id);

                        totalItemsSynced++;
                    }

                    // 9. Log the receipt
                    await supabase.from('sync_logs').insert({
                        shop_id: shop.id,
                        source: 'etsy',
                        event_type: 'order',
                        direction: 'etsy_to_shopify',
                        status: 'success',
                        metadata: {
                            etsy_receipt_id: receiptId.toString(),
                            transaction_count: transactions.length,
                            buyer_email: receipt.buyer_email || null
                        },
                        created_at: new Date().toISOString()
                    });

                    totalOrdersProcessed++;
                }

                // 10. Update last check timestamp
                await supabase.from('shops').update({
                    last_etsy_order_check_at: new Date().toISOString()
                }).eq('id', shop.id);

            } catch (shopErr: any) {
                console.error(`${logPrefix} Error processing shop ${shop.id}:`, shopErr.message);
                // Log error and continue to next shop
                await supabase.from('sync_logs').insert({
                    shop_id: shop.id,
                    source: 'etsy',
                    event_type: 'order',
                    status: 'failed',
                    error_message: shopErr.message,
                    created_at: new Date().toISOString()
                });
            }
        }

        console.log(`${logPrefix} Done. Orders: ${totalOrdersProcessed}, Items synced: ${totalItemsSynced}`);

        return NextResponse.json({
            status: 'ok',
            shops_processed: shops.length,
            orders_processed: totalOrdersProcessed,
            items_synced: totalItemsSynced
        });

    } catch (err: any) {
        console.error(`${logPrefix} Fatal error:`, err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
