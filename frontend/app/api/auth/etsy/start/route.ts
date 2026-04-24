import { NextRequest, NextResponse } from 'next/server';
import { generatePKCE, encodeState } from '../utils';
import { createAdminClient } from '@/utils/supabase/admin';

function topLevelRedirectHtml(url: string) {
    const safeUrl = JSON.stringify(url);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="origin" />
  <script>window.top.location.href = ${safeUrl};</script>
</head>
<body>
  <p>Redirecting to Etsy...</p>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const explicitUserId = searchParams.get('user_id');
        const returnUrl = searchParams.get('return_url') || '';
        let userId = explicitUserId;

        if (!userId) {
            const shopCookie = req.cookies.get('mercsync_shop')?.value;

            if (shopCookie) {
                const supabase = createAdminClient();
                const { data: shop } = await supabase
                    .from('shops')
                    .select('owner_id')
                    .eq('shop_domain', shopCookie)
                    .maybeSingle();

                if (shop?.owner_id) {
                    userId = shop.owner_id;
                }
            }
        }

        if (!userId) {
            return NextResponse.json({ error: 'user_id is required or mercsync_shop cookie must resolve a shop owner' }, { status: 400 });
        }

        const rawId = process.env.ETSY_API_KEY || process.env.ETSY_CLIENT_ID;
        if (!rawId) {
            return NextResponse.json({ error: 'ETSY_API_KEY not configured' }, { status: 500 });
        }
        const clientId = rawId.split(':')[0].trim();

        // 1. Generate PKCE
        const { verifier, challenge } = generatePKCE();

        // 2. Encode State (stores userId and verifier for callback)
        const state = encodeState(userId, verifier, returnUrl);

        // 3. Callback URL (Must exactly match Etsy Dev Portal whitelist)
        // Hardcoding production URL to match working n8n structure and avoid localhost issues in iframes.
        const redirectUri = `https://mercsync.com/api/auth/etsy/callback`;

        // 4. Scopes: request only what the sync workflow actually uses.
        const scopes = 'shops_r shops_w listings_r listings_w listings_d transactions_r profile_r';

        // 5. Build Authorization URL
        const authUrl = new URL('https://www.etsy.com/oauth/connect');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('scope', scopes);
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', challenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        console.log(`[Etsy Auth] Initiating flow for user ${userId}, redirecting to: ${authUrl.toString()}`);

        return new NextResponse(topLevelRedirectHtml(authUrl.toString()), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Etsy Auth Start] Error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
