'use server'

import { getValidatedUserContext } from '@/utils/supabase/admin'
import { getPlanConfig, PLAN_CONFIG } from '@/config/plans'

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
}

export type ShopSettings = {
    // Sync
    sync_direction: SyncDirection
    auto_sync_enabled: boolean
    low_stock_threshold: number
    
    // Permissions/Toggles
    auto_create_products: boolean
    auto_update_products: boolean
    auto_delete_products: boolean

    // Locations
    location_deduction_order: string[]

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
    low_stock_threshold: 5,
    auto_create_products: false,
    auto_update_products: false,
    auto_delete_products: false,
    location_deduction_order: [],
    price_sync_enabled: false,
    price_rules: [],
    notification_channels: { in_app: true, email: false, slack_webhook_url: null },
    notification_events: { stock_zero: true, sync_failed: true, oversell_risk: true },
    notification_frequency: 'instant',
    notification_email: null
}

function applyPlanRestrictions(settings: ShopSettings, planType?: string | null): ShopSettings {
    const plan = getPlanConfig(planType) || PLAN_CONFIG.starter
    const next = { ...settings }

    if (!plan.capabilities.priceRules) {
        next.price_sync_enabled = false
        next.price_rules = []
    }

    if (!plan.capabilities.merchantAlerts) {
        next.notification_events = {
            ...next.notification_events,
            stock_zero: false,
            oversell_risk: false,
            sync_failed: true,
        }
    }

    if (!plan.capabilities.emailNotifications) {
        next.notification_channels = {
            ...next.notification_channels,
            email: false,
        }
        next.notification_email = null
    }

    return next
}

// ─── Get Settings ────────────────────────────

export async function getSettings(): Promise<ShopSettings> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return DEFAULT_SETTINGS

    const { data: shop } = await supabase
        .from('shops')
        .select('id, plan_type')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return applyPlanRestrictions(DEFAULT_SETTINGS, null)

    const { data: settings, error } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('shop_id', shop.id)
        .maybeSingle()

    if (error || !settings) {
        console.log('[Settings] No settings found, returning defaults')
        return applyPlanRestrictions(DEFAULT_SETTINGS, shop.plan_type)
    }

    return applyPlanRestrictions({
        sync_direction: settings.sync_direction || DEFAULT_SETTINGS.sync_direction,
        auto_sync_enabled: settings.auto_sync_enabled ?? DEFAULT_SETTINGS.auto_sync_enabled,
        low_stock_threshold: settings.low_stock_threshold ?? DEFAULT_SETTINGS.low_stock_threshold,
        auto_create_products: settings.auto_create_products ?? DEFAULT_SETTINGS.auto_create_products,
        auto_update_products: settings.auto_update_products ?? DEFAULT_SETTINGS.auto_update_products,
        auto_delete_products: settings.auto_delete_products ?? DEFAULT_SETTINGS.auto_delete_products,
        location_deduction_order: settings.location_deduction_order || DEFAULT_SETTINGS.location_deduction_order,
        price_sync_enabled: settings.price_sync_enabled ?? DEFAULT_SETTINGS.price_sync_enabled,
        price_rules: settings.price_rules || DEFAULT_SETTINGS.price_rules,
        notification_channels: settings.notification_channels || DEFAULT_SETTINGS.notification_channels,
        notification_events: settings.notification_events || DEFAULT_SETTINGS.notification_events,
        notification_frequency: settings.notification_frequency || DEFAULT_SETTINGS.notification_frequency,
        notification_email: settings.notification_email || DEFAULT_SETTINGS.notification_email
    }, shop.plan_type)
}

// ─── Update Settings ─────────────────────────

export async function updateSettings(
    updates: Partial<ShopSettings>
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    const { data: shop } = await supabase
        .from('shops')
        .select('id, plan_type')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { success: false, message: 'Shop not found' }

    const normalizedUpdates = { ...updates }
    const plan = getPlanConfig(shop.plan_type) || PLAN_CONFIG.starter

    if (!plan.capabilities.priceRules) {
        normalizedUpdates.price_sync_enabled = false
        normalizedUpdates.price_rules = []
    }

    if (!plan.capabilities.merchantAlerts) {
        normalizedUpdates.notification_events = {
            ...(normalizedUpdates.notification_events || DEFAULT_SETTINGS.notification_events),
            stock_zero: false,
            oversell_risk: false,
            sync_failed: true,
        }
    }

    if (!plan.capabilities.emailNotifications) {
        normalizedUpdates.notification_channels = {
            ...(normalizedUpdates.notification_channels || DEFAULT_SETTINGS.notification_channels),
            email: false,
        }
        normalizedUpdates.notification_email = null
    }

    if (
        normalizedUpdates.notification_events?.oversell_risk &&
        (!normalizedUpdates.low_stock_threshold || normalizedUpdates.low_stock_threshold < 1)
    ) {
        normalizedUpdates.low_stock_threshold = DEFAULT_SETTINGS.low_stock_threshold
    }

    // Build the update payload — only include provided fields
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (normalizedUpdates.sync_direction !== undefined) payload.sync_direction = normalizedUpdates.sync_direction
    if (normalizedUpdates.auto_sync_enabled !== undefined) payload.auto_sync_enabled = normalizedUpdates.auto_sync_enabled
    if (normalizedUpdates.low_stock_threshold !== undefined) payload.low_stock_threshold = normalizedUpdates.low_stock_threshold
    if (normalizedUpdates.price_sync_enabled !== undefined) payload.price_sync_enabled = normalizedUpdates.price_sync_enabled
    if (normalizedUpdates.price_rules !== undefined) payload.price_rules = normalizedUpdates.price_rules
    if (normalizedUpdates.notification_channels !== undefined) payload.notification_channels = normalizedUpdates.notification_channels
    if (normalizedUpdates.notification_events !== undefined) payload.notification_events = normalizedUpdates.notification_events
    if (normalizedUpdates.notification_frequency !== undefined) payload.notification_frequency = normalizedUpdates.notification_frequency
    if (normalizedUpdates.notification_email !== undefined) payload.notification_email = normalizedUpdates.notification_email
    
    if (normalizedUpdates.auto_create_products !== undefined) payload.auto_create_products = normalizedUpdates.auto_create_products
    if (normalizedUpdates.auto_update_products !== undefined) payload.auto_update_products = normalizedUpdates.auto_update_products
    if (normalizedUpdates.auto_delete_products !== undefined) payload.auto_delete_products = normalizedUpdates.auto_delete_products
    if (normalizedUpdates.location_deduction_order !== undefined) payload.location_deduction_order = normalizedUpdates.location_deduction_order

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
