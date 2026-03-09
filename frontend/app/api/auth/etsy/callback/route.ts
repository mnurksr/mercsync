import { NextRequest, NextResponse } from 'next/server';
import { decodeState } from '../utils';
import * as etsyApi from '@/app/api/sync/lib/etsy';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const { searchParams } = new URL(req.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');

        if (!code || !state) {
            return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
        }

        // 1. Decode State
        const stateData = decodeState(state);
        const { owner_id, verifier, return_url } = stateData;

        if (!owner_id || !verifier) {
            return NextResponse.json({ error: 'Invalid state parameters' }, { status: 400 });
        }

        // 2. Exchange Token (Must exactly match the redirect_uri sent in the start route)
        const redirectUri = `https://mercsync.com/api/auth/etsy/callback`;
        const authData = await etsyApi.exchangeToken(code, verifier, redirectUri);

        const { access_token, refresh_token, expires_in } = authData;
        const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

        // 3. Fetch Shop Details
        // 3. Fetch Shop Details
        const meRes = await etsyApi.getMe(access_token);

        // Handle both collection { results: [] } and direct object responses
        let shopData = null;
        if (meRes.results && Array.isArray(meRes.results) && meRes.results.length > 0) {
            shopData = meRes.results[0];
        } else if (meRes.shop_id) {
            shopData = meRes;
        }

        if (!shopData) {
            console.error('[Etsy Callback] No shop data found in response:', JSON.stringify(meRes));
            return NextResponse.json({
                error: 'No Etsy shop found for this account',
                details: 'The Etsy API response did not contain a valid shop ID.',
                debug: meRes
            }, { status: 404 });
        }

        // 4. Fetch Listing Counts
        const counts = await etsyApi.getListingCounts(shopData.shop_id, access_token);

        // 5. Update Database (public.shops)
        const shopUpdate = {
            owner_id,
            etsy_connected: true,
            etsy_access_token: access_token,
            etsy_refresh_token: refresh_token,
            etsy_shop_id: shopData.shop_id.toString(),
            etsy_token_expires_at: expiresAt,
            is_active: true,
            last_token_refresh_at: new Date().toISOString(),
            shop_name: shopData.shop_name,
            initial_product_counts: { etsy: counts }
        };

        const { error: upsertError } = await supabase
            .from('shops')
            .upsert(shopUpdate, { onConflict: 'owner_id' });

        if (upsertError) {
            console.error('[Etsy Callback] DB Upsert Error:', upsertError);
            throw new Error('Failed to save Etsy credentials to database');
        }

        // 6. Redirect back to Shopify Admin App (Strictly match working n8n structure)
        // We need the shop_domain to build the Shopify Admin URL. 
        // We fetch it from the record we just updated.
        const { data: finalShop } = await supabase
            .from('shops')
            .select('shop_domain')
            .eq('owner_id', owner_id)
            .single();

        const shopDomain = finalShop?.shop_domain;
        const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

        // If we have shopDomain, redirect to Shopify Admin. Otherwise fallback.
        let finalRedirect = return_url;
        if (shopDomain && !finalRedirect) {
            finalRedirect = `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}/apps/${process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'mercsync-1'}`;
        } else if (!finalRedirect) {
            finalRedirect = `${new URL(req.url).origin}/dashboard/settings`;
        }

        console.log(`[Etsy Callback] Success for user ${owner_id}, shop ${shopData.shop_name}. Redirecting to ${finalRedirect}`);

        return NextResponse.redirect(finalRedirect);

    } catch (err: any) {
        console.error('[Etsy Callback] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
