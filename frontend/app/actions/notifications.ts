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
 * Build the Shopify embedded app URL from shop_domain and a relative path.
 * Example: shop_domain='shopiauto-test.myshopify.com', path='/dashboard/inventory'
 * → https://admin.shopify.com/store/shopiauto-test/apps/mercsync-1/dashboard/inventory
 */
function buildEmbeddedAppUrl(shopDomain: string, relativePath: string): string {
    // Extract store name: 'shopiauto-test.myshopify.com' → 'shopiauto-test'
    const storeName = shopDomain.replace('.myshopify.com', '').replace(/^https?:\/\//, '');
    const appSlug = process.env.SHOPIFY_APP_SLUG || 'mercsync-1';
    return `https://admin.shopify.com/store/${storeName}/apps/${appSlug}${relativePath}`;
}

/**
 * Trigger a notification for a shop.
 * Handles both in-app alerts and email (via Resend if configured).
 */
export async function createNotification(
    supabase: any,
    shopId: string,
    type: 'stock_zero' | 'sync_failed' | 'oversell_risk' | 'token_expiring',
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
    
    // Critical events should be ENABLED by default if settings are null or true.
    // Only explicitly 'false' should block them.
    const isCritical = ['stock_zero', 'sync_failed', 'oversell_risk'].includes(type)
    const eventEnabled = events?.[type] ?? isCritical
    
    if (!eventEnabled) return

    // 2. In-App Notification
    // Channels should also default to TRUE for critical events if null/undefined
    const inAppEnabled = channels?.in_app ?? isCritical
    if (inAppEnabled) {
        await supabase.from('notifications').insert({
            shop_id: shopId,
            type: type,
            title: title,
            message: message,
            action_url: actionUrl,
            is_read: false
        })
    }

    // 3. Email Notification (Resend) — build Shopify embedded app URL
    const emailEnabled = channels?.email ?? isCritical
    if (emailEnabled && settings.notification_email) {
        let absoluteUrl: string | null = null;
        if (actionUrl) {
            // Fetch shop_domain for building the embedded URL
            const { data: shop } = await supabase
                .from('shops')
                .select('shop_domain')
                .eq('id', shopId)
                .maybeSingle();
            
            if (shop?.shop_domain && !actionUrl.startsWith('http')) {
                absoluteUrl = buildEmbeddedAppUrl(shop.shop_domain, actionUrl);
            } else {
                absoluteUrl = actionUrl;
            }
        }
        const html = buildNotificationHtml(title, message, absoluteUrl, type)
        await sendNotificationEmail(settings.notification_email, `[MercSync] ${title}`, html)
    }
}
