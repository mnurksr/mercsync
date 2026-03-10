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
    available_stock: number
    reserved_stock: number
    on_hand_stock: number
    updated_at: string
    shopify_variant_id: string | null
    etsy_variant_id: string | null
    shopify_product_id: string | null
    etsy_listing_id: string | null
    shop_id: string
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
 * Get master inventory items from inventory_items and levels
 */
export async function getInventoryItems(searchQuery?: string): Promise<InventoryItem[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return []

    let query = supabase
        .from('inventory_items')
        .select(`
            id, sku, name, updated_at,
            shopify_variant_id, etsy_variant_id,
            shopify_product_id, etsy_listing_id,
            inventory_levels (
                available_stock,
                reserved_stock
            )
        `)
        .eq('shop_id', shop.id)
        .order('updated_at', { ascending: false })

    if (searchQuery) {
        query = query.or(`sku.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`)
    }

    const { data, error } = await query
    if (error || !data) {
        console.error('Error fetching inventory items:', error)
        return []
    }

    return data.map((item: any) => {
        const available = item.inventory_levels?.reduce((sum: number, l: any) => sum + (l.available_stock || 0), 0) || 0
        const reserved = item.inventory_levels?.reduce((sum: number, l: any) => sum + (l.reserved_stock || 0), 0) || 0

        return {
            id: item.id,
            sku: item.sku,
            name: item.name,
            available_stock: available,
            reserved_stock: reserved,
            on_hand_stock: available + reserved,
            updated_at: item.updated_at,
            shopify_variant_id: item.shopify_variant_id,
            etsy_variant_id: item.etsy_variant_id,
            shopify_product_id: item.shopify_product_id,
            etsy_listing_id: item.etsy_listing_id,
            shop_id: shop.id
        }
    })
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
        // 1. Get the item and its shop/location
        const { data: item, error: itemErr } = await supabase
            .from('inventory_items')
            .select(`
                id, shop_id,
                shopify_variant_id, etsy_variant_id,
                shopify_product_id, etsy_listing_id,
                shops ( main_location_id )
            `)
            .eq('id', inventoryItemId)
            .single()

        if (itemErr || !item) return { success: false, message: 'Item not found' }

        const shopId = item.shop_id
        let locationId = (item.shops as any)?.main_location_id

        if (locationId && locationId.includes(',')) {
            locationId = locationId.split(',')[0].trim()
        }

        if (!locationId) {
            const { data: loc } = await supabase.from('inventory_locations').select('id').eq('shop_id', shopId).limit(1).maybeSingle()
            locationId = loc?.id
        }

        if (!locationId) return { success: false, message: 'No inventory location found for this shop' }

        // 2. Update inventory_levels (Master Record)
        // Note: For now we assume SHOPIFY market represents the master warehouse for sync purposes 
        // in our current multi-platform logic, but we should really update all levels or have a master level.
        const { error: levelErr } = await supabase
            .from('inventory_levels')
            .update({ available_stock: newStock, updated_at: new Date().toISOString() })
            .eq('inventory_item_id', inventoryItemId)
            .eq('location_id', locationId)

        if (levelErr) {
            console.error('Error updating inventory level:', levelErr)
            return { success: false, message: 'Failed to update database record' }
        }

        // 3. Trigger background sync via the same mechanism as forceSyncStock
        // In this implementation, updating updated_at on inventory_items triggers the sync worker
        await supabase
            .from('inventory_items')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', inventoryItemId)

        return { success: true, message: `Stock updated to ${newStock} and synchronization started.` }
    } catch (err) {
        console.error('Update inventory error:', err)
        return { success: false, message: 'An unexpected error occurred' }
    }
}
