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
    shopifyInventoryItemId?: string
    etsyListingId?: string
    etsyVariantId?: string
}

export type ListingItem = {
    id: string
    title: string
    description: string
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
    shopify_inventory_item_id: string | null
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

    // 1. Collect IDs for bidirectional lookup
    const myVariantIds = (items || []).map(i => platform === 'shopify' ? i.shopify_variant_id : i.etsy_variant_id).filter(Boolean);
    const pointedToIds = (items || []).map(i => platform === 'shopify' ? i.etsy_variant_id : i.shopify_variant_id).filter(Boolean);

    // Build reverse map: other variant ID -> my variant ID (for lookup when processing other table)
    const reversePointerMap: { [otherVarId: string]: string[] } = {};
    (items || []).forEach(item => {
        const myVarId = platform === 'shopify' ? item.shopify_variant_id : item.etsy_variant_id;
        const otherVarId = platform === 'shopify' ? item.etsy_variant_id : item.shopify_variant_id;
        if (myVarId && otherVarId) {
            if (!reversePointerMap[otherVarId]) reversePointerMap[otherVarId] = [];
            reversePointerMap[otherVarId].push(myVarId);
        }
    });

    let otherStocksMap: { [key: string]: number } = {};
    let matchedBackMap: { [key: string]: string } = {}; // Map our ID -> their ID if they point to us

    const otherIdField = platform === 'shopify' ? 'etsy_variant_id' : 'shopify_variant_id';
    const myIdFieldInOtherTable = platform === 'shopify' ? 'shopify_variant_id' : 'etsy_variant_id';

    // 2. Fetch from other table with bidirectional awareness
    // We look for items that WE point to OR items that point TO US
    const { data: otherItems } = await supabase
        .from(otherTableName)
        .select(`shopify_variant_id, etsy_variant_id, stock_quantity, etsy_listing_id, shopify_product_id`)
        .or(`${otherIdField}.in.(${pointedToIds.join(',')}),${myIdFieldInOtherTable}.in.(${myVariantIds.join(',')})`);

    // Maps: my variant ID -> cross-platform listing/product IDs
    let crossEtsyListingMap: { [key: string]: string } = {};
    let crossShopifyProductMap: { [key: string]: string } = {};

    if (otherItems) {
        otherItems.forEach((oi: any) => {
            const theirId = oi[otherIdField];
            const pointsToMeId = oi[myIdFieldInOtherTable];

            // If we point to them
            if (theirId) otherStocksMap[theirId] = oi.stock_quantity || 0;
            
            // If they point to us, we should know about it!
            if (pointsToMeId) {
                matchedBackMap[pointsToMeId] = theirId;
            }

            // Build cross-platform ID maps using reverse pointer
            // Case 1: We point to them — use reversePointerMap to find our variant IDs
            if (theirId && reversePointerMap[theirId]) {
                reversePointerMap[theirId].forEach(myVarId => {
                    if (oi.etsy_listing_id) crossEtsyListingMap[myVarId] = oi.etsy_listing_id;
                    if (oi.shopify_product_id) crossShopifyProductMap[myVarId] = oi.shopify_product_id;
                });
            }
            // Case 2: They point to us — pointsToMeId IS our variant ID
            if (pointsToMeId) {
                if (oi.etsy_listing_id) crossEtsyListingMap[pointsToMeId] = oi.etsy_listing_id;
                if (oi.shopify_product_id) crossShopifyProductMap[pointsToMeId] = oi.shopify_product_id;
            }
        });
    }

    // 3. FALLBACK: Also look up cross-platform IDs from inventory_items table
    // This is the source of truth — inventory_items always stores both etsy_listing_id and shopify_product_id for matched items
    if (myVariantIds.length > 0) {
        const myField = platform === 'shopify' ? 'shopify_variant_id' : 'etsy_variant_id';
        const { data: invItems } = await supabase
            .from('inventory_items')
            .select('shopify_variant_id, etsy_variant_id, etsy_listing_id, shopify_product_id')
            .eq('shop_id', shop.id)
            .in(myField, myVariantIds);

        if (invItems) {
            invItems.forEach((inv: any) => {
                const myVarId = platform === 'shopify' ? inv.shopify_variant_id : inv.etsy_variant_id;
                if (!myVarId) return;

                // Fill cross maps from inventory_items (most reliable source)
                if (inv.etsy_listing_id && !crossEtsyListingMap[myVarId]) {
                    crossEtsyListingMap[myVarId] = inv.etsy_listing_id;
                }
                if (inv.shopify_product_id && !crossShopifyProductMap[myVarId]) {
                    crossShopifyProductMap[myVarId] = inv.shopify_product_id;
                }
            });
        }
    }

    // Group variants into Listings
    const groups: { [key: string]: ListingItem } = {};

    (items || []).forEach(item => {
        const groupId = item[parentIdField] || item.id;
        const otherVariantId = platform === 'shopify' ? item.etsy_variant_id : item.shopify_variant_id;
        const linkedBackVariantId = matchedBackMap[platform === 'shopify' ? item.shopify_variant_id : item.etsy_variant_id];
        
        // Product is matched if either side has a pointer
        const finalOtherVariantId = otherVariantId || linkedBackVariantId;
        const isMatched = !!finalOtherVariantId;
        const otherStock = isMatched ? (otherStocksMap[finalOtherVariantId!] || 0) : undefined;

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                title: item.product_title || item.name || 'Unnamed Product',
                description: item.description || '',
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

        const myVariantIdForCross = platform === 'shopify' ? item.shopify_variant_id : item.etsy_variant_id;

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
            shopifyProductId: item.shopify_product_id || crossShopifyProductMap[myVariantIdForCross],
            shopifyVariantId: item.shopify_variant_id, // Explicit 47...
            shopifyInventoryItemId: item.shopify_inventory_item_id, // Explicit 49...
            etsyListingId: item.etsy_listing_id || crossEtsyListingMap[myVariantIdForCross],
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
            shopify_variant_id, shopify_inventory_item_id, etsy_variant_id, 
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
        shopify_inventory_item_id: item.shopify_inventory_item_id || null,
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
 * Get the shop's selected_location_ids from the shops table.
 */
export async function getShopSelectedLocationIds(): Promise<string[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: shop } = await supabase
        .from('shops')
        .select('selected_location_ids')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop?.selected_location_ids || !Array.isArray(shop.selected_location_ids)) return []
    return shop.selected_location_ids.map((id: any) => id.toString())
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
 * Fetch latest stock counts from Shopify & Etsy APIs for all matched items,
 * then update inventory_items.location_inventory_map and etsy_stock_snapshot.
 * The DB trigger will auto-recalculate shopify_stock_snapshot from the map.
 */
export async function fetchLatestCounts(): Promise<{ success: boolean; message: string; updated: number }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated', updated: 0 }

    try {
        const { data: shop } = await supabase.from('shops').select('*').eq('owner_id', ownerId).single()
        if (!shop) return { success: false, message: 'Shop not found', updated: 0 }

        // Get all matched items (both platforms linked)
        const { data: items } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('shop_id', shop.id)
            .not('shopify_variant_id', 'is', null)
            .not('etsy_variant_id', 'is', null)

        if (!items || items.length === 0) return { success: true, message: 'No matched items to refresh.', updated: 0 }

        const { getInventoryLevels } = await import('@/app/api/sync/lib/shopify')
        const { getInventory } = await import('@/app/api/sync/lib/etsy')
        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token }

        // Fetch all Shopify locations for this shop
        const { data: locations } = await supabase
            .from('inventory_locations')
            .select('shopify_location_id')
            .eq('shop_id', shop.id)
        const locationIds = (locations || []).map((l: any) => l.shopify_location_id).filter(Boolean)

        let updatedCount = 0

        // Batch Shopify inventory levels (all locations, all inventory items)
        const shopifyItemIds = items.map(i => i.shopify_inventory_item_id).filter(Boolean)
        let shopifyLevelsMap: Record<string, { location_id: string, available: number }[]> = {}

        if (locationIds.length > 0 && shopifyItemIds.length > 0) {
            // Shopify API allows up to 50 inventory_item_ids per request
            for (let i = 0; i < shopifyItemIds.length; i += 50) {
                const batch = shopifyItemIds.slice(i, i + 50)
                try {
                    const res = await getInventoryLevels(creds, locationIds, batch)
                    const levels = res?.inventory_levels || []
                    levels.forEach((lvl: any) => {
                        const key = lvl.inventory_item_id?.toString()
                        if (!shopifyLevelsMap[key]) shopifyLevelsMap[key] = []
                        shopifyLevelsMap[key].push({
                            location_id: lvl.location_id?.toString(),
                            available: lvl.available ?? 0
                        })
                    })
                } catch (err: any) {
                    console.error('Shopify batch inventory fetch error:', err.message)
                }
            }
        }

        // Process each item
        for (const item of items) {
            try {
                // --- Shopify: build location_inventory_map from fetched levels ---
                const levels = shopifyLevelsMap[item.shopify_inventory_item_id?.toString()] || []
                const newLocationMap = levels.map(lvl => ({
                    location_id: lvl.location_id,
                    stock: lvl.available,
                    updated_at: new Date().toISOString()
                }))

                // Calculate shopify total from selected locations
                const selectedLocs: string[] = item.selected_location_ids || []
                let shopifyTotal = 0
                if (selectedLocs.length > 0) {
                    shopifyTotal = newLocationMap
                        .filter(l => selectedLocs.includes(l.location_id))
                        .reduce((sum, l) => sum + (l.stock || 0), 0)
                } else {
                    shopifyTotal = newLocationMap.reduce((sum, l) => sum + (l.stock || 0), 0)
                }

                // --- Etsy: fetch live stock ---
                let etsyStock = item.etsy_stock_snapshot || 0
                if (item.etsy_listing_id && shop.etsy_access_token) {
                    try {
                        const etsyInv = await getInventory(item.etsy_listing_id, shop.etsy_access_token)
                        const products = etsyInv?.products || []
                        // Find matching offering by variant id
                        for (const product of products) {
                            const propIds = (product.property_values || []).map((pv: any) => pv.property_id?.toString())
                            for (const offering of (product.offerings || [])) {
                                if (offering.offering_id?.toString() === item.etsy_variant_id?.toString()) {
                                    etsyStock = offering.quantity ?? 0
                                    break
                                }
                            }
                        }
                        // Fallback: if single-variant listing, use first offering
                        if (products.length === 1 && products[0].offerings?.length === 1) {
                            etsyStock = products[0].offerings[0].quantity ?? 0
                        }
                    } catch (err: any) {
                        console.error(`Etsy fetch error for listing ${item.etsy_listing_id}:`, err.message)
                    }
                }

                // --- Update DB ---
                await supabase
                    .from('inventory_items')
                    .update({
                        location_inventory_map: newLocationMap,
                        shopify_stock_snapshot: shopifyTotal,
                        etsy_stock_snapshot: etsyStock,
                        shopify_updated_at: new Date().toISOString(),
                        etsy_updated_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', item.id)

                updatedCount++
            } catch (err: any) {
                console.error(`Error refreshing item ${item.id}:`, err.message)
            }
        }

        return { success: true, message: `Refreshed ${updatedCount} of ${items.length} items from live APIs.`, updated: updatedCount }
    } catch (err: any) {
        console.error('fetchLatestCounts error:', err)
        return { success: false, message: err.message || 'An unexpected error occurred', updated: 0 }
    }
}

/**
 * Push master_stock to platforms for items that have a master_stock but are in Mismatch status.
 * Only pushes to the platform(s) whose snapshot differs from master_stock.
 */
export async function pushMismatchStock(): Promise<{ success: boolean; message: string; pushed: number }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated', pushed: 0 }

    try {
        const { data: shop } = await supabase.from('shops').select('*').eq('owner_id', ownerId).single()
        if (!shop) return { success: false, message: 'Shop not found', pushed: 0 }

        // Get matched items where master_stock > 0 and snapshots don't match
        const { data: items } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('shop_id', shop.id)
            .not('shopify_variant_id', 'is', null)
            .not('etsy_variant_id', 'is', null)
            .gt('master_stock', 0)

        if (!items || items.length === 0) return { success: true, message: 'No mismatched items to push.', pushed: 0 }

        // Filter to only items where at least one platform snapshot differs from master_stock
        const mismatchedItems = items.filter(item =>
            item.shopify_stock_snapshot !== item.master_stock ||
            item.etsy_stock_snapshot !== item.master_stock
        )

        if (mismatchedItems.length === 0) return { success: true, message: 'All items are already in sync.', pushed: 0 }

        let pushedCount = 0

        for (const item of mismatchedItems) {
            const platformsNeeded: Array<'shopify' | 'etsy'> = []
            if (item.shopify_stock_snapshot !== item.master_stock) platformsNeeded.push('shopify')
            if (item.etsy_stock_snapshot !== item.master_stock) platformsNeeded.push('etsy')

            try {
                await updateInventoryStock(item.id, item.master_stock, platformsNeeded)
                pushedCount++
            } catch (err: any) {
                console.error(`Push mismatch error for ${item.id}:`, err.message)
            }
        }

        return { success: true, message: `Pushed master stock to ${pushedCount} mismatched items.`, pushed: pushedCount }
    } catch (err: any) {
        console.error('pushMismatchStock error:', err)
        return { success: false, message: err.message || 'An unexpected error occurred', pushed: 0 }
    }
}

/**
 * Manually trigger a stock sync for a specific item or all items (legacy)
 */
export async function forceSyncStock(inventoryItemId?: string): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    try {
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
export async function updateInventoryStock(
    inventoryItemId: string,
    newStock: number,
    platformsToSync: Array<'shopify' | 'etsy'> = ['shopify', 'etsy'],
    locationBreakdown?: { locationId: string; allocation: number }[]
): Promise<{ success: boolean; message: string }> {
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
        if (item.shopify_inventory_item_id && platformsToSync.includes('shopify')) {
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

                    if (locationBreakdown && locationBreakdown.length > 0) {
                        for (const loc of locationBreakdown) {
                            await setInventoryLevel(creds, loc.locationId, item.shopify_inventory_item_id, loc.allocation);
                            
                            // Optimistically update local map
                            const mainLocEntry = locationMap.find(l => l.location_id.toString() === loc.locationId);
                            if (mainLocEntry) {
                                mainLocEntry.stock = loc.allocation;
                                mainLocEntry.updated_at = new Date().toISOString();
                            } else {
                                locationMap.push({ location_id: loc.locationId, stock: loc.allocation, updated_at: new Date().toISOString() });
                            }
                        }
                    } else {
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
                        
                        // Optimistically update local map
                        const mainLocEntry = locationMap.find(l => l.location_id.toString() === targetLocationId);
                        if (mainLocEntry) {
                            mainLocEntry.stock = mainStockNew;
                            mainLocEntry.updated_at = new Date().toISOString();
                        } else {
                            locationMap.push({ location_id: targetLocationId, stock: mainStockNew, updated_at: new Date().toISOString() });
                        }
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
                                
                                // Optimistically update local map
                                const locMapEntry = locationMap.find(l => l.location_id.toString() === locId);
                                if (locMapEntry) {
                                    locMapEntry.stock = newLocStock;
                                    locMapEntry.updated_at = new Date().toISOString();
                                }
                            }
                        }

                        // If there is still diffToReduce left (mathematically indicates edge case or DB out of sync),
                        // forcibly subtract from Main Location to guarantee sum matches exactly.
                        if (diffToReduce > 0) {
                             const forcedMainStock = (stockByLocId[targetLocationId] || 0) - diffToReduce;
                             const finalForcedStock = Math.max(0, forcedMainStock);
                             await setInventoryLevel(creds, targetLocationId, item.shopify_inventory_item_id, finalForcedStock);
                             
                             const mainLocEntry = locationMap.find(l => l.location_id.toString() === targetLocationId);
                             if (mainLocEntry) {
                                 mainLocEntry.stock = finalForcedStock;
                                 mainLocEntry.updated_at = new Date().toISOString();
                             }
                        }
                    } // end of else (cascade)
                    }
                } // End of if (targetLocationId)
            } catch (err: any) {
                console.error('Failed to push stock to Shopify:', err.message);
                return { success: false, message: `Shopify Sync Error: ${err.message}` };
            }
        }

        // 4. Update Etsy API
        if (item.etsy_listing_id && item.etsy_variant_id && platformsToSync.includes('etsy')) {
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
        // Extract locationMap if it was modified
        const updatedLocationMap = item.location_inventory_map; // since we mutated it above if it was an array
        
        const { error: updateErr } = await supabase
            .from('inventory_items')
            .update({
                master_stock: newStock,
                shopify_stock_snapshot: newStock,
                etsy_stock_snapshot: newStock,
                location_inventory_map: updatedLocationMap,
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
