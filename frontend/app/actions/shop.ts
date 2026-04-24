'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'
import { getPlanConfig, PLAN_CONFIG } from '@/config/plans'
import { getShop } from '@/app/api/sync/lib/etsy'
import { syncShopPlanWithBilling } from '@/app/api/billing/lib/subscription'

export type ShopConnection = {
    connected: boolean
    shop_domain: string | null
    last_sync: string | null
    platform: 'shopify' | 'etsy'
    owner_id?: string | null
    plan_type?: string | null
    shopify_currency?: string
    etsy_currency?: string
    debugMessage?: string
}

export async function getConnectedShop(platform: string = 'shopify', testShopDomain?: string): Promise<ShopConnection> {
    let supabase;
    let resolvedOwnerId = null;

    if (testShopDomain) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) {
            console.log('getConnectedShop: No user found')
            return {
                connected: false,
                shop_domain: null,
                last_sync: null,
                platform: platform as 'shopify' | 'etsy',
                debugMessage: `Auth failed or no user`
            }
        }
    }

    let shopQuery = supabase.from('shops').select('shop_domain, etsy_shop_id, is_active, plan_type, created_at, owner_id, shopify_connected, etsy_connected, access_token, etsy_access_token, shopify_currency, etsy_currency');

    if (testShopDomain) {
        // Test mode: bypass auth using admin client, query by shop domain
        shopQuery = shopQuery.eq('shop_domain', testShopDomain)
    } else {
        shopQuery = shopQuery.eq('owner_id', resolvedOwnerId)
    }

    // Log intent
    if (testShopDomain) {
        console.log(`getConnectedShop: TEST MODE with ADMIN CLIENT looking for domain: ${testShopDomain} for platform ${platform}`)
    } else {
        console.log(`getConnectedShop: Checking for user ${resolvedOwnerId} platform ${platform}`)
    }

    try {
        if (platform === 'shopify') {
            const { data, error } = await supabase
                .from('shops')
                .select('shop_domain, etsy_shop_id, is_active, plan_type, created_at, owner_id, shopify_connected, etsy_connected, access_token, etsy_access_token, shopify_currency, etsy_currency')
                .eq(testShopDomain ? 'shop_domain' : 'owner_id', testShopDomain || resolvedOwnerId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            console.log('getConnectedShop: Query result', { data, error })

            if (error) {
                console.warn('getConnectedShop: Potential schema mismatch, falling back to core fields', error)
                // Fallback attempt: select only core fields (without currency)
                const { data: coreData, error: coreError } = await supabase
                    .from('shops')
                    .select('shop_domain, etsy_shop_id, is_active, plan_type, created_at, owner_id, shopify_connected, etsy_connected, access_token, etsy_access_token')
                    .eq(testShopDomain ? 'shop_domain' : 'owner_id', testShopDomain || resolvedOwnerId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                
                if (coreError || !coreData) {
                    return { connected: false, shop_domain: null, last_sync: null, platform: 'shopify', debugMessage: coreError?.message || 'Not found' }
                }
                
                const isConnected = !!coreData.access_token && !!coreData.shop_domain;
                let resolvedPlanType = coreData.plan_type;

                if (isConnected && coreData.shop_domain && coreData.access_token) {
                    try {
                        const billingState = await syncShopPlanWithBilling(
                            createAdminClient(),
                            coreData.shop_domain,
                            coreData.access_token,
                            coreData.plan_type
                        );
                        resolvedPlanType = billingState.planType || (billingState.status === 'inactive' ? 'guest' : coreData.plan_type);
                    } catch (billingError) {
                        console.warn('[getConnectedShop] Failed to sync Shopify billing state (fallback path):', billingError);
                    }
                }

                return {
                    connected: isConnected,
                    shop_domain: coreData.shop_domain,
                    last_sync: coreData.created_at ? new Date(coreData.created_at).toLocaleString() : 'Just now',
                    platform: 'shopify',
                    owner_id: coreData.owner_id,
                    plan_type: resolvedPlanType,
                    shopify_currency: 'USD',
                    etsy_currency: 'USD',
                    debugMessage: `Fallback: ${isConnected}`
                }
            }

            if (!data) {
                return { connected: false, shop_domain: null, last_sync: null, platform: 'shopify', debugMessage: 'No shop record found.' }
            }

            const isConnected = !!data.access_token && !!data.shop_domain;
            let resolvedPlanType = data.plan_type;

            if (isConnected && data.shop_domain && data.access_token) {
                try {
                    const billingState = await syncShopPlanWithBilling(
                        createAdminClient(),
                        data.shop_domain,
                        data.access_token,
                        data.plan_type
                    );
                    resolvedPlanType = billingState.planType || (billingState.status === 'inactive' ? 'guest' : data.plan_type);
                } catch (billingError) {
                    console.warn('[getConnectedShop] Failed to sync Shopify billing state:', billingError);
                }
            }

            return {
                connected: isConnected,
                shop_domain: data.shop_domain,
                last_sync: data.created_at ? new Date(data.created_at).toLocaleString() : 'Just now',
                platform: 'shopify',
                owner_id: data.owner_id,
                plan_type: resolvedPlanType,
                shopify_currency: 'USD',
                etsy_currency: 'USD',
                debugMessage: `Connected (has_token=${!!data.access_token})`
            }
        }

        // Etsy connection logic
        if (platform === 'etsy') {
            const { data, error } = await supabase
                .from('shops')
                .select('shop_domain, etsy_shop_id, is_active, plan_type, created_at, owner_id, shopify_connected, etsy_connected, etsy_access_token, shopify_currency, etsy_currency')
                .eq(testShopDomain ? 'shop_domain' : 'owner_id', testShopDomain || resolvedOwnerId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) {
                // Core fields fallback for Etsy
                const { data: coreData, error: coreError } = await supabase
                    .from('shops')
                    .select('shop_domain, etsy_shop_id, is_active, plan_type, created_at, owner_id, shopify_connected, etsy_connected, etsy_access_token')
                    .eq(testShopDomain ? 'shop_domain' : 'owner_id', testShopDomain || resolvedOwnerId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                
                if (coreError || !coreData) {
                    return { connected: false, shop_domain: null, last_sync: null, platform: 'etsy', debugMessage: coreError?.message || 'Not found' }
                }

                const isConnected = !!coreData.etsy_access_token && coreData.etsy_access_token.length > 0;
                return {
                    connected: isConnected,
                    shop_domain: coreData.etsy_shop_id ? `${coreData.etsy_shop_id} (Etsy Shop)` : (coreData.shop_domain || 'Connected'),
                    last_sync: coreData.created_at ? new Date(coreData.created_at).toLocaleString() : 'Just now',
                    platform: 'etsy',
                    owner_id: coreData.owner_id,
                    plan_type: coreData.plan_type,
                    shopify_currency: 'USD',
                    etsy_currency: 'USD',
                    debugMessage: `Fallback: ${isConnected}`
                }
            }

            if (!data) {
                return { connected: false, shop_domain: null, last_sync: null, platform: 'etsy', debugMessage: 'No shop record found' }
            }

            const isConnected = !!data.etsy_access_token && data.etsy_access_token.length > 0;
            return {
                connected: isConnected,
                shop_domain: data.etsy_shop_id ? `${data.etsy_shop_id} (Etsy Shop)` : (data.shop_domain || 'Connected'),
                last_sync: data.created_at ? new Date(data.created_at).toLocaleString() : 'Just now',
                platform: 'etsy',
                owner_id: data.owner_id,
                plan_type: data.plan_type,
                shopify_currency: 'USD',
                etsy_currency: 'USD',
                debugMessage: `Connected (has_token=${!!data.etsy_access_token})`
            }
        }

        return {
            connected: false,
            shop_domain: null,
            last_sync: null,
            platform: platform as 'shopify' | 'etsy',
            debugMessage: 'Unknown platform'
        }

    } catch (e: any) {
        console.error('Error fetching connected shop:', e)
        return {
            connected: false,
            shop_domain: null,
            last_sync: null,
            platform: platform as 'shopify' | 'etsy',
            debugMessage: `Exception caught: ${e.message}`
        }
    }
}

export async function disconnectShop(platform: string = 'shopify', ownerId?: string): Promise<{ success: boolean; message: string }> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) {
            return { success: false, message: 'Authentication failed' }
        }
    }

    try {
        if (platform === 'shopify') {
            const { error } = await supabase
                .from('shops')
                .update({
                    shopify_connected: false,
                    access_token: null,
                    is_active: false
                })
                .eq('owner_id', resolvedOwnerId)

            if (error) throw error
            return { success: true, message: 'Shopify disconnected' }
        }

        if (platform === 'etsy') {
            // First get the shop ID
            const { data: shop } = await supabase
                .from('shops')
                .select('id')
                .eq('owner_id', resolvedOwnerId)
                .single()

            if (shop) {
                // Delete all Etsy staging products
                await supabase
                    .from('staging_etsy_products')
                    .delete()
                    .eq('shop_id', shop.id)

                // Unmatch all inventory items
                await supabase
                    .from('inventory_items')
                    .update({
                        etsy_variant_id: null,
                        etsy_listing_id: null,
                        etsy_stock_snapshot: 0
                    })
                    .eq('shop_id', shop.id)
            }

            // Clear connection tokens
            const { error } = await supabase
                .from('shops')
                .update({
                    etsy_connected: false,
                    etsy_access_token: null,
                    etsy_refresh_token: null
                })
                .eq('owner_id', resolvedOwnerId)

            if (error) throw error
            return { success: true, message: 'Etsy disconnected and all corresponding data wiped' }
        }

        return { success: false, message: 'Invalid platform' }
    } catch (e: any) {
        console.error('disconnectShop error:', e)
        return { success: false, message: e.message }
    }
}

/**
 * Fetches locations from the connected Shopify store
 */
export async function getShopifyLocations(ownerId?: string): Promise<{ success: boolean; data?: any[]; message?: string }> {
    let supabase;
    let resolvedOwnerId = ownerId;

    if (ownerId) {
        supabase = createAdminClient()
    } else {
        const context = await getValidatedUserContext()
        supabase = context.supabase
        resolvedOwnerId = context.ownerId

        if (!resolvedOwnerId) {
            return { success: false, message: 'User not authenticated' }
        }
    }

    const { data: userShop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', resolvedOwnerId)
        .maybeSingle()

    const shopId = userShop?.id || null;

    if (!shopId) {
        return { success: false, message: 'Shop not found' }
    }

    let shopData = { shop_domain: null as string | null, access_token: null as string | null };

    const { data: shop } = await supabase
        .from('shops')
        .select('id, shop_domain, access_token')
        .eq('id', shopId)
        .maybeSingle()
    if (shop) shopData = { shop_domain: shop.shop_domain, access_token: shop.access_token };

    if (!shopData.shop_domain || !shopData.access_token) {
        return { success: false, message: 'Shopify not fully connected' }
    }

    try {
        const response = await fetch(`https://${shopData.shop_domain}/admin/api/2024-01/locations.json`, {
            headers: {
                'X-Shopify-Access-Token': shopData.access_token,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch locations:', await response.text());
            return { success: false, message: 'Failed to fetch Shopify locations' }
        }

        const data = await response.json();
        return { success: true, data: data.locations || [] };
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

export async function setShopPlanPending(shopDomain: string) {
    const supabase = createAdminClient();
    await supabase
        .from('shops')
        .update({ plan_type: 'pending' })
        .eq('shop_domain', shopDomain)
        .or('plan_type.eq.guest,plan_type.eq.none,plan_type.eq.basic,plan_type.is.null');
}

/**
 * No longer syncs live currencies. Always returns USD.
 */
export async function syncShopCurrencies(): Promise<{ shopify: string; etsy: string }> {
    return { shopify: 'USD', etsy: 'USD' }
}

/**
 * Server Action: Save Shopify location settings.
 * Replaces the broken client-side fetch to /api/sync/location-id
 * which fails in Shopify iframe because user?.id is null.
 * 
 * Uses getValidatedUserContext() to resolve the owner via cookie.
 */
export async function saveShopifyLocations(
    locationIds: string[]
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()

    if (!ownerId) {
        return { success: false, message: 'Not authenticated' }
    }

    if (!locationIds || locationIds.length === 0) {
        return { success: false, message: 'No locations selected' }
    }

    try {
        // 1. Get shop
        const { data: shop } = await supabase
            .from('shops')
            .select('id, shop_domain, access_token, plan_type')
            .eq('owner_id', ownerId)
            .maybeSingle()

        if (!shop || !shop.shop_domain || !shop.access_token) {
            return { success: false, message: 'Shop not found or not fully connected' }
        }

        const plan = getPlanConfig(shop.plan_type) || PLAN_CONFIG.starter
        const maxTrackedLocations = plan.limits.maxTrackedLocations
        if (locationIds.length > maxTrackedLocations) {
            return {
                success: false,
                message: `${plan.name} plan allows tracking up to ${maxTrackedLocations} Shopify location${maxTrackedLocations > 1 ? 's' : ''}. Upgrade to Growth or Pro for multi-location inventory sync.`
            }
        }

        // 2. Save primary location and all selected IDs to shops table
        const primaryLocationId = locationIds[0]
        await supabase
            .from('shops')
            .update({
                main_location_id: primaryLocationId,
                selected_location_ids: locationIds
            })
            .eq('id', shop.id)

        // 3. Propagate selected_location_ids to ALL inventory_items for this shop (idempotent)
        const adminSupabase = createAdminClient()
        await adminSupabase
            .from('inventory_items')
            .update({
                selected_location_ids: locationIds,
                updated_at: new Date().toISOString()
            })
            .eq('shop_id', shop.id)

        // 4. Fetch inventory levels for all selected locations from Shopify
        const url = `https://${shop.shop_domain}/admin/api/2024-01/inventory_levels.json?location_ids=${locationIds.join(',')}`
        const res = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': shop.access_token,
                'Content-Type': 'application/json'
            }
        })

        if (!res.ok) {
            console.error('[saveShopifyLocations] Shopify API error:', await res.text())
            return { success: true, message: 'Locations saved. Stock aggregation skipped due to API error.' }
        }

        const levelsData = await res.json()
        const levels = levelsData.inventory_levels || []

        // 5. Build per-item location map AND aggregate stock
        const stockMap: Record<string, number> = {}
        const locationMapByItem: Record<string, { location_id: string, available: number, updated_at: string }[]> = {}
        
        levels.forEach((level: any) => {
            const itemId = level.inventory_item_id.toString()
            const available = level.available || 0
            stockMap[itemId] = (stockMap[itemId] || 0) + available
            
            if (!locationMapByItem[itemId]) locationMapByItem[itemId] = []
            locationMapByItem[itemId].push({
                location_id: level.location_id.toString(),
                available: available,
                updated_at: new Date().toISOString()
            })
        })

        // 6. Update staging_shopify_products with aggregated stock and location map
        const aggregatedItems = Object.keys(stockMap)
        const chunkSize = 50

        for (let i = 0; i < aggregatedItems.length; i += chunkSize) {
            const chunk = aggregatedItems.slice(i, i + chunkSize)
            await Promise.all(chunk.map(async (itemId: string) => {
                const totalStock = stockMap[itemId]
                const locMap = locationMapByItem[itemId] || []
                await adminSupabase
                    .from('staging_shopify_products')
                    .update({
                        stock_quantity: totalStock,
                        location_inventory_map: locMap,
                        selected_location_ids: locationIds,
                        updated_at: new Date().toISOString()
                    })
                    .eq('shopify_inventory_item_id', itemId)
            }))
        }

        // 7. Update inventory_items with location_inventory_map + shopify_stock_snapshot
        for (let i = 0; i < aggregatedItems.length; i += chunkSize) {
            const chunk = aggregatedItems.slice(i, i + chunkSize)
            await Promise.all(chunk.map(async (itemId: string) => {
                const locMap = locationMapByItem[itemId] || []
                // Calculate stock from selected locations only
                let shopifyTotal = 0
                for (const loc of locMap) {
                    if (locationIds.includes(loc.location_id)) {
                        shopifyTotal += loc.available
                    }
                }
                
                await adminSupabase
                    .from('inventory_items')
                    .update({
                        location_inventory_map: locMap,
                        shopify_stock_snapshot: shopifyTotal,
                        shopify_updated_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('shop_id', shop.id)
                    .eq('shopify_inventory_item_id', itemId)
            }))
        }

        return {
            success: true,
            message: `Updated ${aggregatedItems.length} items across ${locationIds.length} locations.`
        }
    } catch (e: any) {
        console.error('[saveShopifyLocations] Error:', e)
        return { success: false, message: e.message }
    }
}

/**
 * Server Action: Get saved location configuration from the shops table.
 * Returns both mainLocationId and selectedLocationIds.
 * Used by the Settings Locations tab to correctly restore the user's saved state.
 */
export async function getShopLocationConfig(): Promise<{
    mainLocationId: string | null;
    selectedLocationIds: string[];
}> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { mainLocationId: null, selectedLocationIds: [] }

    const { data: shop } = await supabase
        .from('shops')
        .select('main_location_id, selected_location_ids, plan_type')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { mainLocationId: null, selectedLocationIds: [] }

    let mainLocationId = shop.main_location_id?.toString() || null

    // selected_location_ids may be in shops table or we can fall back to inventory_items
    let selectedIds: string[] = []
    if (shop.selected_location_ids && Array.isArray(shop.selected_location_ids) && shop.selected_location_ids.length > 0) {
        selectedIds = shop.selected_location_ids.map((id: any) => id.toString())
    } else {
        // Fallback: read from first inventory_item that has selected_location_ids
        const { data: item } = await supabase
            .from('inventory_items')
            .select('selected_location_ids')
            .eq('shop_id', (await supabase.from('shops').select('id').eq('owner_id', ownerId).maybeSingle()).data?.id || '')
            .not('selected_location_ids', 'is', null)
            .limit(1)
            .maybeSingle()

        if (item?.selected_location_ids && Array.isArray(item.selected_location_ids)) {
            selectedIds = item.selected_location_ids.map((id: any) => id.toString())
        }
    }

    const plan = getPlanConfig(shop.plan_type) || PLAN_CONFIG.starter
    const maxTrackedLocations = plan.limits.maxTrackedLocations
    let normalizedSelectedIds = selectedIds.slice(0, maxTrackedLocations)

    if (normalizedSelectedIds.length === 0 && mainLocationId) {
        normalizedSelectedIds = [mainLocationId]
    }

    if (mainLocationId && !normalizedSelectedIds.includes(mainLocationId)) {
        mainLocationId = normalizedSelectedIds[0] || mainLocationId
    }

    const persistedSelectionChanged =
        normalizedSelectedIds.length !== selectedIds.length ||
        normalizedSelectedIds.some((id, index) => id !== selectedIds[index]) ||
        (mainLocationId || null) !== (shop.main_location_id?.toString() || null)

    if (persistedSelectionChanged) {
        const { data: shopRow } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', ownerId)
            .maybeSingle()

        if (shopRow?.id) {
            await supabase
                .from('shops')
                .update({
                    main_location_id: mainLocationId,
                    selected_location_ids: normalizedSelectedIds
                })
                .eq('id', shopRow.id)

            await createAdminClient()
                .from('inventory_items')
                .update({
                    selected_location_ids: normalizedSelectedIds,
                    updated_at: new Date().toISOString()
                })
                .eq('shop_id', shopRow.id)
        }
    }

    return { mainLocationId, selectedLocationIds: normalizedSelectedIds }
}
