'use server'

import { getValidatedUserContext } from '@/utils/supabase/admin'
import { sendNotificationEmail, buildNotificationHtml } from '../api/sync/lib/resend'

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

/**
 * Resolve a relative path to the full Shopify embedded app URL.
 * Uses APP_URL env var or constructs from NEXT_PUBLIC_SHOPIFY_APP_URL.
 */
function resolveActionUrl(relativePath: string | null): string | null {
    if (!relativePath) return null;
    // If it's already absolute, return as-is
    if (relativePath.startsWith('http')) return relativePath;

    // Build absolute URL from env
    const baseUrl = process.env.APP_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || process.env.NEXT_PUBLIC_SHOPIFY_APP_URL
        || 'https://mercsync.com';

    return `${baseUrl.replace(/\/$/, '')}${relativePath}`;
}

/**
 * Trigger a notification for a shop.
 * Handles both in-app alerts and email (via Resend if configured).
 */
export async function createNotification(
    supabase: any,
    shopId: string,
    type: 'stock_zero' | 'sync_failed' | 'oversell_risk' | 'new_order' | 'token_expiring',
    title: string,
    message: string,
    actionUrl: string | null = null
) {
    // 1. Fetch shop settings to see if this event is enabled
    const { data: settings } = await supabase
        .from('shop_settings')
        .select('notification_channels, notification_events, notification_email')
        .eq('shop_id', shopId)
        .maybeSingle()

    if (!settings) return

    const { notification_channels: channels, notification_events: events } = settings
    const eventEnabled = events?.[type]
    if (!eventEnabled) return

    // 2. In-App Notification
    if (channels?.in_app) {
        await supabase.from('notifications').insert({
            shop_id: shopId,
            type: type,
            title: title,
            message: message,
            action_url: actionUrl,
            is_read: false
        })
    }

    // 3. Email Notification (Resend) — resolve URL to absolute
    if (channels?.email && settings.notification_email) {
        const absoluteUrl = resolveActionUrl(actionUrl);
        const html = buildNotificationHtml(title, message, absoluteUrl, type)
        await sendNotificationEmail(settings.notification_email, `[MercSync] ${title}`, html)
    }
}
