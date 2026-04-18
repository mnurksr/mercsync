'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type DashboardStats = {
    totalProducts: number
    shopifyProductCount: number
    etsyProductCount: number
    matchedProducts: number
    mismatchCount: number
    actionRequiredCount: number
    connectedStores: number
    lastSync: string
    mismatchItems: any[]
    actionRequiredItems: any[]
}

export type ActivityItem = {
    id: string
    action: string
    product: string | null
    platform: string | null
    time: string
    status: 'success' | 'warning' | 'error'
}

export async function getDashboardStats(ownerId?: string): Promise<DashboardStats> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) return { totalProducts: 0, shopifyProductCount: 0, etsyProductCount: 0, matchedProducts: 0, mismatchCount: 0, actionRequiredCount: 0, connectedStores: 0, lastSync: '--', mismatchItems: [], actionRequiredItems: [] }
    }

    // 1. Get user's shops
    const { data: userShops } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .eq('is_active', true)

    const shopIds = userShops?.map(s => s.id) || []
    const storeCount = shopIds.length

    if (shopIds.length === 0) {
        return { 
            totalProducts: 0, 
            shopifyProductCount: 0,
            etsyProductCount: 0,
            matchedProducts: 0, 
            mismatchCount: 0, 
            actionRequiredCount: 0, 
            connectedStores: 0, 
            lastSync: '--', 
            mismatchItems: [], 
            actionRequiredItems: [] 
        }
    }

    // 2. Count Unique Products and Collect Alerts
    const { data: productStats } = await supabase
        .from('inventory_items')
        .select('id, name, sku, image_url, shopify_product_id, etsy_listing_id, status, shopify_stock_snapshot, etsy_stock_snapshot')
        .in('shop_id', shopIds)

    let uniqueProducts = new Set<string>()
    let shopifyProducts = new Set<string>()
    let etsyProducts = new Set<string>()
    let matchedProductsSet = new Set<string>()
    let mismatchItems: any[] = []
    let actionRequiredItems: any[] = []

    if (productStats) {
        productStats.forEach((item: any) => {
            const productKey = item.shopify_product_id || item.etsy_listing_id
            if (productKey) uniqueProducts.add(productKey)

            if (item.shopify_product_id) shopifyProducts.add(item.shopify_product_id)
            if (item.etsy_listing_id) etsyProducts.add(item.etsy_listing_id)

            if (item.shopify_product_id && item.etsy_listing_id) {
                matchedProductsSet.add(productKey!)
            }

            // Variant level checks
            if (item.status === 'Action Required') {
                actionRequiredItems.push(item)
            } else if (item.status === 'MISMATCH' || item.status === 'Mismatch' || item.shopify_stock_snapshot !== item.etsy_stock_snapshot) {
                // Only count mismatch if both IDs are present (it's a linked item)
                if (item.shopify_product_id && item.etsy_listing_id) {
                    mismatchItems.push(item)
                }
            }
        })
    }

    // 3. Last Sync from Ledger
    let lastSyncTime = '--'
    const { data: ledger } = await supabase
        .from('inventory_ledger')
        .select('created_at')
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(1)

    if (ledger && ledger.length > 0) {
        const lastDate = new Date(ledger[0].created_at)
        const diffMs = Date.now() - lastDate.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        if (diffMins < 1) lastSyncTime = 'Just now'
        else if (diffMins < 60) lastSyncTime = `${diffMins}m ago`
        else if (diffMins < 1440) lastSyncTime = `${Math.floor(diffMins / 60)}h ago`
        else lastSyncTime = `${Math.floor(diffMins / 1440)}d ago`
    }

    return {
        totalProducts: uniqueProducts.size,
        shopifyProductCount: shopifyProducts.size,
        etsyProductCount: etsyProducts.size,
        matchedProducts: matchedProductsSet.size,
        mismatchCount: mismatchItems.length,
        actionRequiredCount: actionRequiredItems.length,
        connectedStores: storeCount,
        lastSync: lastSyncTime,
        mismatchItems: mismatchItems.slice(0, 5), // Only top 5 for dashboard
        actionRequiredItems: actionRequiredItems.slice(0, 5)
    }
}

export async function getRecentActivity(ownerId?: string): Promise<ActivityItem[]> {
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

    const { data: userShops } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)

    const shopIds = userShops?.map(s => s.id) || []

    if (shopIds.length === 0) return []

    // Fetch from sync_logs. We'll try to join inventory_items but won't let it fail the query.
    const { data, error } = await supabase
        .from('sync_logs')
        .select(`
            id,
            event_type,
            created_at,
            old_stock,
            new_stock,
            source,
            status,
            inventory_item_id
        `)
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(5)

    if (error || !data) {
        console.error('[Dashboard Activity] Error fetching sync_logs:', error);
        return [];
    }

    // Since we removed the join from the SQL to be safe, we'll fetch names if needed 
    // or just rely on the fact that sync history usually has the details. 
    // For a faster dashboard, we can just return the events.
    return data.map((item: any) => ({
        id: item.id,
        action: formatFrendlyAction(item.event_type),
        product: 'Synchronized Item', // Simplified to ensure it always renders
        platform: item.source || 'system',
        time: timeAgo(new Date(item.created_at)),
        status: item.status === 'failed' ? 'error' : 'success'
    }))
}

function formatFrendlyAction(code: string) {
    return code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
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
