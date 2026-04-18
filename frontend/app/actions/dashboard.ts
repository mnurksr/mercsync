'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type DashboardStats = {
    productsSynced: number
    syncSuccessRate: number
    atRiskProducts: number
    connectedStores: number
    lastSync: string
    matchedProducts: number
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

        if (!resolvedOwnerId) return { productsSynced: 0, syncSuccessRate: 0, atRiskProducts: 0, connectedStores: 0, lastSync: '--' }
    }

    // Connected Stores
    const { count: storeCount } = await supabase
        .from('shops')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', resolvedOwnerId)
        .eq('is_active', true)

    // Products Synced (Total items)
    const { count: productCount } = await supabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
    // Assuming we filter by shop_id which belongs to user, but simplify:
    // Join shops to filter by owner_id? 
    // Or simpler: We need to know which shops belong to user first.
    // For MVP, lets assume RLS filters items by shop ownership or we join.
    // inventory_items has shop_id.
    // Let's get user's shops first.

    const { data: userShops } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)

    const shopIds = userShops?.map(s => s.id) || []

    let totalProducts = 0
    let riskProducts = 0

    if (shopIds.length > 0) {
        const { count } = await supabase
            .from('inventory_items')
            .select('*', { count: 'exact', head: true })
            .in('shop_id', shopIds)
        totalProducts = count || 0

        // At Risk: Low stock (<5)
        const { count: riskCount } = await supabase
            .from('inventory_items')
            .select('*', { count: 'exact', head: true })
            .in('shop_id', shopIds)
            .lt('master_stock', 5)
        riskProducts = riskCount || 0
    }

    // Success Rate & Last Sync from Ledger
    let successRate = 0
    let lastSyncTime = '--'

    if (shopIds.length > 0) {
        const { data: ledger } = await supabase
            .from('inventory_ledger')
            .select('created_at, reason_code')
            .in('shop_id', shopIds)
            .order('created_at', { ascending: false })
            .limit(100)

        if (ledger && ledger.length > 0) {
            // Calculate relative time for last sync
            const lastDate = new Date(ledger[0].created_at)
            const diffMs = Date.now() - lastDate.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            if (diffMins < 1) lastSyncTime = 'Just now'
            else if (diffMins < 60) lastSyncTime = `${diffMins}m ago`
            else if (diffMins < 1440) lastSyncTime = `${Math.floor(diffMins / 60)}h ago`
            else lastSyncTime = `${Math.floor(diffMins / 1440)}d ago`

            // Calculate success rate: entries with known sync reason codes are successful
            const errorCodes = ['sync_error', 'api_error', 'rate_limit', 'timeout']
            const errorCount = ledger.filter(e => errorCodes.includes(e.reason_code)).length
            successRate = Math.round(((ledger.length - errorCount) / ledger.length) * 100)
        }
    }

    // Matched products count (products with both Shopify and Etsy IDs)
    let matchedCount = 0
    if (shopIds.length > 0) {
        const { count } = await supabase
            .from('inventory_items')
            .select('*', { count: 'exact', head: true })
            .in('shop_id', shopIds)
            .not('shopify_variant_id', 'is', null)
            .not('etsy_variant_id', 'is', null)
        matchedCount = count || 0
    }

    return {
        productsSynced: totalProducts,
        syncSuccessRate: successRate,
        atRiskProducts: riskProducts,
        connectedStores: storeCount || 0,
        lastSync: lastSyncTime,
        matchedProducts: matchedCount
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

    // Fetch from inventory_ledger + join inventory_items for product name
    const { data, error } = await supabase
        .from('inventory_ledger')
        .select(`
            id,
            reason_code,
            created_at,
            change_amount,
            source_platform,
            inventory_items (name)
        `)
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(5)

    if (error || !data) return []

    return data.map((item: any) => ({
        id: item.id,
        action: formatFrendlyAction(item.reason_code),
        product: item.inventory_items?.name || 'Unknown Product',
        platform: item.source_platform || 'system',
        time: timeAgo(new Date(item.created_at)),
        status: 'success' // Default to success as ledger records successful changes
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
