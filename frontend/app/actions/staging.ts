'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export type SetupStatus = {
    shopifyConnected: boolean
    shopifyExported: boolean
    shopifyProductCount: number
    etsyConnected: boolean
    etsyExported: boolean
    etsyProductCount: number
    inventoryMappedCount: number
    isComplete: boolean
    initialProductCounts: {
        shopify: any
        etsy: any
    } | null
}

export type StagingProduct = {
    id: string
    name: string
    sku: string | null
    price: number | null
    imageUrl: string | null
    stockQuantity: number | null
    status: string | null
    platformId: string | null // shopify_inventory_item_id or etsy_listing_id (variant level)

    // Grouping Fields
    shopifyProductId: string | null
    etsyListingId: string | null // For Etsy, listing_id is often the parent if variants exist
    variantTitle: string | null
}

/**
 * Get full setup wizard status
 */
export async function getSetupStatus(testShopDomain?: string): Promise<SetupStatus> {
    const supabase = testShopDomain ? createAdminClient() : await createClient()

    let shopId: string | null = null;

    if (testShopDomain) {
        // Find shop by domain
        const { data: shop } = await supabase
            .from('shops')
            .select('id')
            .eq('shop_domain', testShopDomain)
            .maybeSingle()

        if (shop) {
            shopId = shop.id;
            console.log('getSetupStatus: TEST MODE found shopId', shopId, 'for domain', testShopDomain);
        } else {
            console.log('getSetupStatus: No shop found for domain', testShopDomain);
        }
    }

    if (!shopId) {
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
                isComplete: false,
                initialProductCounts: null
            }
        }

        // Get shop info via user
        const { data: shop } = await supabase
            .from('shops')
            .select('id')
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
                isComplete: false,
                initialProductCounts: null
            }
        }
        shopId = shop.id;
    }

    // Get full shop info using the ID we determined
    const { data: shop } = await supabase
        .from('shops')
        .select('id, shopify_connected, etsy_connected, is_active, access_token, initial_product_counts')
        .eq('id', shopId)
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
            isComplete: false,
            initialProductCounts: null
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
        isComplete,
        initialProductCounts: shop.initial_product_counts
    }
}

/**
 * Get products from staging tables
 */
export async function getStagingProducts(platform: 'shopify' | 'etsy'): Promise<StagingProduct[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()


    if (!user) {
        return [];
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    const shopId = shop?.id || null;

    if (!shopId) return []

    const tableName = platform === 'shopify'
        ? 'staging_shopify_products'
        : 'staging_etsy_products'

    const platformIdField = platform === 'shopify'
        ? 'shopify_inventory_item_id' // Variant ID
        : 'etsy_variant_id' // Use variant ID for matching with AI

    // Select all columns to check what we have
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('shop_id', shopId)
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
        platformId: item[platformIdField],

        // Map new grouping fields
        shopifyProductId: item.shopify_product_id || null,
        etsyListingId: item.etsy_listing_id || null,
        variantTitle: item.variant_title || item.option1 || null // Fallback to option1 if variant_title missing
    }))
}

/**
 * Quick count for staging tables (for header display)
 */
export async function getStagingCounts(): Promise<{ shopify: number, etsy: number }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()


    if (!user) {
        return { shopify: 0, etsy: 0 };
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    const shopId = shop?.id || null;

    if (!shopId) return { shopify: 0, etsy: 0 }

    const [shopifyResult, etsyResult] = await Promise.all([
        supabase
            .from('staging_shopify_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId),
        supabase
            .from('staging_etsy_products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId)
    ])

    return {
        shopify: shopifyResult.count || 0,
        etsy: etsyResult.count || 0
    }
}

/**
 * Clear staging tables for the current connected shop
 */
export async function clearStagingTables(): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()


    if (!user) {
        return { success: false, message: 'User not authenticated' };
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

    const shopId = shop?.id || null;

    if (!shopId) {
        return { success: false, message: 'Shop not found' }
    }

    // Delete from both staging tables
    const [delShopify, delEtsy] = await Promise.all([
        supabase.from('staging_shopify_products').delete().eq('shop_id', shopId),
        supabase.from('staging_etsy_products').delete().eq('shop_id', shopId)
    ])

    if (delShopify.error) {
        console.error('Failed to clear Shopify staging:', delShopify.error)
        return { success: false, message: 'Failed to clear Shopify staging data' }
    }

    if (delEtsy.error) {
        console.error('Failed to clear Etsy staging:', delEtsy.error)
        return { success: false, message: 'Failed to clear Etsy staging data' }
    }

    return { success: true, message: 'Staging data cleared successfully' }
}
