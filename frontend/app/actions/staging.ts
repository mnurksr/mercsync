'use server'

import { createClient } from '@/utils/supabase/server'

export type SetupStatus = {
    shopifyConnected: boolean
    shopifyExported: boolean
    shopifyProductCount: number
    etsyConnected: boolean
    etsyExported: boolean
    etsyProductCount: number
    inventoryMappedCount: number
    isComplete: boolean
}

export type StagingProduct = {
    id: string
    name: string
    sku: string | null
    price: number | null
    imageUrl: string | null
    stockQuantity: number | null
    status: string | null
    platformId: string | null // shopify_inventory_item_id or etsy_listing_id
}

/**
 * Get full setup wizard status
 */
export async function getSetupStatus(): Promise<SetupStatus> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return {
            shopifyConnected: false,
            shopifyExported: false,
            shopifyProductCount: 0,
            etsyConnected: false,
            etsyExported: false,
            etsyProductCount: 0,
            inventoryMappedCount: 0,
            isComplete: false
        }
    }

    // Get shop info
    const { data: shop } = await supabase
        .from('shops')
        .select('id, shopify_connected, etsy_connected, is_active, access_token')
        .eq('owner_id', user.id)
        .maybeSingle()

    if (!shop) {
        return {
            shopifyConnected: false,
            shopifyExported: false,
            shopifyProductCount: 0,
            etsyConnected: false,
            etsyExported: false,
            etsyProductCount: 0,
            inventoryMappedCount: 0,
            isComplete: false
        }
    }

    // Connection status with backwards compatibility
    const shopifyConnected = shop.shopify_connected === true ||
        (shop.is_active === true && !!shop.access_token)
    const etsyConnected = shop.etsy_connected === true

    // Count staging products
    const [shopifyCount, etsyCount, inventoryCount] = await Promise.all([
        supabase
            .from('staging_shopify_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id),
        supabase
            .from('staging_etsy_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id),
        supabase
            .from('inventory_items')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id)
    ])

    const shopifyProductCount = shopifyCount.count || 0
    const etsyProductCount = etsyCount.count || 0
    const inventoryMappedCount = inventoryCount.count || 0

    // Setup is complete when:
    // - Both platforms connected
    // - Both have products exported
    // - Products are mapped to inventory_items
    const isComplete = shopifyConnected && etsyConnected &&
        shopifyProductCount > 0 && etsyProductCount > 0 &&
        inventoryMappedCount > 0

    return {
        shopifyConnected,
        shopifyExported: shopifyProductCount > 0,
        shopifyProductCount,
        etsyConnected,
        etsyExported: etsyProductCount > 0,
        etsyProductCount,
        inventoryMappedCount,
        isComplete
    }
}

/**
 * Get products from staging tables
 */
export async function getStagingProducts(platform: 'shopify' | 'etsy'): Promise<StagingProduct[]> {
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

    const tableName = platform === 'shopify'
        ? 'staging_shopify_products'
        : 'staging_etsy_products'

    const platformIdField = platform === 'shopify'
        ? 'shopify_inventory_item_id'
        : 'etsy_listing_id'

    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })

    if (error || !data) return []

    return data.map((item: any) => ({
        id: item.id,
        name: item.name || 'Unnamed Product',
        sku: item.sku,
        price: item.price,
        imageUrl: item.image_url,
        stockQuantity: item.stock_quantity,
        status: item.status,
        platformId: item[platformIdField]
    }))
}

/**
 * Quick count for staging tables (for header display)
 */
export async function getStagingCounts(): Promise<{ shopify: number, etsy: number }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { shopify: 0, etsy: 0 }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    if (!shop) return { shopify: 0, etsy: 0 }

    const [shopifyResult, etsyResult] = await Promise.all([
        supabase
            .from('staging_shopify_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id),
        supabase
            .from('staging_etsy_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shop.id)
    ])

    return {
        shopify: shopifyResult.count || 0,
        etsy: etsyResult.count || 0
    }
}
