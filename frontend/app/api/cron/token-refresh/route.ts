/**
 * Etsy Token Refresh Cron
 * 
 * Checks all shops with Etsy tokens expiring within 30 minutes
 * and automatically refreshes them.
 * 
 * Protected by CRON_SECRET header.
 * Trigger: GET /api/cron/token-refresh?secret=CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import { createNotification } from '../../../actions/notifications';
import { clearEtsyConnectionData } from '@/utils/etsyDisconnect';

const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // Refresh if expires within 30 minutes

function getErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
}

export async function GET(req: NextRequest) {
    const logPrefix = '[Token Refresh]';

    // Auth check
    const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const mode = req.nextUrl.searchParams.get('mode') || 'all';
    const refreshAll = mode !== 'expiring_only';

    try {
        // Get all active shops with Etsy refresh tokens
        const { data: shops, error: shopsError } = await supabase
            .from('shops')
            .select('id, shop_domain, etsy_access_token, etsy_refresh_token, etsy_token_expires_at, etsy_shop_id')
            .eq('is_active', true)
            .eq('etsy_connected', true)
            .not('etsy_refresh_token', 'is', null);

        if (shopsError || !shops || shops.length === 0) {
            console.log(`${logPrefix} No shops with Etsy tokens found.`);
            return NextResponse.json({ status: 'ok', refreshed: 0 });
        }

        const now = Date.now();
        let refreshed = 0;
        let failed = 0;
        let skipped = 0;

        for (const shop of shops) {
            const expiresAt = shop.etsy_token_expires_at
                ? new Date(shop.etsy_token_expires_at).getTime()
                : 0;

            // Mirror the working n8n flow by default: refresh all connected Etsy shops.
            // Optional mode=expiring_only preserves the older threshold-based behavior.
            if (!refreshAll && expiresAt > now + REFRESH_THRESHOLD_MS) {
                skipped++;
                continue;
            }

            console.log(`${logPrefix} Refreshing token for shop ${shop.id} (${shop.shop_domain || 'unknown-shop'}) (expires: ${shop.etsy_token_expires_at || 'unknown'})`);

            try {
                const tokenData = await etsyApi.refreshToken(shop.etsy_refresh_token);
                const nextRefreshToken = tokenData.refresh_token || shop.etsy_refresh_token;

                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

                const { error: updateError } = await supabase
                    .from('shops')
                    .update({
                        etsy_access_token: tokenData.access_token,
                        etsy_refresh_token: nextRefreshToken,
                        etsy_token_expires_at: newExpiresAt,
                        last_token_refresh_at: new Date().toISOString(),
                        token_refresh_failed_at: null,
                        token_refresh_error: null,
                        etsy_connected: true
                    })
                    .eq('id', shop.id);

                if (updateError) {
                    console.error(`${logPrefix} DB update failed for shop ${shop.id}:`, updateError);
                    failed++;
                } else {
                    console.log(`${logPrefix} ✅ Token refreshed for shop ${shop.id}. New expiry: ${newExpiresAt}`);
                    refreshed++;
                }
            } catch (err: unknown) {
                const errorMessage = getErrorMessage(err);
                console.error(`${logPrefix} ❌ Token refresh failed for shop ${shop.id}:`, errorMessage);
                failed++;

                // Log the failure
                await supabase.from('sync_logs').insert({
                    shop_id: shop.id,
                    source: 'system',
                    event_type: 'webhook', // using as "system event"
                    status: 'failed',
                    error_message: `Token refresh failed: ${errorMessage}`,
                    metadata: {
                        type: 'token_refresh',
                        mode,
                        expires_at: shop.etsy_token_expires_at
                    },
                    created_at: new Date().toISOString()
                });

                await supabase
                    .from('shops')
                    .update({
                        token_refresh_failed_at: new Date().toISOString(),
                        token_refresh_error: errorMessage
                    })
                    .eq('id', shop.id);

                await createNotification(
                    supabase,
                    shop.id,
                    'sync_failed',
                    'Etsy Token Refresh Failed',
                    `MercSync could not refresh your Etsy connection. Please reconnect Etsy. Error: ${errorMessage}`,
                    '/dashboard/settings'
                );

                const normalizedMessage = errorMessage.toLowerCase();
                const looksRevoked = normalizedMessage.includes('invalid_grant')
                    || normalizedMessage.includes('invalid token')
                    || normalizedMessage.includes('unauthorized')
                    || normalizedMessage.includes('forbidden')
                    || normalizedMessage.includes('revoked');

                if (looksRevoked) {
                    console.warn(`${logPrefix} Etsy token appears revoked for shop ${shop.id}. Disconnecting Etsy integration.`);
                    const cleanup = await clearEtsyConnectionData(supabase, shop.id);
                    if (!cleanup.ok) {
                        console.error(`${logPrefix} Failed to clean Etsy data after revoke for shop ${shop.id}:`, cleanup.errors);
                    }
                }
            }
        }

        console.log(`${logPrefix} Done. Mode=${mode}. Refreshed: ${refreshed}, Failed: ${failed}, Skipped: ${skipped}`);

        return NextResponse.json({
            status: 'ok',
            mode,
            total_shops: shops.length,
            refreshed,
            failed,
            skipped
        });

    } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        console.error(`${logPrefix} Fatal error:`, err);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
