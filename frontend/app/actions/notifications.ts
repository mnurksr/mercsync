'use server'

import { getValidatedUserContext } from '@/utils/supabase/admin'

export type NotificationItem = {
    id: string
    type: string
    title: string
    message: string
    is_read: boolean
    action_url: string | null
    created_at: string
}

export async function getNotifications(): Promise<NotificationItem[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const { data: userShops } = await supabase.from('shops').select('id').eq('owner_id', ownerId)
    const shopIds = userShops?.map(s => s.id) || []

    if (shopIds.length === 0) return []

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .in('shop_id', shopIds)
        .order('created_at', { ascending: false })
        .limit(20)

    if (error || !data) return []
    return data
}

export async function markAsRead(notificationId: string) {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return

    // Since RLS is enabled, we just try to update
    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
}

export async function markAllAsRead() {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return

    const { data: userShops } = await supabase.from('shops').select('id').eq('owner_id', ownerId)
    const shopIds = userShops?.map(s => s.id) || []

    if (shopIds.length === 0) return

    await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('shop_id', shopIds)
        .eq('is_read', false)
}
