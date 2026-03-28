import { NextRequest, NextResponse } from 'next/server';
import { decodeState, validateHMAC } from '../utils';
import * as shopifyApi from '@/app/api/sync/lib/shopify';
import { createAdminClient } from '@/utils/supabase/admin';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const { searchParams } = new URL(req.url);
        const queryParams: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        const { hmac, shop, code, state } = queryParams;

        if (!hmac || !shop || !code || !state) {
            return NextResponse.json({ error: 'Missing required OAuth parameters' }, { status: 400 });
        }

        // 1. Validate HMAC
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
        if (!clientSecret) {
            throw new Error('SHOPIFY_CLIENT_SECRET not configured');
        }

        const isValid = validateHMAC(queryParams, clientSecret);
        if (!isValid) {
            return NextResponse.json({ error: 'HMAC validation failed' }, { status: 401 });
        }

        // 2. Decode State
        let owner_id: string | null = null;
        let return_url: string | null = null;
        try {
            const stateData = decodeState(state);
            owner_id = stateData.user_id;
            return_url = stateData.return_url;
        } catch (e) {
            console.warn('[Shopify Callback] Could not decode state, proceeding with caution');
        }

        // 3. Exchange Token
        const tokenData = await shopifyApi.exchangeToken(shop, code);
        const accessToken = tokenData.access_token;
        const scopes = tokenData.scope;

        // 4. If no owner_id, generate one (fallback for App Store installs)
        if (!owner_id) {
            owner_id = crypto.randomUUID();
        }

        const creds = { shopDomain: shop, accessToken };

        // 5. Fetch Initial Counts and Shop Details (Async)
        const [counts, shopDetails] = await Promise.all([
            shopifyApi.getListingCounts(creds),
            shopifyApi.getShopDetails(creds)
        ]);
        const currency = shopDetails.shop?.currency || 'USD';

        // 6. Register Webhooks (Async)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
        await shopifyApi.registerWebhooks(creds, appUrl);

        // 7. Upsert to DB
        // initial_product_counts should be a JSON object like { shopify: { active: X, ... } }
        const { error: upsertError } = await supabase
            .from('shops')
            .upsert({
                shop_domain: shop,
                owner_id: owner_id,
                access_token: accessToken,
                is_active: true,
                shopify_connected: true,
                shopify_scope: scopes,
                shopify_currency: currency,
                last_token_refresh_at: new Date().toISOString(),
                initial_product_counts: { shopify: counts },
                // RESET TO FRESH STATE: Match n8n "guest" branding and clear Etsy legacy data
                plan_type: 'guest',
                etsy_connected: false,
                etsy_access_token: null,
                etsy_refresh_token: null
            }, { onConflict: 'shop_domain' });

        if (upsertError) {
            console.error('[Shopify Callback] DB Error:', upsertError);
            throw new Error('Failed to save Shopify credentials');
        }

        // 8. Redirect back to Shopify Admin App (Strictly match working n8n structure)
        const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
        const finalRedirect = `https://${shop}/admin/apps/${clientId}`;


        console.log(`[Shopify Callback] Success for shop ${shop}. Redirecting to ${finalRedirect}`);

        return NextResponse.redirect(finalRedirect);


    } catch (err: any) {
        console.error('[Shopify Callback] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
