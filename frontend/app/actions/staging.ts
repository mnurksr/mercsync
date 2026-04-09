'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

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
    shopifyVariantId: string | null
    etsyVariantId: string | null
}

/**
 * Get full setup wizard status
 */
export async function getSetupStatus(testShopDomain?: string): Promise<SetupStatus> {
    let supabase;
    let shopId: string | null = null;

    if (testShopDomain) {
        supabase = createAdminClient()
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
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase

        if (!context.ownerId) {
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

        // Get shop info via ownerId
        const { data: shop } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', context.ownerId)
            .maybeSingle()

        if (!shop) {
            console.log(`[getSetupStatus] No shop found for ownerId ${context.ownerId}, returning incomplete status.`);
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

    if (!shopId) {
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


    // Get full shop info using the ID we determined
    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, shopify_connected, etsy_connected, is_active, access_token, etsy_access_token, initial_product_counts, plan_type')
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

    // Connection status: Trust the token presence as the source of truth
    const shopifyConnected = !!shop.access_token && !!shop.shop_domain
    const etsyConnected = !!shop.etsy_access_token

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

    const hasStartedPlan = shop.plan_type && !['guest', 'none', 'basic'].includes(shop.plan_type.toLowerCase());

    const isComplete = hasStartedPlan || (shopifyConnected && etsyConnected &&
        shopifyProductCount > 0 && etsyProductCount > 0 &&
        inventoryMappedCount > 0)

    console.log(`[getSetupStatus] Debug Result for shopId ${shopId}:`, {
        shopifyConnected,
        etsyConnected,
        shopifyProductCount,
        etsyProductCount,
        inventoryMappedCount,
        hasStartedPlan,
        plan_type: shop.plan_type,
        isComplete
    });

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
export async function getStagingProducts(platform: 'shopify' | 'etsy', ownerId?: string): Promise<StagingProduct[]> {
    console.log(`[getStagingProducts] Called with platform=${platform}, ownerId=${ownerId}`)

    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) {
            console.log('[getStagingProducts] No user and no ownerId, returning empty')
            return []
        }
    }

    console.log(`[getStagingProducts] resolvedOwnerId=${resolvedOwnerId}`)

    const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle()

    console.log(`[getStagingProducts] Shop query result:`, { shop, shopError })

    const shopId = shop?.id || null;

    if (!shopId) {
        console.log('[getStagingProducts] No shopId found, returning empty')
        return []
    }

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

    console.log(`[getStagingProducts] ${tableName} query: shopId=${shopId}, count=${data?.length || 0}, error=${error?.message || 'none'}`)

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
        variantTitle: item.variant_title || item.option1 || null, // Fallback to option1 if variant_title missing
        shopifyVariantId: item.shopify_variant_id || null,
        etsyVariantId: item.etsy_variant_id || null
    }))
}

/**
 * Quick count for staging tables (for header display)
 */
export async function getStagingCounts(ownerId?: string): Promise<{ shopify: number, etsy: number }> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) return { shopify: 0, etsy: 0 }
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
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
export async function clearStagingTables(ownerId?: string): Promise<{ success: boolean; message: string }> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) return { success: false, message: 'User not authenticated' }
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
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

/**
 * Fetch existing inventory items to restore matches in staging UI
 */
export async function getInventoryReferences(ownerId?: string) {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient();
    } else {
        const context = await getValidatedUserContext();
        supabase = context.supabase;
        resolvedOwnerId = context.ownerId;
        if (!resolvedOwnerId) return [];
    }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle();

    if (!shop) return [];

    const { data } = await supabase
        .from('inventory_items')
        .select('shopify_product_id, shopify_variant_id, etsy_listing_id, etsy_variant_id')
        .eq('shop_id', shop.id);

    return data || [];
}
