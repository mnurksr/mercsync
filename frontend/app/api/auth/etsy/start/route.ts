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

        const clientId = process.env.ETSY_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json({ error: 'ETSY_CLIENT_ID not configured' }, { status: 500 });
        }

        // 1. Generate PKCE
        const { verifier, challenge } = generatePKCE();

        // 2. Encode State (stores userId and verifier for callback)
        const state = encodeState(userId, verifier, returnUrl);

        // 3. Callback URL (Must match Etsy Dev Portal)
        const redirectUri = `${new URL(req.url).origin}/api/auth/etsy/callback`;

        // 4. Scopes
        const scopes = [
            'shops_r',
            'shops_w',
            'listings_r',
            'listings_w',
            'listings_d',
            'transactions_r',
            'transactions_w',
            'email_r',
            'profile_r'
        ].join(' ');

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
