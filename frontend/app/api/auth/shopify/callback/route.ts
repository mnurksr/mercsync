/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { decodeState, validateHMAC } from '../utils';
import * as shopifyApi from '@/app/api/sync/lib/shopify';
import { createAdminClient } from '@/utils/supabase/admin';
import crypto from 'crypto';
import { clearOperationalShopData } from '@/app/api/webhooks/shopify/cleanup';

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

        const { data: existingShop } = await supabase
            .from('shops')
            .select('id, is_active, shopify_connected, access_token')
            .eq('shop_domain', shop)
            .maybeSingle();

        if (existingShop && (!existingShop.is_active || !existingShop.shopify_connected || !existingShop.access_token)) {
            console.log(`[Shopify Callback] Found stale disconnected shop state for ${shop}. Clearing old operational data before reinstall.`);
            const cleanupResult = await clearOperationalShopData(supabase, existingShop.id, '[Shopify Callback]');
            if (!cleanupResult.ok) {
                console.warn(`[Shopify Callback] Failed to fully clear stale shop data for ${shop}:`, cleanupResult.errors);
            }
        }

        // 5. Fetch Initial Counts and Shop Details (Async)
        const [counts, shopDetails] = await Promise.all([
            shopifyApi.getListingCounts(creds),
            shopifyApi.getShopDetails(creds)
        ]);
        const currency = shopDetails.shop?.currency || 'USD';

        // 6. Register Webhooks (Async)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
        await shopifyApi.registerWebhooks(creds, appUrl);

        // 7. Upsert to DB - Safely handle missing currency columns
        const upsertData: any = {
            shop_domain: shop,
            owner_id: owner_id,
            access_token: accessToken,
            is_active: true,
            shopify_connected: true,
            shopify_scope: scopes,
            shopify_currency: currency,
            last_token_refresh_at: new Date().toISOString(),
            initial_product_counts: { shopify: counts },
            plan_type: 'guest',
            etsy_connected: false,
            etsy_access_token: null,
            etsy_refresh_token: null
        };

        const { error: upsertError } = await supabase
            .from('shops')
            .upsert(upsertData, { onConflict: 'shop_domain' });

        if (upsertError) {
            console.warn('[Shopify Callback] Initial upsert failed, retrying without currency column...', upsertError);
            // If the error is about a missing column (likely 422 or 42P01/42703 in Postgres)
            // we remove the currency field and try again.
            const { shopify_currency, ...safeUpsertData } = upsertData;
            const { error: secondUpsertError } = await supabase
                .from('shops')
                .upsert(safeUpsertData, { onConflict: 'shop_domain' });
            
            if (secondUpsertError) {
                console.error('[Shopify Callback] Secondary upsert failed:', secondUpsertError);
                throw new Error('Failed to save Shopify credentials even without currency column');
            }
        }

        // 8. Redirect back to embedded app home using app handle
        const storeHandle = shop.replace('.myshopify.com', '');
        const appHandle = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'mercsync-1';
        const finalRedirect = return_url
            ? return_url
            : `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}`;


        console.log(`[Shopify Callback] Success for shop ${shop}. Redirecting to ${finalRedirect}`);

        const response = NextResponse.redirect(finalRedirect);
        response.cookies.set('mercsync_shop', shop, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            sameSite: 'none',
            secure: true,
            httpOnly: true
        });

        return response;


    } catch (err: any) {
        console.error('[Shopify Callback] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
