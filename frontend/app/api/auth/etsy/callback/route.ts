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

        // 2. Exchange Token
        const redirectUri = `${new URL(req.url).origin}/api/auth/etsy/callback`;
        const authData = await etsyApi.exchangeToken(code, verifier, redirectUri);

        const { access_token, refresh_token, expires_in } = authData;
        const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

        // 3. Fetch Shop Details
        const meRes = await etsyApi.getMe(access_token);
        if (!meRes.results || meRes.results.length === 0) {
            throw new Error('No Etsy shop found for this account');
        }
        const shopData = meRes.results[0];

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

        // 6. Redirect back to App / Return URL
        // If return_url is relative, make it absolute or use it directly if it's external
        let finalRedirect = return_url || '/dashboard/settings';
        if (finalRedirect.startsWith('/')) {
            finalRedirect = `${new URL(req.url).origin}${finalRedirect}`;
        }

        console.log(`[Etsy Callback] Success for user ${owner_id}, shop ${shopData.shop_name}. Redirecting to ${finalRedirect}`);

        return NextResponse.redirect(finalRedirect);

    } catch (err: any) {
        console.error('[Etsy Callback] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
