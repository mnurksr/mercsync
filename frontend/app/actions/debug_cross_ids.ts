'use server'

import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export async function debugCrossIds() {
    const { userId } = await getValidatedUserContext()
    const supabase = createAdminClient()

    // Get shop
    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, etsy_shop_id')
        .eq('user_id', userId)
        .single()

    if (!shop) return { error: 'No shop found' }

    // Fetch Shopify staging items
    const { data: shopifyItems } = await supabase
        .from('staging_shopify_products')
        .select('shopify_variant_id, shopify_product_id, etsy_variant_id, etsy_listing_id, product_title')
        .eq('shop_id', shop.id)
        .limit(5)

    // Fetch Etsy staging items
    const { data: etsyItems } = await supabase
        .from('staging_etsy_products')
        .select('etsy_variant_id, etsy_listing_id, shopify_variant_id, shopify_product_id, product_title')
        .eq('shop_id', shop.id)
        .limit(5)

    return {
        shopId: shop.id,
        shopifyItems: shopifyItems?.map(i => ({
            title: i.product_title,
            shopify_variant_id: i.shopify_variant_id,
            shopify_product_id: i.shopify_product_id,
            etsy_variant_id: i.etsy_variant_id,
            etsy_listing_id: i.etsy_listing_id
        })),
        etsyItems: etsyItems?.map(i => ({
            title: i.product_title,
            etsy_variant_id: i.etsy_variant_id,
            etsy_listing_id: i.etsy_listing_id,
            shopify_variant_id: i.shopify_variant_id,
            shopify_product_id: i.shopify_product_id
        }))
    }
}
