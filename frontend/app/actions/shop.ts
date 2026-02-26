'use server'

import { createClient } from '@/utils/supabase/server'

export type ShopConnection = {
    connected: boolean
    shop_domain: string | null
    last_sync: string | null
    platform: 'shopify' | 'etsy'
    owner_id?: string | null
    debugMessage?: string
}

import { createAdminClient } from '@/utils/supabase/admin'

export async function getConnectedShop(platform: string = 'shopify', testShopDomain?: string): Promise<ShopConnection> {
    const supabase = testShopDomain ? createAdminClient() : await createClient()

    let user = null;
    let shopQuery = supabase.from('shops').select('shop_domain, is_active, created_at, owner_id, shopify_connected, etsy_connected, access_token, etsy_access_token');

    if (testShopDomain) {
        // Test mode: bypass auth using admin client, query by shop domain
        shopQuery = shopQuery.eq('shop_domain', testShopDomain)
    } else {
        // Normal mode: check auth
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData.user) {
            console.log('getConnectedShop: No user found', authError)
            return {
                connected: false,
                shop_domain: null,
                last_sync: null,
                platform: platform as 'shopify' | 'etsy',
                debugMessage: `Auth failed or no user. Error: ${authError?.message}`
            }
        }
        user = authData.user;
        shopQuery = shopQuery.eq('owner_id', user.id)
    }

    // Log intent
    if (testShopDomain) {
        console.log(`getConnectedShop: TEST MODE with ADMIN CLIENT looking for domain: ${testShopDomain} for platform ${platform}`)
    } else {
        console.log(`getConnectedShop: Checking for user ${user?.id} platform ${platform}`)
    }

    try {
        if (platform === 'shopify') {
            const { data, error } = await shopQuery
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            console.log('getConnectedShop: Query result', { data, error })

            if (error) {
                console.error('getConnectedShop: Database error', error)
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'shopify',
                    debugMessage: `DB Error: ${error.message} (Hint: Check RLS)`
                }
            }

            if (!data) {
                console.log('getConnectedShop: No shop found')
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'shopify',
                    debugMessage: `No shop record found.`
                }
            }

            // Connection logic with backwards compatibility:
            // 1. If shopify_connected is explicitly true -> connected
            // 2. Fallback: if is_active=true AND access_token exists -> connected (old n8n behavior)
            const isConnected =
                data.shopify_connected === true ||
                (data.is_active === true && data.access_token && data.shop_domain);

            return {
                connected: isConnected,
                shop_domain: data.shop_domain,
                last_sync: data.created_at ? new Date(data.created_at).toLocaleString() : 'Just now',
                platform: 'shopify',
                owner_id: data.owner_id,
                debugMessage: isConnected
                    ? `Connected (shopify_connected=${data.shopify_connected}, is_active=${data.is_active})`
                    : `Not connected. shopify_connected=${data.shopify_connected}, is_active=${data.is_active}, has_token=${!!data.access_token}`
            }
        }

        // Etsy connection logic
        if (platform === 'etsy') {
            const { data, error } = await shopQuery
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            console.log('getConnectedShop (etsy): Query result', { data, error })

            if (error) {
                console.error('getConnectedShop (etsy): Database error', error)
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'etsy',
                    debugMessage: `DB Error: ${error.message} (Hint: Check RLS)`
                }
            }

            if (!data) {
                console.log('getConnectedShop (etsy): No shop found')
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'etsy',
                    debugMessage: `No shop record found`
                }
            }

            // Connection logic:
            // 1. If etsy_connected is explicitly true -> connected
            // 2. Fallback: if etsy_access_token exists -> connected (old behavior)
            const isConnected =
                data.etsy_connected === true ||
                (data.etsy_access_token && data.etsy_access_token.length > 0);

            return {
                connected: isConnected,
                shop_domain: data.shop_domain,
                last_sync: data.created_at ? new Date(data.created_at).toLocaleString() : 'Just now',
                platform: 'etsy',
                owner_id: data.owner_id,
                debugMessage: isConnected
                    ? `Connected (etsy_connected=${data.etsy_connected}, has_token=${!!data.etsy_access_token})`
                    : `Not connected. etsy_connected=${data.etsy_connected}, has_token=${!!data.etsy_access_token}`
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

export async function disconnectShop(platform: string = 'shopify'): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return { success: false, message: 'Authentication failed' }
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
                .eq('owner_id', user.id)

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
                .eq('owner_id', user.id)

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
export async function getShopifyLocations(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.log('getShopifyLocations: No user found');
        return { success: false, message: 'User not authenticated' };
    }

    const { data: userShop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
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
