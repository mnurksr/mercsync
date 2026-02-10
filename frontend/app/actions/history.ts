'use server'

import { createClient } from '@/utils/supabase/server'

export type HistoryItem = {
    id: string
    action: string
    product: string | null
    from: string | null
    to: string | null
    change: string
    time: string
    status: 'success' | 'warning' | 'error'
}

export async function getSyncHistory(filter: string = 'all'): Promise<HistoryItem[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const { data: userShops } = await supabase.from('shops').select('id').eq('owner_id', user.id)
    const shopIds = userShops?.map(s => s.id) || []

    if (shopIds.length === 0) return []

    let query = supabase
        .from('inventory_ledger')
        .select(`
            id, created_at, reason_code, change_amount, previous_balance, new_balance, source_platform,
            inventory_items (name)
        `)
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(50)

    const { data, error } = await query

    if (error || !data) return []

    return data.map((item: any) => ({
        id: item.id,
        action: mapReasonToAction(item.reason_code),
        product: item.inventory_items?.name || 'Unknown',
        from: item.source_platform || 'system',
        to: null, // Ledger is single source usually
        change: `${item.previous_balance} → ${item.new_balance}`,
        time: timeAgo(new Date(item.created_at)),
        status: 'success' // Defaulting to success
    }))
}

function mapReasonToAction(code: string) {
    const map: Record<string, string> = {
        'ORDER': 'Order Fulfilled',
        'RESTOCK': 'Restock',
        'DAMAGE': 'Damage Adjustment',
        'RETURN': 'Return Processed',
        'ADJUSTMENT': 'Manual Adjustment',
        'SHIPMENT': 'Shipment',
        'RESERVATION_EXPIRED': 'Reservation Expired'
    }
    return map[code] || code
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
