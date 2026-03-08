'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type ListingItem = {
    id: string
    title: string
    imageUrl: string | null
    totalStock: number
    variantsCount: number
    status: string
    platform: 'shopify' | 'etsy'
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

        if (!groups[groupId]) {
            groups[groupId] = {
                id: groupId,
                title: item.product_title || item.name || 'Unnamed Product',
                imageUrl: item.image_url,
                totalStock: 0,
                variantsCount: 0,
                status: 'active',
                platform
            };
        }

        groups[groupId].totalStock += (item.stock_quantity || 0);
        groups[groupId].variantsCount += 1;

        // If any variant has issues, flag it.
        if (item.status !== 'active') {
            groups[groupId].status = item.status;
        }
    });

    const results = Object.values(groups);

    // Compute derived statuses
    results.forEach(r => {
        if (r.totalStock <= 0) r.status = 'out';
        else if (r.totalStock < 5) r.status = 'low';
        else if (r.status === 'active') r.status = 'synced'; // General OK status
    });

    return results.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Get inventory stats for KPI cards based on the active platform
 */
export async function getInventoryStats(platform: 'shopify' | 'etsy'): Promise<{
    total: number
    lowStock: number
    outOfStock: number
}> {
    const items = await getPlatformListings(platform)

    return {
        total: items.length,
        lowStock: items.filter(i => i.status === 'low').length,
        outOfStock: items.filter(i => i.status === 'out').length
    }
}

