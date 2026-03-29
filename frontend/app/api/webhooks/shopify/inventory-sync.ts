/**
 * Inventory Sync Engine
 * Processes Shopify inventory_levels/update webhook events
 * and propagates stock changes to Etsy based on shop_settings.
 *
 * IMPORTANT: Shopify webhooks send stock for a SINGLE location.
 * We must aggregate stock across ALL selected locations before syncing to Etsy.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
import { createNotification } from '../../../actions/notifications';

type SyncResult = {
    status: 'success' | 'failed' | 'skipped';
    message: string;
};

/**
 * Handle an inventory_levels/update webhook from Shopify.
 *
 * Flow:
 * 1. Find shop + settings, verify auto_sync and direction
 * 2. Find matching inventory_item in DB
 * 3. Fetch ALL inventory levels for this item across selected locations from Shopify API
 * 4. Aggregate total stock = sum of all selected locations
 * 5. Evaluate low_stock_threshold → send notification if stock is below
 * 6. Push effective_stock to Etsy if matched
 * 7. Update DB (master_stock, snapshots, location_map)
 * 8. Log to sync_logs
 */
export async function handleInventoryUpdate(
    payload: {
        inventory_item_id: number;
        location_id: number;
        available: number;
        updated_at?: string;
    },
    shopDomain: string,
    supabase: SupabaseClient
): Promise<SyncResult> {
    const logPrefix = '[Inventory Sync]';
    const inventoryItemId = payload.inventory_item_id.toString();
    const webhookLocationId = payload.location_id.toString();
    const webhookAvailable = payload.available;

    console.log(`${logPrefix} Webhook received: item=${inventoryItemId}, location=${webhookLocationId}, available=${webhookAvailable}, shop=${shopDomain}`);

    try {
        // ── 1. Find the shop ──
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id, owner_id')
            .eq('shop_domain', shopDomain)
            .maybeSingle();

        if (shopError || !shop) {
            console.error(`${logPrefix} Shop not found for domain: ${shopDomain}`);
            return { status: 'failed', message: 'Shop not found' };
        }

        // ── 2. Check shop_settings ──
        const { data: settings } = await supabase
            .from('shop_settings')
            .select('auto_sync_enabled, sync_direction, low_stock_threshold')
            .eq('shop_id', shop.id)
            .maybeSingle();

        if (!settings?.auto_sync_enabled) {
            console.log(`${logPrefix} Auto-sync disabled for shop ${shop.id}. Skipping.`);
            await logSyncEvent(supabase, {
                shop_id: shop.id,
                source: 'shopify',
                event_type: 'stock_update',
                status: 'skipped',
                error_message: 'Auto-sync disabled',
                metadata: { inventory_item_id: inventoryItemId, location_id: webhookLocationId }
            });
            return { status: 'skipped', message: 'Auto-sync is disabled' };
        }

        // Direction check — must allow Shopify → Etsy
        const direction = settings.sync_direction || 'bidirectional';
        if (direction === 'etsy_to_shopify') {
            console.log(`${logPrefix} Direction is etsy_to_shopify; ignoring Shopify webhook.`);
            await logSyncEvent(supabase, {
                shop_id: shop.id,
                source: 'shopify',
                event_type: 'stock_update',
                status: 'skipped',
                error_message: 'Direction does not allow Shopify → Etsy',
                metadata: { inventory_item_id: inventoryItemId, direction }
            });
            return { status: 'skipped', message: 'Direction mismatch' };
        }

        // ── 3. Find matching inventory_item in DB ──
        const { data: item, error: itemError } = await supabase
            .from('inventory_items')
            .select('id, master_stock, shopify_inventory_item_id, etsy_listing_id, etsy_variant_id, shopify_stock_snapshot, etsy_stock_snapshot, selected_location_ids, location_inventory_map')
            .eq('shop_id', shop.id)
            .eq('shopify_inventory_item_id', inventoryItemId)
            .maybeSingle();

        if (itemError) {
            console.error(`${logPrefix} DB error finding item:`, itemError);
            return { status: 'failed', message: `DB error: ${itemError.message}` };
        }

        if (!item) {
            console.log(`${logPrefix} No inventory_item found for shopify_inventory_item_id=${inventoryItemId}. Ignoring.`);
            return { status: 'skipped', message: 'No matching inventory item in DB' };
        }

        // ── 4. Determine which locations matter ──
        const selectedLocations: string[] = item.selected_location_ids || [];
        const mainLocationId = shop.main_location_id?.toString();

        // If this location isn't in selected or main, we don't care
        if (selectedLocations.length > 0 && !selectedLocations.includes(webhookLocationId) && mainLocationId !== webhookLocationId) {
            console.log(`${logPrefix} Location ${webhookLocationId} not in selected locations. Ignoring.`);
            return { status: 'skipped', message: 'Location not selected for sync' };
        }

        // ── 5. AGGREGATE: Fetch ALL inventory levels for selected locations from Shopify API ──
        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

        // Determine which location IDs to query
        let locationIdsToQuery: string[];
        if (selectedLocations.length > 0) {
            locationIdsToQuery = selectedLocations;
        } else if (mainLocationId) {
            locationIdsToQuery = [mainLocationId];
        } else {
            // Fallback: use webhook location only
            locationIdsToQuery = [webhookLocationId];
        }

        let totalShopifyStock = 0;
        const locationMap: { location_id: string; stock: number; updated_at: string }[] = [];

        try {
            // Fetch inventory levels from Shopify for all selected locations
            const levelsData = await shopifyApi.getInventoryLevels(creds, locationIdsToQuery);
            const allLevels = levelsData.inventory_levels || [];

            // Filter to only this inventory_item_id
            const relevantLevels = allLevels.filter(
                (level: any) => level.inventory_item_id.toString() === inventoryItemId
            );

            // Sum stock across all selected locations for this item
            for (const level of relevantLevels) {
                const locId = level.location_id.toString();
                const available = level.available || 0;
                totalShopifyStock += available;
                locationMap.push({
                    location_id: locId,
                    stock: available,
                    updated_at: new Date().toISOString()
                });
            }

            console.log(`${logPrefix} Aggregated stock from ${relevantLevels.length} locations: total=${totalShopifyStock} (locations: ${locationMap.map(l => `${l.location_id}=${l.stock}`).join(', ')})`);
        } catch (apiErr: any) {
            // If API call fails, fall back to using location_inventory_map + webhook value
            console.warn(`${logPrefix} Could not fetch live inventory levels, using fallback. Error: ${apiErr.message}`);

            const existingMap: any[] = Array.isArray(item.location_inventory_map) ? [...item.location_inventory_map] : [];

            // Update the webhook location in the map
            const existingEntry = existingMap.find(l => l.location_id?.toString() === webhookLocationId);
            if (existingEntry) {
                existingEntry.stock = webhookAvailable;
            } else {
                existingMap.push({ location_id: webhookLocationId, stock: webhookAvailable, updated_at: new Date().toISOString() });
            }

            // Sum from the map for selected locations
            totalShopifyStock = 0;
            for (const entry of existingMap) {
                const locId = entry.location_id?.toString();
                if (selectedLocations.length === 0 || selectedLocations.includes(locId) || locId === mainLocationId) {
                    totalShopifyStock += (entry.stock || 0);
                    locationMap.push({
                        location_id: locId,
                        stock: entry.stock || 0,
                        updated_at: entry.updated_at || new Date().toISOString()
                    });
                }
            }

            console.log(`${logPrefix} Fallback aggregation: total=${totalShopifyStock}`);
        }

        // ── 6. Calculate effective stock (1:1, no buffer) ──
        const effectiveStock = Math.max(0, totalShopifyStock);
        const oldStock = item.master_stock || 0;

        // Skip if total hasn't changed
        if (effectiveStock === oldStock) {
            console.log(`${logPrefix} Total stock unchanged (${effectiveStock}). Skipping Etsy push.`);
            // Still update the location map in DB
            await supabase.from('inventory_items').update({
                location_inventory_map: locationMap,
                shopify_stock_snapshot: totalShopifyStock,
                shopify_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', item.id);

            return { status: 'skipped', message: 'Total stock unchanged' };
        }

        console.log(`${logPrefix} Stock change: ${oldStock} → ${effectiveStock} (shopify total: ${totalShopifyStock})`);

        // --- Notification Triggers ---
        const lowStockThreshold = settings.low_stock_threshold || 0;

        if (effectiveStock === 0) {
            await createNotification(
                supabase,
                shop.id,
                'stock_zero',
                'Stock Reached Zero',
                `Product (Item ID: ${inventoryItemId}) is now out of stock on all platforms.`,
                `/dashboard/inventory`
            );
        } else if (lowStockThreshold > 0 && effectiveStock <= lowStockThreshold && oldStock > lowStockThreshold) {
            await createNotification(
                supabase,
                shop.id,
                'oversell_risk',
                'Low Stock Alert',
                `Product (Item ID: ${inventoryItemId}) dropped to ${effectiveStock} units — below your alert threshold of ${lowStockThreshold}.`,
                `/dashboard/inventory`
            );
        }

        // ── 7. Push to Etsy if matched ──
        let etsySyncResult: 'success' | 'failed' | 'skipped' = 'skipped';
        let etsyError: string | null = null;

        if (item.etsy_listing_id && item.etsy_variant_id && shop.etsy_access_token) {
            const MAX_RETRIES = 3;
            const BASE_DELAY_MS = 2000; // 2s, 4s, 8s

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`${logPrefix} Pushing to Etsy (attempt ${attempt}/${MAX_RETRIES}): listing=${item.etsy_listing_id}, variant=${item.etsy_variant_id}, stock=${effectiveStock}`);

                    const currentInventory = await etsyApi.getInventory(item.etsy_listing_id, shop.etsy_access_token);
                    const updatedPayload = etsyApi.mergeStockUpdate(currentInventory, [
                        { item_id: item.etsy_variant_id.toString(), new_stock: effectiveStock }
                    ]);
                    await etsyApi.updateInventory(item.etsy_listing_id, shop.etsy_access_token, updatedPayload);

                    etsySyncResult = 'success';
                    console.log(`${logPrefix} ✅ Etsy stock updated to ${effectiveStock} (attempt ${attempt})`);
                    break; // Success, exit retry loop
                } catch (err: any) {
                    const is409 = err.message?.includes('409') || err.message?.includes('being edited');
                    
                    if (is409 && attempt < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
                        console.warn(`${logPrefix} ⚠️ Etsy 409 conflict, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    
                    etsySyncResult = 'failed';
                    etsyError = err.message;
                    console.error(`${logPrefix} ❌ Etsy push failed after ${attempt} attempts:`, err.message);

                    // Trigger Sync Failure Notification
                    await createNotification(
                        supabase,
                        shop.id,
                        'sync_failed',
                        'Etsy Sync Failed',
                        `Failed to push stock update to Etsy listing ${item.etsy_listing_id}. Error: ${err.message}`,
                        `/dashboard/inventory`
                    );
                }
            }
        } else {
            console.log(`${logPrefix} No Etsy match for this item. Updating DB only.`);
        }

        // ── 8. Update DB records ──
        const dbUpdate: any = {
            master_stock: effectiveStock,
            shopify_stock_snapshot: totalShopifyStock,
            location_inventory_map: locationMap,
            shopify_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (etsySyncResult === 'success') {
            dbUpdate.etsy_stock_snapshot = effectiveStock;
            dbUpdate.etsy_updated_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
            .from('inventory_items')
            .update(dbUpdate)
            .eq('id', item.id);

        if (updateError) {
            console.error(`${logPrefix} DB update failed:`, updateError);
        }

        // ── 9. Log the sync event ──
        await logSyncEvent(supabase, {
            shop_id: shop.id,
            inventory_item_id: item.id,
            source: 'shopify',
            event_type: 'stock_update',
            direction: 'shopify_to_etsy',
            old_stock: oldStock,
            new_stock: effectiveStock,
            status: etsySyncResult === 'failed' ? 'failed' : 'success',
            error_message: etsyError,
            metadata: {
                shopify_total: totalShopifyStock,
                low_stock_threshold: lowStockThreshold,
                webhook_location_id: webhookLocationId,
                webhook_available: webhookAvailable,
                location_breakdown: locationMap,
                etsy_listing_id: item.etsy_listing_id,
                etsy_variant_id: item.etsy_variant_id,
                etsy_push: etsySyncResult
            }
        });

        return {
            status: etsySyncResult === 'failed' ? 'failed' : 'success',
            message: etsySyncResult === 'failed'
                ? `DB updated but Etsy push failed: ${etsyError}`
                : `Synced: ${oldStock} → ${effectiveStock} (from ${locationMap.length} locations, total Shopify: ${totalShopifyStock})`
        };

    } catch (err: any) {
        console.error(`${logPrefix} Fatal error:`, err);
        return { status: 'failed', message: err.message };
    }
}

/**
 * Helper to insert a sync_log entry
 */
async function logSyncEvent(supabase: SupabaseClient, entry: {
    shop_id: string;
    inventory_item_id?: string | null;
    source: string;
    event_type: string;
    direction?: string;
    old_stock?: number | null;
    new_stock?: number | null;
    status: string;
    error_message?: string | null;
    metadata?: any;
}) {
    try {
        await supabase.from('sync_logs').insert({
            shop_id: entry.shop_id,
            inventory_item_id: entry.inventory_item_id || null,
            source: entry.source,
            event_type: entry.event_type,
            direction: entry.direction || null,
            old_stock: entry.old_stock ?? null,
            new_stock: entry.new_stock ?? null,
            status: entry.status,
            error_message: entry.error_message || null,
            metadata: entry.metadata || {},
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Sync Log] Failed to write sync log:', err);
    }
}
