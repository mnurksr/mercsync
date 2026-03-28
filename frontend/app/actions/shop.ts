'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'
import { getShop } from '@/app/api/sync/lib/etsy'

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
                return {
                    connected: isConnected,
                    shop_domain: coreData.shop_domain,
                    last_sync: coreData.created_at ? new Date(coreData.created_at).toLocaleString() : 'Just now',
                    platform: 'shopify',
                    owner_id: coreData.owner_id,
                    plan_type: coreData.plan_type,
                    shopify_currency: 'USD',
                    etsy_currency: 'USD',
                    debugMessage: `Fallback: ${isConnected}`
                }
            }

            if (!data) {
                return { connected: false, shop_domain: null, last_sync: null, platform: 'shopify', debugMessage: 'No shop record found.' }
            }

            const isConnected = !!data.access_token && !!data.shop_domain;
            return {
                connected: isConnected,
                shop_domain: data.shop_domain,
                last_sync: data.created_at ? new Date(data.created_at).toLocaleString() : 'Just now',
                platform: 'shopify',
                owner_id: data.owner_id,
                plan_type: data.plan_type,
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
            const { error } = await supabase
                .from('shops')
                .update({
                    etsy_connected: false,
                    etsy_access_token: null,
                    etsy_refresh_token: null
                })
                .eq('owner_id', resolvedOwnerId)

            if (error) throw error
            return { success: true, message: 'Etsy disconnected' }
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

