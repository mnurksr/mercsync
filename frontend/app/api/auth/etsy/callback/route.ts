import { NextRequest, NextResponse } from 'next/server';
import { decodeState } from '../utils';
import * as etsyApi from '@/app/api/sync/lib/etsy';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildEmbeddedAppUrl } from '@/utils/shopifyApp';

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

        // 3.1 Fetch Full Shop Details for Currency
        const fullShopRes = await etsyApi.getShop(shopData.shop_id, access_token);
        const etsyCurrency = (fullShopRes.results && fullShopRes.results.length > 0) 
            ? fullShopRes.results[0].currency_code 
            : (fullShopRes.currency_code || 'USD');

        // 4. Update Database (public.shops) - Manual Check-then-Save (Matches n8n logic and bypasses missing unique constraints)
        const shopUpdate: any = {
            owner_id,
            etsy_connected: true,
            etsy_access_token: access_token,
            etsy_refresh_token: refresh_token,
            etsy_shop_id: shopData.shop_id.toString(),
            etsy_token_expires_at: expiresAt,
            etsy_currency: etsyCurrency,
            is_active: true,
            last_token_refresh_at: new Date().toISOString()
        };

        // Check if a record already exists for this owner
        const { data: existingShop, error: fetchError } = await supabase
            .from('shops')
            .select('id, initial_product_counts')
            .eq('owner_id', owner_id)
            .maybeSingle();

        if (fetchError) {
            console.error('[Etsy Callback] DB Fetch Error:', fetchError);
            return NextResponse.json({
                error: 'Database check failed',
                details: fetchError.message,
                debug: fetchError
            }, { status: 500 });
        }

        let dbOperationError;
        if (existingShop) {
            console.log(`[Etsy Callback] Updating existing shop record ${existingShop.id} for owner ${owner_id}`);
            const { error: updateError } = await supabase
                .from('shops')
                .update(shopUpdate)
                .eq('id', existingShop.id);
            
            if (updateError) {
                console.warn('[Etsy Callback] Update failed, retrying without currency column...', updateError);
                const { etsy_currency, shopify_currency, ...safeUpdate } = shopUpdate;
                const { error: secondUpdateError } = await supabase
                    .from('shops')
                    .update(safeUpdate)
                    .eq('id', existingShop.id);
                dbOperationError = secondUpdateError;
            } else {
                dbOperationError = updateError;
            }
        } else {
            console.log(`[Etsy Callback] Inserting new shop record for owner ${owner_id}`);
            const { error: insertError } = await supabase
                .from('shops')
                .insert(shopUpdate);
            
            if (insertError) {
                console.warn('[Etsy Callback] Insert failed, retrying without currency column...', insertError);
                const { etsy_currency, shopify_currency, ...safeInsert } = shopUpdate;
                const { error: secondInsertError } = await supabase
                    .from('shops')
                    .insert(safeInsert);
                dbOperationError = secondInsertError;
            } else {
                dbOperationError = insertError;
            }
        }

        if (dbOperationError) {
            console.error('[Etsy Callback] DB Save Error:', dbOperationError);
            return NextResponse.json({
                error: 'Failed to save Etsy credentials to database',
                details: dbOperationError.message,
                debug: dbOperationError,
                owner_id: owner_id,
                is_update: !!existingShop
            }, { status: 500 });
        }

        // 5. Fetch Listing Counts separately (Don't break the flow if this fails)
        try {
            console.log('[Etsy Callback] Starting listing counts fetch...');
            const counts = await etsyApi.getListingCounts(shopData.shop_id, access_token);

            // Optimization: Etsy shop detail already has active count, use it as it's more reliable
            if (shopData.listing_active_count !== undefined) {
                console.log(`[Etsy Callback] Using active count from shop details: ${shopData.listing_active_count}`);
                counts.active = shopData.listing_active_count;
            }

            // MERGE with existing counts to avoid overwriting Shopify data
            const existingCounts = existingShop?.initial_product_counts || {};
            const finalCounts = {
                ...existingCounts,
                etsy: counts
            };

            console.log('[Etsy Callback] Merged counts:', JSON.stringify(finalCounts));

            const { error: countUpdateError } = await supabase
                .from('shops')
                .update({
                    initial_product_counts: finalCounts
                })
                .eq('owner_id', owner_id);

            if (countUpdateError) {
                console.error('[Etsy Callback] Error updating listing counts in DB:', countUpdateError);
            } else {
                console.log('[Etsy Callback] Listing counts successfully merged and updated.');
            }
        } catch (countError) {
            console.error('[Etsy Callback] Error during listing counts process:', countError);
            // Non-blocking error
        }

        // 6. Redirect back to Shopify Admin App
        const { data: finalShop } = await supabase
            .from('shops')
            .select('shop_domain')
            .eq('owner_id', owner_id)
            .maybeSingle();

        const shopDomain = finalShop?.shop_domain;
        const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

        // Construct redirection URL
        let finalRedirect = return_url;
        if (shopDomain && !finalRedirect) {
            finalRedirect = buildEmbeddedAppUrl(shopDomain, '/dashboard');
        } else if (shopDomain && finalRedirect && !finalRedirect.startsWith('https://admin.shopify.com/store/')) {
            finalRedirect = buildEmbeddedAppUrl(shopDomain, '/dashboard');
        } else if (!finalRedirect) {
            finalRedirect = `${new URL(req.url).origin}/setup`;
        }

        console.log(`[Etsy Callback] Success for user ${owner_id}. Redirecting to ${finalRedirect}`);
        return NextResponse.redirect(finalRedirect);

    } catch (err: any) {
        console.error('[Etsy Callback] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
