'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type PlatformVariant = {
    id: string
    title: string
    sku: string | null
    price: number
    stock: number
    imageUrl: string | null
    isMatched: boolean
    dbId: string
}

export type ListingItem = {
    id: string
    title: string
    imageUrl: string | null
    totalStock: number
    variantsCount: number
    platformStatus: string
    matchStatus: 'synced' | 'unmatched' | 'partially_matched'
    platform: 'shopify' | 'etsy'
    variants: PlatformVariant[]
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

    // Get shop ID
    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle()

    if (!shop) return []

    const tableName = platform === 'shopify' ? 'staging_shopify_products' : 'staging_etsy_products'
    const parentIdField = platform === 'shopify' ? 'shopify_product_id' : 'etsy_listing_id'

    let query = supabase
        .from(tableName)
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })

    if (searchQuery) {
        // Search by parent product title or variant SKU
        query = query.or(`product_title.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
    }

    const { data: items, error } = await query

    if (error) {
        console.error(`Error fetching listings for ${platform}:`, error)
        return []
    }

    // Group variants into Listings
    const groups: { [key: string]: ListingItem } = {};

    (items || []).forEach(item => {
        const groupId = item[parentIdField] || item.id;
        const isMatched = platform === 'shopify' ? !!item.etsy_variant_id : !!item.shopify_variant_id;

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                title: item.product_title || item.name || 'Unnamed Product',
                imageUrl: item.image_url,
                totalStock: 0,
                variantsCount: 0,
                platformStatus: item.status || 'unknown',
                matchStatus: 'synced',
                platform,
                variants: []
            };
        }

        groups[groupId].variants.push({
            id: platform === 'shopify' ? item.shopify_variant_id : item.etsy_variant_id,
            dbId: item.id,
            title: item.variant_title || 'Default Title',
            sku: item.sku,
            price: item.price || 0,
            stock: item.stock_quantity || 0,
            imageUrl: item.image_url,
            isMatched
        });

        groups[groupId].totalStock += (item.stock_quantity || 0);
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
