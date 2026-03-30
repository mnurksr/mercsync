'use server'

import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

// ─── Types ───────────────────────────────────

export type SyncDirection = 'shopify_to_etsy' | 'etsy_to_shopify' | 'bidirectional'
export type NotificationFrequency = 'instant' | 'hourly' | 'daily'

export type PriceRule = {
    platform: 'etsy' | 'shopify'
    type: 'percentage' | 'fixed'
    value: number
    rounding: 'none' | 'nearest_99' | 'nearest_95' | 'round_up'
}

export type NotificationChannels = {
    in_app: boolean
    email: boolean
    slack_webhook_url: string | null
}

export type NotificationEvents = {
    stock_zero: boolean
    sync_failed: boolean
    oversell_risk: boolean
    token_expiring: boolean
}

export type ShopSettings = {
    // Sync
    sync_direction: SyncDirection
    auto_sync_enabled: boolean
    low_stock_threshold: number
    
    // Auto Product Sync
    auto_create_products: boolean
    auto_update_products: boolean
    auto_delete_products: boolean

    // Price
    price_sync_enabled: boolean
    price_rules: PriceRule[]

    // Notifications
    notification_channels: NotificationChannels
    notification_events: NotificationEvents
    notification_frequency: NotificationFrequency
    notification_email: string | null
}

// ─── Default values ──────────────────────────

const DEFAULT_SETTINGS: ShopSettings = {
    sync_direction: 'bidirectional',
    auto_sync_enabled: false,
    low_stock_threshold: 0,
    auto_create_products: false,
    auto_update_products: false,
    auto_delete_products: false,
    price_sync_enabled: false,
    price_rules: [],
    notification_channels: { in_app: true, email: false, slack_webhook_url: null },
    notification_events: { stock_zero: true, sync_failed: true, oversell_risk: true, token_expiring: true },
    notification_frequency: 'instant',
    notification_email: null
}

// ─── Get Settings ────────────────────────────

export async function getSettings(): Promise<ShopSettings> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return DEFAULT_SETTINGS

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return DEFAULT_SETTINGS

    const { data: settings, error } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('shop_id', shop.id)
        .maybeSingle()

    if (error || !settings) {
        console.log('[Settings] No settings found, returning defaults')
        return DEFAULT_SETTINGS
    }

    return {
        sync_direction: settings.sync_direction || DEFAULT_SETTINGS.sync_direction,
        auto_sync_enabled: settings.auto_sync_enabled ?? DEFAULT_SETTINGS.auto_sync_enabled,
        low_stock_threshold: settings.low_stock_threshold ?? DEFAULT_SETTINGS.low_stock_threshold,
        auto_create_products: settings.auto_create_products ?? DEFAULT_SETTINGS.auto_create_products,
        auto_update_products: settings.auto_update_products ?? DEFAULT_SETTINGS.auto_update_products,
        auto_delete_products: settings.auto_delete_products ?? DEFAULT_SETTINGS.auto_delete_products,
        price_sync_enabled: settings.price_sync_enabled ?? DEFAULT_SETTINGS.price_sync_enabled,
        price_rules: settings.price_rules || DEFAULT_SETTINGS.price_rules,
        notification_channels: settings.notification_channels || DEFAULT_SETTINGS.notification_channels,
        notification_events: settings.notification_events || DEFAULT_SETTINGS.notification_events,
        notification_frequency: settings.notification_frequency || DEFAULT_SETTINGS.notification_frequency,
        notification_email: settings.notification_email || DEFAULT_SETTINGS.notification_email
    }
}

// ─── Update Settings ─────────────────────────

export async function updateSettings(
    updates: Partial<ShopSettings>
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { success: false, message: 'Shop not found' }

    // Build the update payload — only include provided fields
    const payload: any = { updated_at: new Date().toISOString() }

    if (updates.sync_direction !== undefined) payload.sync_direction = updates.sync_direction
    if (updates.auto_sync_enabled !== undefined) payload.auto_sync_enabled = updates.auto_sync_enabled
    if (updates.low_stock_threshold !== undefined) payload.low_stock_threshold = updates.low_stock_threshold
    if (updates.price_sync_enabled !== undefined) payload.price_sync_enabled = updates.price_sync_enabled
    if (updates.price_rules !== undefined) payload.price_rules = updates.price_rules
    if (updates.notification_channels !== undefined) payload.notification_channels = updates.notification_channels
    if (updates.notification_events !== undefined) payload.notification_events = updates.notification_events
    if (updates.notification_frequency !== undefined) payload.notification_frequency = updates.notification_frequency
    if (updates.notification_email !== undefined) payload.notification_email = updates.notification_email
    
    if (updates.auto_create_products !== undefined) payload.auto_create_products = updates.auto_create_products
    if (updates.auto_update_products !== undefined) payload.auto_update_products = updates.auto_update_products
    if (updates.auto_delete_products !== undefined) payload.auto_delete_products = updates.auto_delete_products

    // Upsert: insert if not exists, update if exists
    const { error } = await supabase
        .from('shop_settings')
        .upsert(
            { shop_id: shop.id, ...payload },
            { onConflict: 'shop_id' }
        )

    if (error) {
        console.error('[Settings] Update failed:', error)
        return { success: false, message: `Failed to save settings: ${error.message}` }
    }

    return { success: true, message: 'Settings saved successfully' }
}
