'use server'

import { createClient } from '@/utils/supabase/server'

export type InventoryItem = {
    id: string
    name: string
    imageUrl: string | null
    shopifyStock: number
    etsyStock: number
    status: string
    platform: 'shopify' | 'etsy' | 'both'
    shopifyInventoryItemId: string | null
    etsyVariantId: string | null
}

/**
 * Get products from inventory_items table
 */
export async function getInventoryItems(searchQuery?: string): Promise<InventoryItem[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    // Get shop ID
    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    if (!shop) return []

    // Build query to inventory_items table
    let query = supabase
        .from('inventory_items')
        .select('id, name, image_url, status, shopify_stock_snapshot, etsy_stock_snapshot, shopify_inventory_item_id, etsy_variant_id')
        .eq('shop_id', shop.id)
        .order('updated_at', { ascending: false })

    if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`)
    }

    const { data: items, error } = await query

    if (error) {
        console.error('Error fetching inventory items:', error)
        return []
    }

    const results = (items || []).map(item => {
        // Determine platform based on ID fields
        const hasShopify = !!item.shopify_inventory_item_id
        const hasEtsy = !!item.etsy_variant_id

        let platform: 'shopify' | 'etsy' | 'both' = 'shopify'
        if (hasShopify && hasEtsy) {
            platform = 'both'
        } else if (hasEtsy && !hasShopify) {
            platform = 'etsy'
        } else if (hasShopify && !hasEtsy) {
            platform = 'shopify'
        }

        return {
            id: item.id,
            name: item.name || 'Unnamed Product',
            imageUrl: item.image_url,
            shopifyStock: item.shopify_stock_snapshot ?? 0,
            etsyStock: item.etsy_stock_snapshot ?? 0,
            status: item.status || 'unknown',
            platform,
            shopifyInventoryItemId: item.shopify_inventory_item_id,
            etsyVariantId: item.etsy_variant_id
        }
    })

    // Sort: 'both' platform items first, then others
    return results.sort((a, b) => {
        if (a.platform === 'both' && b.platform !== 'both') return -1
        if (a.platform !== 'both' && b.platform === 'both') return 1
        return 0
    })
}

/**
 * Get inventory stats for KPI cards
 */
export async function getInventoryStats(): Promise<{
    total: number
    lowStock: number
    outOfStock: number
    shopifyOnly: number
    etsyOnly: number
}> {
    const items = await getInventoryItems()

    return {
        total: items.length,
        lowStock: items.filter(i => i.status === 'low').length,
        outOfStock: items.filter(i => i.status === 'out').length,
        shopifyOnly: items.filter(i => i.platform === 'shopify').length,
        etsyOnly: items.filter(i => i.platform === 'etsy').length
    }
}

