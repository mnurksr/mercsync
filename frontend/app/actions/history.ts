'use server'

import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

export type HistoryItem = {
    id: string
    action: string
    product: string | null
    imageUrl: string | null
    source: string
    direction: string | null
    oldStock: number | null
    newStock: number | null
    status: 'success' | 'failed' | 'skipped'
    errorMessage: string | null
    metadata: any
    time: string
    rawTime: string
}

export async function getSyncHistory(filter: string = 'all'): Promise<HistoryItem[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: userShops } = await supabase.from('shops').select('id').eq('owner_id', ownerId)
    const shopIds = userShops?.map(s => s.id) || []

    if (shopIds.length === 0) return []

    let query = supabase
        .from('sync_logs')
        .select(`
            id, source, event_type, direction,
            old_stock, new_stock, status, error_message, metadata,
            created_at,
            inventory_items (name, image_url)
        `)
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(100)

    if (filter !== 'all') {
        query = query.eq('status', filter)
    }

    const { data, error } = await query

    if (error || !data) return []

    return data.map((item: any) => ({
        id: item.id,
        action: mapEventToAction(item.event_type, item.source),
        product: item.inventory_items?.name || null,
        imageUrl: item.inventory_items?.image_url || null,
        source: item.source,
        direction: item.direction,
        oldStock: item.old_stock,
        newStock: item.new_stock,
        status: item.status,
        errorMessage: item.error_message,
        metadata: item.metadata || {},
        time: timeAgo(new Date(item.created_at)),
        rawTime: item.created_at
    }))
}

function mapEventToAction(eventType: string, source: string): string {
    const map: Record<string, string> = {
        'stock_update': 'Stock Synchronized',
        'price_update': 'Price Updated',
        'order': source === 'etsy' ? 'Etsy Order Detected' : 'Shopify Order Processed',
        'webhook': 'System Event',
        'full_sync': 'Full Reconciliation'
    }
    return map[eventType] || eventType
}

function timeAgo(date: Date) {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
