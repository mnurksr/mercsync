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

    try {
        // Get all active shops with Etsy tokens
        const { data: shops, error: shopsError } = await supabase
            .from('shops')
            .select('id, etsy_access_token, etsy_refresh_token, etsy_token_expires_at, etsy_shop_id')
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

        for (const shop of shops) {
            const expiresAt = shop.etsy_token_expires_at
                ? new Date(shop.etsy_token_expires_at).getTime()
                : 0;

            // Only refresh if token expires within threshold (or is already expired)
            if (expiresAt > now + REFRESH_THRESHOLD_MS) {
                continue; // Token still valid, skip
            }

            await createNotification(
                supabase,
                shop.id,
                'token_expiring',
                'Etsy Connection Refreshing',
                'Your Etsy connection token is expiring soon. MercSync is refreshing it automatically.',
                '/dashboard/settings'
            );

            console.log(`${logPrefix} Refreshing token for shop ${shop.id} (expires: ${shop.etsy_token_expires_at || 'unknown'})`);

            try {
                const tokenData = await etsyApi.refreshToken(shop.etsy_refresh_token);

                const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

                const { error: updateError } = await supabase
                    .from('shops')
                    .update({
                        etsy_access_token: tokenData.access_token,
                        etsy_refresh_token: tokenData.refresh_token,
                        etsy_token_expires_at: newExpiresAt,
                        last_token_refresh_at: new Date().toISOString()
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
                        expires_at: shop.etsy_token_expires_at
                    },
                    created_at: new Date().toISOString()
                });

                await createNotification(
                    supabase,
                    shop.id,
                    'sync_failed',
                    'Etsy Token Refresh Failed',
                    `MercSync could not refresh your Etsy connection. Please reconnect Etsy. Error: ${errorMessage}`,
                    '/dashboard/settings'
                );
            }
        }

        console.log(`${logPrefix} Done. Refreshed: ${refreshed}, Failed: ${failed}`);

        return NextResponse.json({
            status: 'ok',
            total_shops: shops.length,
            refreshed,
            failed
        });

    } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        console.error(`${logPrefix} Fatal error:`, err);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
