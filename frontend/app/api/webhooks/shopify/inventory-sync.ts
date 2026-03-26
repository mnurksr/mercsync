/**
 * Inventory Sync Engine
 * Processes Shopify inventory_levels/update webhook events
 * and propagates stock changes to Etsy based on shop_settings.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as etsyApi from '../../sync/lib/etsy';

type SyncResult = {
    status: 'success' | 'failed' | 'skipped';
    message: string;
};

/**
 * Handle an inventory_levels/update webhook from Shopify.
 * 
 * Flow:
 * 1. Find matching inventory_item in DB via shopify_inventory_item_id
 * 2. Check shop_settings (auto_sync, direction)
 * 3. Apply stock_buffer
 * 4. Push to Etsy if matched
 * 5. Update DB records
 * 6. Log to sync_logs
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
    const locationId = payload.location_id.toString();
    const newAvailable = payload.available;

    console.log(`${logPrefix} Processing: inventory_item=${inventoryItemId}, location=${locationId}, available=${newAvailable}, shop=${shopDomain}`);

    try {
        // 1. Find the shop
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, etsy_shop_id, main_location_id, owner_id')
            .eq('shop_domain', shopDomain)
            .single();

        if (shopError || !shop) {
            console.error(`${logPrefix} Shop not found for domain: ${shopDomain}`);
            return { status: 'failed', message: 'Shop not found' };
        }

        // 2. Check shop_settings
        const { data: settings } = await supabase
            .from('shop_settings')
            .select('auto_sync_enabled, sync_direction, stock_buffer')
            .eq('shop_id', shop.id)
            .single();

        if (!settings?.auto_sync_enabled) {
            console.log(`${logPrefix} Auto-sync disabled for shop ${shop.id}. Skipping.`);
            await logSyncEvent(supabase, {
                shop_id: shop.id,
                source: 'shopify',
                event_type: 'stock_update',
                old_stock: null,
                new_stock: newAvailable,
                status: 'skipped',
                error_message: 'Auto-sync disabled',
                metadata: { inventory_item_id: inventoryItemId, location_id: locationId }
            });
            return { status: 'skipped', message: 'Auto-sync is disabled' };
        }

        // Check direction — must allow shopify → etsy
        const direction = settings.sync_direction || 'bidirectional';
        if (direction === 'etsy_to_shopify') {
            console.log(`${logPrefix} Sync direction is etsy_to_shopify; ignoring Shopify webhook.`);
            await logSyncEvent(supabase, {
                shop_id: shop.id,
                source: 'shopify',
                event_type: 'stock_update',
                old_stock: null,
                new_stock: newAvailable,
                status: 'skipped',
                error_message: 'Sync direction does not allow Shopify → Etsy',
                metadata: { inventory_item_id: inventoryItemId, direction }
            });
            return { status: 'skipped', message: 'Direction mismatch' };
        }

        // 3. Find matching inventory_item in DB
        const { data: item, error: itemError } = await supabase
            .from('inventory_items')
            .select('id, master_stock, etsy_listing_id, etsy_variant_id, shopify_stock_snapshot, etsy_stock_snapshot, selected_location_ids, location_inventory_map')
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

        // 4. Check if this location is relevant (selected locations)
        const selectedLocations: string[] = item.selected_location_ids || [];
        const mainLocationId = shop.main_location_id?.toString();

        // If location tracking is configured, only process relevant locations
        if (selectedLocations.length > 0 && !selectedLocations.includes(locationId) && mainLocationId !== locationId) {
            console.log(`${logPrefix} Location ${locationId} not in selected locations. Ignoring.`);
            return { status: 'skipped', message: 'Location not selected for sync' };
        }

        // 5. Calculate effective stock with buffer
        const stockBuffer = settings.stock_buffer || 0;
        const effectiveStock = Math.max(0, newAvailable - stockBuffer);
        const oldStock = item.master_stock || 0;

        // Skip if stock hasn't actually changed (accounting for buffer)
        if (effectiveStock === oldStock) {
            console.log(`${logPrefix} Stock unchanged after buffer (${effectiveStock}). Skipping.`);
            return { status: 'skipped', message: 'Stock unchanged after buffer' };
        }

        console.log(`${logPrefix} Stock change detected: ${oldStock} → ${effectiveStock} (raw: ${newAvailable}, buffer: ${stockBuffer})`);

        // 6. Update location_inventory_map in DB
        const locationMap: any[] = Array.isArray(item.location_inventory_map) ? [...item.location_inventory_map] : [];
        const locEntry = locationMap.find(l => l.location_id?.toString() === locationId);
        if (locEntry) {
            locEntry.stock = newAvailable;
            locEntry.updated_at = new Date().toISOString();
        } else {
            locationMap.push({ location_id: locationId, stock: newAvailable, updated_at: new Date().toISOString() });
        }

        // 7. Push to Etsy if matched
        let etsySyncResult: 'success' | 'failed' | 'skipped' = 'skipped';
        let etsyError: string | null = null;

        if (item.etsy_listing_id && item.etsy_variant_id && shop.etsy_access_token) {
            try {
                console.log(`${logPrefix} Pushing to Etsy: listing=${item.etsy_listing_id}, variant=${item.etsy_variant_id}, stock=${effectiveStock}`);

                const currentInventory = await etsyApi.getInventory(item.etsy_listing_id, shop.etsy_access_token);
                const updatedPayload = etsyApi.mergeStockUpdate(currentInventory, [
                    { item_id: item.etsy_variant_id.toString(), new_stock: effectiveStock }
                ]);
                await etsyApi.updateInventory(item.etsy_listing_id, shop.etsy_access_token, updatedPayload);

                etsySyncResult = 'success';
                console.log(`${logPrefix} ✅ Etsy stock updated to ${effectiveStock}`);
            } catch (err: any) {
                etsySyncResult = 'failed';
                etsyError = err.message;
                console.error(`${logPrefix} ❌ Etsy push failed:`, err.message);
            }
        } else {
            console.log(`${logPrefix} No Etsy match for this item. Updating DB only.`);
        }

        // 8. Update DB records
        const dbUpdate: any = {
            master_stock: effectiveStock,
            shopify_stock_snapshot: newAvailable,
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

        // 9. Log the sync event
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
                raw_available: newAvailable,
                stock_buffer: stockBuffer,
                location_id: locationId,
                etsy_listing_id: item.etsy_listing_id,
                etsy_variant_id: item.etsy_variant_id,
                etsy_push: etsySyncResult
            }
        });

        return {
            status: etsySyncResult === 'failed' ? 'failed' : 'success',
            message: etsySyncResult === 'failed'
                ? `DB updated but Etsy push failed: ${etsyError}`
                : `Synced: ${oldStock} → ${effectiveStock}`
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
