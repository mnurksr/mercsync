import { NextRequest, NextResponse } from 'next/server';
import { generatePKCE, encodeState } from '../utils';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('user_id');
        const shop = searchParams.get('shop');
        const returnUrl = searchParams.get('return_url') || '';

        if (!userId) {
            return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
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

        // 4. Scopes (Match n8n working structure exactly)
        const scopes = 'shops_r shops_w listings_r listings_w listings_d transactions_r transactions_w email_r profile_r';

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

        return NextResponse.redirect(authUrl.toString());

    } catch (err: any) {
        console.error('[Etsy Auth Start] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
