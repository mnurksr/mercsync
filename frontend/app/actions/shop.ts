'use server'

import { createClient } from '@/utils/supabase/server'

export type ShopConnection = {
    connected: boolean
    shop_domain: string | null
    last_sync: string | null
    platform: 'shopify' | 'etsy'
    debugMessage?: string
}

export async function getConnectedShop(platform: string = 'shopify'): Promise<ShopConnection> {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        console.log('getConnectedShop: No user found', authError)
        return {
            connected: false,
            shop_domain: null,
            last_sync: null,
            platform: platform as 'shopify' | 'etsy',
            debugMessage: `Auth failed or no user. Error: ${authError?.message}`
        }
    }

    console.log(`getConnectedShop: Checking for user ${user.id} platform ${platform}`)

    try {
        if (platform === 'shopify') {
            // Query includes shopify_connected for new logic, 
            // but also access_token for backwards compatibility with old n8n
            const { data, error } = await supabase
                .from('shops')
                .select('shop_domain, is_active, created_at, owner_id, shopify_connected, etsy_connected, access_token')
                .eq('owner_id', user.id)
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
                console.log('getConnectedShop: No shop found for user')
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'shopify',
                    debugMessage: `No shop record found for owner_id: ${user.id}. (Double check n8n insert)`
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
                debugMessage: isConnected
                    ? `Connected (shopify_connected=${data.shopify_connected}, is_active=${data.is_active})`
                    : `Not connected. shopify_connected=${data.shopify_connected}, is_active=${data.is_active}, has_token=${!!data.access_token}`
            }
        }

        // Etsy connection logic
        if (platform === 'etsy') {
            const { data, error } = await supabase
                .from('shops')
                .select('shop_domain, is_active, created_at, owner_id, etsy_connected, etsy_access_token')
                .eq('owner_id', user.id)
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
                console.log('getConnectedShop (etsy): No shop found for user')
                return {
                    connected: false,
                    shop_domain: null,
                    last_sync: null,
                    platform: 'etsy',
                    debugMessage: `No shop record found for owner_id: ${user.id}`
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
