'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type PlatformVariant = {
    id: string
    title: string
    sku: string | null
    price: number
    stock: number
    otherStock?: number // Stock on the other platform if matched
    imageUrl: string | null
    isMatched: boolean
    dbId: string
    shopifyProductId?: string
    shopifyVariantId?: string
    etsyListingId?: string
    etsyVariantId?: string
}

export type ListingItem = {
    id: string
    title: string
    imageUrl: string | null
    totalStock: number
    otherTotalStock?: number
    variantsCount: number
    platformStatus: string
    matchStatus: 'synced' | 'unmatched' | 'partially_matched'
    platform: 'shopify' | 'etsy'
    variants: PlatformVariant[]
    shopDomain: string
    etsyShopId?: string
}

export type InventoryItem = {
    id: string
    sku: string
    name: string | null
    master_stock: number
    updated_at: string
    image_url: string | null
    status: string | null
    shopify_variant_id: string | null
    etsy_variant_id: string | null
    shopify_product_id: string | null
    etsy_listing_id: string | null
    shop_id: string
    shop_domain: string | null
    shopify_stock_snapshot: number
    etsy_stock_snapshot: number
    shopify_updated_at: string | null
    etsy_updated_at: string | null
    location_inventory_map: any
    selected_location_ids: string[] | null
    shop?: {
        main_location_id: string;
    }
}

/**
 * Get the current user ID securely via server context
 */
export async function getUserId(): Promise<string | null> {
    const { ownerId } = await getValidatedUserContext()
    return ownerId
}

/**
 * Get products from staging tables grouped by listing
 */
export async function getPlatformListings(platform: 'shopify' | 'etsy', searchQuery?: string, ownerId?: string): Promise<ListingItem[]> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) return []
    }

    // Get shop ID and details
    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, etsy_shop_id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle()

    if (!shop) return []

    const tableName = platform === 'shopify' ? 'staging_shopify_products' : 'staging_etsy_products'
    const otherTableName = platform === 'shopify' ? 'staging_etsy_products' : 'staging_shopify_products'
    const parentIdField = platform === 'shopify' ? 'shopify_product_id' : 'etsy_listing_id'

    let query = supabase
        .from(tableName)
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })

    if (searchQuery) {
        query = query.or(`product_title.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
    }

    const { data: items, error } = await query

    if (error) {
        console.error(`Error fetching listings for ${platform}:`, error)
        return []
    }

    // Fetch the "other" platform stocks for matched variants
    const matchedOtherIds = (items || [])
        .map(i => platform === 'shopify' ? i.etsy_variant_id : i.shopify_variant_id)
        .filter(Boolean);

    let otherStocksMap: { [key: string]: number } = {};
    if (matchedOtherIds.length > 0) {
        const otherIdField = platform === 'shopify' ? 'etsy_variant_id' : 'shopify_variant_id';
        const { data: otherItems } = await supabase
            .from(otherTableName)
            .select(`${otherIdField}, stock_quantity`)
            .in(otherIdField, matchedOtherIds);

        if (otherItems) {
            otherItems.forEach((oi: any) => {
                otherStocksMap[oi[otherIdField]] = oi.stock_quantity || 0;
            });
        }
    }

    // Group variants into Listings
    const groups: { [key: string]: ListingItem } = {};

    (items || []).forEach(item => {
        const groupId = item[parentIdField] || item.id;
        const otherVariantId = platform === 'shopify' ? item.etsy_variant_id : item.shopify_variant_id;
        const isMatched = !!otherVariantId;
        const otherStock = isMatched ? (otherStocksMap[otherVariantId] || 0) : undefined;

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                title: item.product_title || item.name || 'Unnamed Product',
                imageUrl: item.image_url,
                totalStock: 0,
                otherTotalStock: 0,
                variantsCount: 0,
                platformStatus: item.status || 'unknown',
                matchStatus: 'synced',
                platform,
                variants: [],
                shopDomain: shop.shop_domain,
                etsyShopId: shop.etsy_shop_id
            };
        }

        groups[groupId].variants.push({
            id: platform === 'shopify' ? item.shopify_variant_id : item.etsy_variant_id,
            dbId: item.id,
            title: item.variant_title || 'Default Title',
            sku: item.sku,
            price: item.price || 0,
            stock: item.stock_quantity || 0,
            otherStock,
            imageUrl: item.image_url,
            isMatched,
            shopifyProductId: item.shopify_product_id,
            shopifyVariantId: item.shopify_variant_id,
            etsyListingId: item.etsy_listing_id,
            etsyVariantId: item.etsy_variant_id
        });

        groups[groupId].totalStock += (item.stock_quantity || 0);
        if (otherStock !== undefined) {
            groups[groupId].otherTotalStock = (groups[groupId].otherTotalStock || 0) + otherStock;
        }
        groups[groupId].variantsCount += 1;
    });

    const results = Object.values(groups);

    // Compute derived match status
    results.forEach(r => {
        const matchedVariants = r.variants.filter(v => v.isMatched).length;
        if (matchedVariants === 0) {
            r.matchStatus = 'unmatched';
        } else if (matchedVariants < r.variants.length) {
            r.matchStatus = 'partially_matched';
        } else {
            r.matchStatus = 'synced';
        }
    });

    return results.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Get inventory stats for KPI cards based on the active platform
 */
export async function getInventoryStats(platform: 'shopify' | 'etsy'): Promise<{
    total: number
    unmatched: number
    outOfStock: number
}> {
    const items = await getPlatformListings(platform)

    return {
        total: items.length,
        unmatched: items.filter(i => i.matchStatus === 'unmatched').length,
        outOfStock: items.filter(i => i.totalStock <= 0).length
    }
}

/**
 * Fetch master inventory items for a shop
 */
export async function getInventoryItems(query?: string): Promise<InventoryItem[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: shop } = await supabase.from('shops').select('id, shop_domain').eq('owner_id', ownerId).single()
    if (!shop) return []

    let baseQuery = supabase
        .from('inventory_items')
        .select(`
            id, sku, name, image_url, status,
            master_stock, shopify_stock_snapshot, etsy_stock_snapshot,
            shopify_updated_at, etsy_updated_at,
            updated_at,
            shopify_variant_id, etsy_variant_id, 
            shopify_product_id, etsy_listing_id,
            location_inventory_map, selected_location_ids,
            shop:shops(main_location_id)
        `)
        .eq('shop_id', shop.id)
        .order('name', { ascending: true })

    if (query) {
        baseQuery = baseQuery.or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
    }

    const { data, error } = await baseQuery

    if (error) {
        console.error('Error fetching inventory:', error)
        return []
    }

    return (data || []).map((item: any) => ({
        id: item.id,
        sku: item.sku || 'NO-SKU',
        name: item.name || 'Unnamed Product',
        image_url: item.image_url,
        status: item.status || 'Matching',
        master_stock: item.master_stock || 0,
        shopify_stock_snapshot: item.shopify_stock_snapshot || 0,
        etsy_stock_snapshot: item.etsy_stock_snapshot || 0,
        shopify_updated_at: item.shopify_updated_at,
        etsy_updated_at: item.etsy_updated_at,
        updated_at: item.updated_at,
        shopify_variant_id: item.shopify_variant_id,
        etsy_variant_id: item.etsy_variant_id,
        shopify_product_id: item.shopify_product_id,
        etsy_listing_id: item.etsy_listing_id,
        location_inventory_map: item.location_inventory_map || {},
        selected_location_ids: item.selected_location_ids || null,
        shop: item.shop || undefined,
        shop_id: shop.id,
        shop_domain: shop.shop_domain
    }))
}

/**
 * Get all available Shopify locations for the shop
 */
export async function getShopifyLocations(): Promise<{ id: string, name: string, active: boolean }[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: shop } = await supabase.from('shops').select('id, main_location_id').eq('owner_id', ownerId).single()
    if (!shop) return []

    const { data: locations } = await supabase
        .from('inventory_locations')
        .select('id, name, shopify_location_id')
        .eq('shop_id', shop.id)

    const activeIds = (shop.main_location_id || '').split(',').map((s: string) => s.trim())

    return (locations || []).map((loc: any) => ({
        id: loc.shopify_location_id || loc.id,
        name: loc.name,
        active: activeIds.includes(loc.shopify_location_id || loc.id)
    }))
}

/**
 * Perform bulk sync operations for selected items
 */
export async function bulkUpdateStock(
    itemIds: string[],
    strategy: 'shopify' | 'etsy' | 'latest'
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    try {
        const { data: items } = await supabase
            .from('inventory_items')
            .select('*')
            .in('id', itemIds)

        if (!items) return { success: false, message: 'No items found' }

        for (const item of items) {
            let targetStock = item.master_stock

            if (strategy === 'shopify') {
                targetStock = item.shopify_stock_snapshot || 0
            } else if (strategy === 'etsy') {
                targetStock = item.etsy_stock_snapshot || 0
            } else if (strategy === 'latest') {
                const sTime = item.shopify_updated_at ? new Date(item.shopify_updated_at).getTime() : 0
                const eTime = item.etsy_updated_at ? new Date(item.etsy_updated_at).getTime() : 0
                targetStock = sTime >= eTime ? (item.shopify_stock_snapshot || 0) : (item.etsy_stock_snapshot || 0)
            }

            await updateInventoryStock(item.id, targetStock)
        }

        return { success: true, message: `Successfully synced ${itemIds.length} items.` }
    } catch (err) {
        console.error('Bulk update error:', err)
        return { success: false, message: 'An unexpected error occurred during bulk sync' }
    }
}

/**
 * Manually trigger a stock sync for a specific item or all items
 */
export async function forceSyncStock(inventoryItemId?: string): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    try {
        // In a real app, this might trigger an n8n webhook or a background job
        // For now, we'll simulate it by updating the updated_at timestamp
        // which would trigger an edge function or similar in a full implementation.

        if (inventoryItemId) {
            await supabase
                .from('inventory_items')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', inventoryItemId)
        } else {
            const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', ownerId).single()
            if (shop) {
                await supabase
                    .from('inventory_items')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('shop_id', shop.id)
            }
        }

        return { success: true, message: 'Sync triggered successfully' }
    } catch (err) {
        return { success: false, message: 'Failed to trigger sync' }
    }
}

/**
 * Update stock for an inventory item and propagate to all platforms
 */
export async function updateInventoryStock(inventoryItemId: string, newStock: number): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    try {
        // 1. Fetch Item Details
        const { data: item, error: fetchErr } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', inventoryItemId)
            .single();

        if (fetchErr || !item) {
            return { success: false, message: 'Item not found' };
        }

        // 2. Fetch Shop Details
        const { data: shop } = await supabase.from('shops').select('*').eq('id', item.shop_id).single();
        if (!shop) return { success: false, message: 'Shop not found' };

        // 3. Update Shopify API
        if (item.shopify_inventory_item_id) {
            try {
                const { setInventoryLevel } = await import('@/app/api/sync/lib/shopify');
                const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

                // Primary Location comes ONLY from the global shop connection:
                let targetLocationId = shop.main_location_id?.toString().trim();
                let selectedLocationIds = item.selected_location_ids || [];

                // Fallback purely for robustness:
                if (!targetLocationId && selectedLocationIds.length > 0) {
                    targetLocationId = selectedLocationIds[0];
                }

                if (targetLocationId) {
                    const { setInventoryLevel } = await import('@/app/api/sync/lib/shopify');
                    
                    // Parse current location inventory map
                    const locationMap: any[] = Array.isArray(item.location_inventory_map) ? item.location_inventory_map : [];
                    
                    // Filter map to selected locations only
                    const activeLocs = locationMap.filter(l => l.location_id.toString() === targetLocationId || selectedLocationIds.includes(l.location_id.toString()));
                    
                    let currentTotal = 0;
                    const stockByLocId: Record<string, number> = {};
                    activeLocs.forEach(l => {
                        const s = Number(l.stock) || 0;
                        stockByLocId[l.location_id.toString()] = s;
                        currentTotal += s;
                    });

                    const mainStockCurrent = stockByLocId[targetLocationId] || 0;

                    if (newStock > currentTotal) {
                        // INCREASE: Add entire diff to Main Location
                        const diff = newStock - currentTotal;
                        const mainStockNew = mainStockCurrent + diff;
                        await setInventoryLevel(creds, targetLocationId, item.shopify_inventory_item_id, mainStockNew);
                    } else if (newStock < currentTotal) {
                        // DECREASE: Cascade Method (Şelale Yöntemi)
                        let diffToReduce = currentTotal - newStock;
                        
                        // Cascade Order: Main Location first, then the rest
                        const cascadeOrder = [
                            targetLocationId,
                            ...selectedLocationIds.filter((id: string) => id.toString() !== targetLocationId)
                        ];
                        
                        // Deduplicate in case main location was also in selected
                        const uniqueCascadeOrder = Array.from(new Set(cascadeOrder));

                        for (const locId of uniqueCascadeOrder) {
                            if (diffToReduce <= 0) break;
                            
                            const currentLocStock = stockByLocId[locId] || 0;
                            if (currentLocStock > 0) {
                                const reduceAmount = Math.min(currentLocStock, diffToReduce);
                                const newLocStock = currentLocStock - reduceAmount;
                                diffToReduce -= reduceAmount;
                                
                                await setInventoryLevel(creds, locId, item.shopify_inventory_item_id, newLocStock);
                            }
                        }

                        // If there is still diffToReduce left (mathematically indicates edge case or DB out of sync),
                        // forcibly subtract from Main Location to guarantee sum matches exactly.
                        if (diffToReduce > 0) {
                             const forcedMainStock = (stockByLocId[targetLocationId] || 0) - diffToReduce;
                             // Note: This relies on whether Shopify allows negative inventory or fails gracefully.
                             await setInventoryLevel(creds, targetLocationId, item.shopify_inventory_item_id, Math.max(0, forcedMainStock));
                        }
                    }
                }
            } catch (err: any) {
                console.error('Failed to push stock to Shopify:', err.message);
                return { success: false, message: `Shopify Sync Error: ${err.message}` };
            }
        }

        // 4. Update Etsy API
        if (item.etsy_listing_id && item.etsy_variant_id) {
            try {
                const { getInventory, mergeStockUpdate, updateInventory } = await import('@/app/api/sync/lib/etsy');
                const accessToken = shop.etsy_access_token;

                if (accessToken) {
                    const currentInventory = await getInventory(item.etsy_listing_id, accessToken);
                    const updatedInventoryPayload = mergeStockUpdate(currentInventory, [
                        { item_id: item.etsy_variant_id.toString(), new_stock: newStock }
                    ]);

                    await updateInventory(item.etsy_listing_id, accessToken, updatedInventoryPayload);
                }
            } catch (err: any) {
                console.error('Failed to push stock to Etsy:', err.message);
                return { success: false, message: `Etsy Sync Error: ${err.message}` };
            }
        }

        // 5. Update the master record directly in inventory_items ONLY when API calls succeed
        const { error: updateErr } = await supabase
            .from('inventory_items')
            .update({
                master_stock: newStock,
                status: 'Matching', // Reset status as it propagates to both
                updated_at: new Date().toISOString()
            })
            .eq('id', inventoryItemId)

        if (updateErr) {
            console.error('Error updating inventory item:', updateErr)
            return { success: false, message: 'Failed to update database record' }
        }

        return { success: true, message: `Stock synchronized to ${newStock} successfully.` }
    } catch (err: any) {
        console.error('Update inventory error:', err)
        return { success: false, message: err.message || 'An unexpected error occurred' }
    }
}

/**
 * Update the multi-location configuration for an individual inventory item.
 */
export async function updateInventoryConfig(itemId: string, selectedLocationIds: string[], primaryLocationId?: string) {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, error: 'Unauthorized' }

    // 0. Update Shop's Global Main Location if a new Primary Location was chosen
    if (primaryLocationId) {
        // Fetch the shop id linked to this item
        const { data: itemData } = await supabase.from('inventory_items').select('shop_id').eq('id', itemId).single();
        if (itemData?.shop_id) {
            // Guarantee selectedLocationIds includes primaryLocationId, and it's at the front
            const cleanOtherIds = selectedLocationIds.filter(id => id !== primaryLocationId);
            const orderedIds = [primaryLocationId, ...cleanOtherIds];

            // Override selectedLocationIds so they save consistently
            selectedLocationIds = orderedIds;

            const { error: shopError } = await supabase
                .from('shops')
                .update({ main_location_id: primaryLocationId })
                .eq('id', itemData.shop_id);

            if (shopError) console.error('[Config] Failed to update global primary location', shopError);
        }
    }

    // 1. Update the inventory item location preference
    const { error: invError } = await supabase
        .from('inventory_items')
        .update({
            selected_location_ids: selectedLocationIds,
            updated_at: new Date().toISOString()
        })
        .eq('id', itemId)

    if (invError) {
        console.error('Error updating inventory config:', invError)
        return { success: false, error: 'Failed to update inventory configuration' }
    }

    // 2. Also map it to staging_shopify_products so subsequent imports preserve it
    // First, find the shopify_inventory_item_id or variant id to link
    const { data: item } = await supabase.from('inventory_items').select('shopify_variant_id, shop_id').eq('id', itemId).single()
    if (item?.shopify_variant_id) {
        await supabase
            .from('staging_shopify_products')
            .update({
                selected_location_ids: selectedLocationIds,
                updated_at: new Date().toISOString()
            })
            .eq('shopify_variant_id', item.shopify_variant_id)
            .eq('shop_id', item.shop_id)
    }

    return { success: true }
}
