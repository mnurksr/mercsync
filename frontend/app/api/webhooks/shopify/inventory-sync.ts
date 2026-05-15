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
import { canProcessMonthlyOrderSync } from '@/utils/planLimits';
import { classifyInventoryState } from '@/utils/inventoryStatus';

type SyncResult = {
    status: 'success' | 'failed' | 'skipped';
    message: string;
};

type ShopifyShopContext = {
    id: string;
    shop_domain: string;
    access_token: string | null;
    etsy_access_token?: string | null;
    owner_id?: string | null;
    main_location_id?: string | number | null;
};

type ShopifyInventoryItem = {
    id: string;
    name?: string | null;
    master_stock: number | null;
    shopify_stock_snapshot: number | null;
    etsy_stock_snapshot?: number | null;
    shopify_inventory_item_id?: string | null;
    selected_location_ids?: string[] | null;
    etsy_listing_id?: string | null;
    etsy_variant_id?: string | null;
    shopify_variant_id?: string | null;
};

function getTrackedLocationIds(shop: ShopifyShopContext, item: ShopifyInventoryItem): string[] {
    if (Array.isArray(item.selected_location_ids) && item.selected_location_ids.length > 0) {
        return item.selected_location_ids.map(id => id.toString());
    }

    if (shop.main_location_id) {
        return [shop.main_location_id.toString()];
    }

    return [];
}

async function getCurrentShopifyTrackedStock(
    shop: ShopifyShopContext,
    item: ShopifyInventoryItem
): Promise<number> {
    if (!shop.access_token || !item.shopify_inventory_item_id) {
        return Math.max(0, Number(item.shopify_stock_snapshot ?? item.master_stock ?? 0));
    }

    const trackedLocationIds = getTrackedLocationIds(shop, item);
    if (trackedLocationIds.length === 0) {
        return Math.max(0, Number(item.shopify_stock_snapshot ?? item.master_stock ?? 0));
    }

    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
    const levelsData = await shopifyApi.getInventoryLevels(creds, trackedLocationIds, item.shopify_inventory_item_id);
    const levels = Array.isArray(levelsData?.inventory_levels) ? levelsData.inventory_levels : [];

    return levels
        .filter((level: any) => level.inventory_item_id?.toString() === item.shopify_inventory_item_id?.toString())
        .reduce((sum: number, level: any) => sum + Math.max(0, Number(level.available || 0)), 0);
}

async function pushStockToEtsy(
    shop: ShopifyShopContext,
    item: ShopifyInventoryItem,
    newStock: number
): Promise<boolean> {
    if (!shop.etsy_access_token || !item.etsy_listing_id || !item.etsy_variant_id) {
        return false;
    }

    const currentInventory = await etsyApi.getInventory(item.etsy_listing_id, shop.etsy_access_token);
    const updatedPayload = etsyApi.mergeStockUpdate(currentInventory, [
        { item_id: item.etsy_variant_id.toString(), new_stock: newStock }
    ]);
    await etsyApi.updateInventory(item.etsy_listing_id, shop.etsy_access_token, updatedPayload);
    return true;
}

async function processShopifyRestockEvent(
    payload: {
        id?: number | string;
        order_id?: number | string;
        line_items?: Array<{ variant_id?: number | string | null; quantity?: number | null }>;
        refund_line_items?: Array<{
            quantity?: number | null;
            line_item_id?: number | string | null;
            line_item?: { id?: number | string | null; variant_id?: number | string | null } | null;
        }>;
    },
    shopDomain: string,
    supabase: SupabaseClient,
    reason: 'cancelled' | 'refund'
): Promise<SyncResult> {
    const shopIdentifier = reason === 'cancelled' ? payload.id?.toString() : payload.order_id?.toString();
    const logPrefix = reason === 'cancelled' ? '[Shopify Cancel Sync]' : '[Shopify Refund Sync]';

    if (!shopIdentifier) {
        return { status: 'failed', message: 'Missing order identifier' };
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, access_token, etsy_access_token, owner_id, main_location_id')
        .eq('shop_domain', shopDomain)
        .maybeSingle();

    if (!shop) {
        return { status: 'failed', message: 'Shop not found' };
    }

    const variantQuantities = new Map<string, number>();

    if (reason === 'refund') {
        const refundLineItems = payload.refund_line_items || [];
        const creds = shop.access_token ? { shopDomain: shop.shop_domain, accessToken: shop.access_token } : null;
        const orderLineItemVariantMap = new Map<string, string>();

        if (creds && payload.order_id) {
            try {
                const orderData = await shopifyApi.getOrder(creds, payload.order_id);
                for (const lineItem of orderData?.order?.line_items || []) {
                    if (lineItem?.id && lineItem?.variant_id) {
                        orderLineItemVariantMap.set(lineItem.id.toString(), lineItem.variant_id.toString());
                    }
                }
            } catch (err: any) {
                console.error(`${logPrefix} Failed to fetch order ${payload.order_id} for refund mapping:`, err.message);
            }
        }

        for (const lineItem of refundLineItems) {
            const lineItemId = lineItem?.line_item_id?.toString() || lineItem?.line_item?.id?.toString();
            const variantId =
                lineItem?.line_item?.variant_id?.toString()
                || (lineItemId ? orderLineItemVariantMap.get(lineItemId) : undefined);
            const quantity = Number(lineItem?.quantity || 0);
            if (!variantId || quantity <= 0) continue;
            variantQuantities.set(variantId, (variantQuantities.get(variantId) || 0) + quantity);
        }
    } else {
        for (const lineItem of payload.line_items || []) {
            const variantId = lineItem?.variant_id?.toString();
            const quantity = Number(lineItem?.quantity || 0);
            if (!variantId || quantity <= 0) continue;
            variantQuantities.set(variantId, (variantQuantities.get(variantId) || 0) + quantity);
        }
    }

    if (variantQuantities.size === 0) {
        return { status: 'skipped', message: 'No refundable/cancelled line items matched variants' };
    }

    const { data: settings } = await supabase
        .from('shop_settings')
        .select('auto_sync_enabled, sync_direction')
        .eq('shop_id', shop.id)
        .maybeSingle();

    const canPushToEtsy = !!settings?.auto_sync_enabled && (settings.sync_direction || 'bidirectional') !== 'etsy_to_shopify';
    let restoredItems = 0;
    let skippedItems = 0;
    let failedItems = 0;

    for (const variantId of variantQuantities.keys()) {
        const { data: item } = await supabase
            .from('inventory_items')
            .select('id, name, master_stock, shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, shopify_inventory_item_id, selected_location_ids, etsy_listing_id, etsy_variant_id')
            .eq('shop_id', shop.id)
            .eq('shopify_variant_id', variantId)
            .maybeSingle();

        if (!item) {
            skippedItems++;
            continue;
        }

        let sourceShopifyStock = Math.max(0, Number(item.shopify_stock_snapshot ?? item.master_stock ?? 0));
        try {
            sourceShopifyStock = await getCurrentShopifyTrackedStock(shop, item);
        } catch (err: any) {
            console.error(`${logPrefix} Failed to fetch live Shopify stock for variant ${variantId}:`, err.message);
        }

        const itemStateBeforeSync = classifyInventoryState({
            shopifyVariantId: variantId,
            etsyVariantId: item.etsy_variant_id,
            masterStock: item.master_stock,
            shopifyStock: item.shopify_stock_snapshot,
            etsyStock: item.etsy_stock_snapshot,
        });

        const updatePayload: Record<string, unknown> = {
            master_stock: sourceShopifyStock,
            shopify_stock_snapshot: sourceShopifyStock,
            updated_at: new Date().toISOString(),
            shopify_updated_at: new Date().toISOString(),
        };

        let pushedToEtsy = false;
        if (itemStateBeforeSync !== 'action_required' && canPushToEtsy) {
            try {
                pushedToEtsy = await pushStockToEtsy(shop, item, sourceShopifyStock);
                if (pushedToEtsy) {
                    updatePayload.etsy_stock_snapshot = sourceShopifyStock;
                    updatePayload.etsy_updated_at = new Date().toISOString();
                }
            } catch (err: any) {
                failedItems++;
                await createNotification(
                    supabase,
                    shop.id,
                    'sync_failed',
                    reason === 'cancelled' ? 'Shopify Cancellation Restock Failed' : 'Shopify Refund Restock Failed',
                    `Failed to push restocked stock to Etsy. Error: ${err.message}`,
                    '/dashboard/history'
                );
            }
        } else {
            skippedItems++;
        }

        await supabase.from('inventory_items').update(updatePayload).eq('id', item.id);
        restoredItems++;
    }

    const status = failedItems > 0 ? 'failed' : restoredItems > 0 ? 'success' : 'skipped';
    await logSyncEvent(supabase, {
        shop_id: shop.id,
        source: 'shopify',
        event_type: 'order_cancel',
        direction: 'shopify_to_etsy',
        status,
        error_message: failedItems > 0 ? 'One or more restock updates failed during Shopify cancellation/refund sync.' : null,
        metadata: {
            shopify_order_id: shopIdentifier,
            reason,
            restored_items: restoredItems,
            skipped_items: skippedItems,
            failed_items: failedItems,
            variant_count: variantQuantities.size,
            order_items: Array.from(variantQuantities.entries()).map(([variant_id, quantity]) => ({ variant_id, quantity }))
        }
    });

    return {
        status,
        message: status === 'success'
            ? `Processed Shopify ${reason} ${shopIdentifier}`
            : failedItems > 0
                ? `Shopify ${reason} processed with failures`
                : `Shopify ${reason} required no outbound restock`
    };
}

/**
 * Handle an inventory_levels/update webhook from Shopify.
 *
 * Flow:
 * 1. Find shop + settings
 * 2. Find matching inventory_item in DB
 * 3. Fetch ALL inventory levels for this item across selected locations from Shopify API
 * 4. Aggregate total stock = sum of all selected locations
 * 5. Evaluate low_stock_threshold → send notification if stock is below
 * 6. Update DB only (manual platform changes should not sync the opposite platform)
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
            const levelsData = await shopifyApi.getInventoryLevels(creds, locationIdsToQuery, inventoryItemId);
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

        // Passive inventory refresh only: manual platform edits should update local DB
        // without generating sync logs or cross-platform side effects.

        // ── 7. Update DB records only ──
        const dbUpdate: any = {
            master_stock: effectiveStock,
            shopify_stock_snapshot: totalShopifyStock,
            location_inventory_map: locationMap,
            shopify_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { error: updateError } = await supabase
            .from('inventory_items')
            .update(dbUpdate)
            .eq('id', item.id);

        if (updateError) {
            console.error(`${logPrefix} DB update failed:`, updateError);
        }

        return {
            status: 'success',
            message: `Local stock updated: ${oldStock} → ${effectiveStock} (from ${locationMap.length} tracked locations)`
        };

    } catch (err: any) {
        console.error(`${logPrefix} Fatal error:`, err);
        return { status: 'failed', message: err.message };
    }
}

export async function handleShopifyOrder(
    payload: {
        id: number | string;
        line_items?: Array<{ variant_id?: number | string | null; quantity?: number | null }>;
    },
    shopDomain: string,
    supabase: SupabaseClient
): Promise<SyncResult> {
    const logPrefix = '[Shopify Order Sync]';
    const orderId = payload.id?.toString();

    if (!orderId) {
        return { status: 'failed', message: 'Missing order id' };
    }

    try {
        const { data: shop } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, etsy_access_token, owner_id, main_location_id')
            .eq('shop_domain', shopDomain)
            .maybeSingle();

        if (!shop) {
            return { status: 'failed', message: 'Shop not found' };
        }

        const { data: existing } = await supabase
            .from('sync_logs')
            .select('id')
            .eq('shop_id', shop.id)
            .eq('event_type', 'order')
            .eq('metadata->>shopify_order_id', orderId)
            .maybeSingle();

        if (existing) {
            return { status: 'skipped', message: 'Order already processed' };
        }

        const { data: settings } = await supabase
            .from('shop_settings')
            .select('auto_sync_enabled, sync_direction, low_stock_threshold')
            .eq('shop_id', shop.id)
            .maybeSingle();

        const canPushToEtsy = !!settings?.auto_sync_enabled && (settings.sync_direction || 'bidirectional') !== 'etsy_to_shopify';
        const quota = canPushToEtsy ? await canProcessMonthlyOrderSync(supabase, shop.id) : null;
        const canUseOrderQuota = !quota || quota.ok;

        let syncedItems = 0;
        let failedItems = 0;
        let skippedItems = 0;
        let touchedItems = 0;

        const variantQuantities = new Map<string, number>();
        for (const lineItem of payload.line_items || []) {
            const variantId = lineItem.variant_id?.toString();
            const quantity = Number(lineItem.quantity || 0);

            if (!variantId || quantity <= 0) {
                continue;
            }

            variantQuantities.set(variantId, (variantQuantities.get(variantId) || 0) + quantity);
        }

        for (const [variantId, quantity] of variantQuantities.entries()) {
            const { data: item } = await supabase
                .from('inventory_items')
                .select('id, name, master_stock, shopify_stock_snapshot, etsy_stock_snapshot, shopify_inventory_item_id, selected_location_ids, etsy_listing_id, etsy_variant_id')
                .eq('shop_id', shop.id)
                .eq('shopify_variant_id', variantId)
                .maybeSingle();

            if (!item) {
                skippedItems++;
                continue;
            }

            const itemStateBeforeOrder = classifyInventoryState({
                shopifyVariantId: variantId,
                etsyVariantId: item.etsy_variant_id,
                masterStock: item.master_stock,
                shopifyStock: item.shopify_stock_snapshot,
                etsyStock: item.etsy_stock_snapshot,
            });

            let currentShopifyTotal = Math.max(0, Number(item.shopify_stock_snapshot ?? item.master_stock ?? 0));
            try {
                currentShopifyTotal = await getCurrentShopifyTrackedStock(shop, item);
            } catch (err: any) {
                console.error(`${logPrefix} Failed to fetch live Shopify inventory for variant ${variantId}:`, err.message);
                currentShopifyTotal = Math.max(0, Number(item.shopify_stock_snapshot ?? item.master_stock ?? 0) - quantity);
            }

            const newStock = currentShopifyTotal;
            const updatePayload: Record<string, unknown> = {
                master_stock: newStock,
                shopify_stock_snapshot: newStock,
                updated_at: new Date().toISOString(),
                shopify_updated_at: new Date().toISOString()
            };

            let pushedToEtsy = false;

            if (itemStateBeforeOrder === 'action_required') {
                skippedItems++;
            } else if (canPushToEtsy && canUseOrderQuota && item.etsy_listing_id && item.etsy_variant_id && shop.etsy_access_token) {
                try {
                    await pushStockToEtsy(shop, item, newStock);
                    updatePayload.etsy_stock_snapshot = newStock;
                    updatePayload.etsy_updated_at = new Date().toISOString();
                    pushedToEtsy = true;
                } catch (err: any) {
                    failedItems++;
                    await createNotification(
                        supabase,
                        shop.id,
                        'sync_failed',
                        'Shopify Order Sync Failed',
                        `Failed to push Shopify order stock update to Etsy. Error: ${err.message}`,
                        `/dashboard/history`
                    );
                }
            } else if (!canPushToEtsy || !canUseOrderQuota) {
                skippedItems++;
            }

            await supabase
                .from('inventory_items')
                .update(updatePayload)
                .eq('id', item.id);

            touchedItems++;

            if (newStock === 0) {
                await createNotification(
                    supabase,
                    shop.id,
                    'stock_zero',
                    'Stock Reached Zero',
                    `A Shopify sale reduced an item to 0 stock.`,
                    `/dashboard/inventory`
                );
            } else if ((settings?.low_stock_threshold || 0) > 0 && newStock <= (settings?.low_stock_threshold || 0)) {
                await createNotification(
                    supabase,
                    shop.id,
                    'oversell_risk',
                    'Low Stock Alert',
                    `A Shopify sale reduced an item to ${newStock} units.`,
                    `/dashboard/inventory`
                );
            }

            if (pushedToEtsy) {
                syncedItems++;
            }
        }

        const orderItems = Array.from(variantQuantities.entries()).map(([variantId, quantity]) => ({
            variant_id: variantId,
            quantity,
        }));

        const { data: loggedItems } = await supabase
            .from('inventory_items')
            .select('shopify_variant_id, name')
            .eq('shop_id', shop.id)
            .in('shopify_variant_id', orderItems.map(item => item.variant_id));

        const itemNameMap = new Map<string, string>();
        for (const entry of loggedItems || []) {
            itemNameMap.set(entry.shopify_variant_id?.toString(), entry.name || 'Unnamed Product');
        }

        const status = failedItems > 0 ? 'failed' : syncedItems > 0 ? 'success' : 'skipped';
        const skipReason = status === 'skipped'
            ? !canPushToEtsy
                ? 'Auto-sync disabled or direction blocks Shopify -> Etsy order sync.'
                : !canUseOrderQuota
                    ? quota?.message || 'Monthly order sync limit reached.'
                    : 'Matched items were blocked by action-required state or missing Etsy links.'
            : null;
        const errorMessage = !canUseOrderQuota && quota?.message
            ? quota.message
            : failedItems > 0
                ? 'One or more Etsy updates failed during Shopify order sync.'
                : null;

        await logSyncEvent(supabase, {
            shop_id: shop.id,
            source: 'shopify',
            event_type: 'order',
            direction: 'shopify_to_etsy',
            status,
            error_message: errorMessage,
            metadata: {
                shopify_order_id: orderId,
                line_items: (payload.line_items || []).length,
                unique_variants: variantQuantities.size,
                touched_items: touchedItems,
                order_items: orderItems.map(item => ({
                    ...item,
                    name: itemNameMap.get(item.variant_id) || 'Unnamed Product'
                })),
                synced_items: syncedItems,
                failed_items: failedItems,
                skipped_items: skippedItems,
                action_required_blocked: skippedItems > 0,
                quota_limited: !canUseOrderQuota,
                auto_sync_enabled: !!settings?.auto_sync_enabled,
                sync_direction: settings?.sync_direction || 'bidirectional',
                can_push_to_etsy: canPushToEtsy,
                skip_reason: skipReason
            }
        });

        return {
            status,
            message: status === 'success'
                ? `Processed Shopify order ${orderId}`
                : errorMessage || 'Order processed without outbound sync'
        };
    } catch (err: any) {
        console.error(`${logPrefix} Fatal error:`, err);
        return { status: 'failed', message: err.message };
    }
}

export async function handleShopifyOrderCancellation(
    payload: {
        id: number | string;
        line_items?: Array<{ variant_id?: number | string | null; quantity?: number | null }>;
    },
    shopDomain: string,
    supabase: SupabaseClient
): Promise<SyncResult> {
    return processShopifyRestockEvent(payload, shopDomain, supabase, 'cancelled');
}

export async function handleShopifyRefund(
    payload: {
        id: number | string;
        order_id?: number | string;
        refund_line_items?: Array<{ quantity?: number | null; line_item?: { variant_id?: number | string | null } | null }>;
    },
    shopDomain: string,
    supabase: SupabaseClient
): Promise<SyncResult> {
    return processShopifyRestockEvent(payload, shopDomain, supabase, 'refund');
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
