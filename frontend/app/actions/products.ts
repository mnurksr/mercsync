'use server'

import { createClient } from '@/utils/supabase/server'

export type Product = {
    id: string
    name: string
    sku: string
    shopifyStock: number
    etsyStock: number | null  // null = Etsy not connected
    status: 'synced' | 'mismatch' | 'low' | 'pending_etsy' | 'pending_shopify'
    lastSync: string
}

export type ProductsResponse = {
    products: Product[]
    isEtsyConnected: boolean
    isShopifyConnected: boolean
}

export async function getProducts(searchQuery: string = ''): Promise<Product[]> {
    const response = await getProductsWithMeta(searchQuery)
    return response.products
}

export async function getProductsWithMeta(searchQuery: string = ''): Promise<ProductsResponse> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { products: [], isEtsyConnected: false, isShopifyConnected: false }

    // Get shop info including connection status
    const { data: shopData } = await supabase
        .from('shops')
        .select('id, etsy_connected, shopify_connected, is_active, access_token')
        .eq('owner_id', user.id)
        .maybeSingle()

    if (!shopData) return { products: [], isEtsyConnected: false, isShopifyConnected: false }

    // Determine connection status
    const isEtsyConnected = shopData.etsy_connected === true
    const isShopifyConnected = shopData.shopify_connected === true ||
        (shopData.is_active === true && !!shopData.access_token)

    // Fetch inventory items with levels
    let query = supabase
        .from('inventory_items')
        .select(`
            id, sku, name, updated_at,
            inventory_levels (
                available_stock,
                market_iso
            )
        `)
        .eq('shop_id', shopData.id)
        .order('updated_at', { ascending: false })

    if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`)
    }

    const { data, error } = await query

    if (error || !data) return { products: [], isEtsyConnected, isShopifyConnected }

    const products = data.map((item: any) => {
        const totalStock = item.inventory_levels?.reduce(
            (sum: number, l: any) => sum + (l.available_stock || 0), 0
        ) || 0

        // Determine status based on connection state
        let status: Product['status'] = 'synced'

        if (!isEtsyConnected && isShopifyConnected) {
            status = 'pending_etsy'
        } else if (!isShopifyConnected && isEtsyConnected) {
            status = 'pending_shopify'
        } else if (totalStock < 5 && totalStock > 0) {
            status = 'low'
        } else if (totalStock === 0) {
            status = 'low'
        }

        return {
            id: item.id,
            name: item.name || 'Unnamed Product',
            sku: item.sku || 'NO-SKU',
            shopifyStock: totalStock,
            etsyStock: isEtsyConnected ? totalStock : null, // null when Etsy not connected
            status: status,
            lastSync: timeAgo(new Date(item.updated_at))
        }
    })

    return { products, isEtsyConnected, isShopifyConnected }
}

function timeAgo(date: Date) {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}
