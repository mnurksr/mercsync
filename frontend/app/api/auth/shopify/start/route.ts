/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { encodeState } from '../utils';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let shop = searchParams.get('shop');
        const userId = searchParams.get('user_id');
        const returnUrl = searchParams.get('return_url') || undefined;

        if (!shop) {
            return NextResponse.json({ error: 'Shop parameter is required' }, { status: 400 });
        }

        // Clean shop domain
        shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
        if (!shop.includes('.')) {
            shop += '.myshopify.com';
        }

        const clientId = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
        if (!clientId) {
            return NextResponse.json({ error: 'Shopify API Key not configured' }, { status: 500 });
        }

        // 1. Generate Nonce
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // 2. Encode State (n8n structure: only userId and nonce)
        const state = encodeState(userId || '', nonce, returnUrl);

        // 3. Scopes (Match n8n working structure: comma-separated)
        const scopes = 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_locations';

        // 4. Callback URL (Hardcoded to production to match your working n8n structure and dashboard whitelist)
        const redirectUri = `https://mercsync.com/api/auth/shopify/callback/`;

        console.log(`[Shopify Auth] Generated Redirect URI: ${redirectUri}`);
        console.log(`[Shopify Auth] Whitelisted Domain in Env: ${process.env.NEXT_PUBLIC_APP_URL}`);


        // 5. Build Authorization URL
        const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('scope', scopes);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('state', state);

        console.log(`[Shopify Auth] Initiating flow for shop ${shop}, redirecting to: ${authUrl.toString()}`);

        return NextResponse.redirect(authUrl.toString(), { status: 302 });

    } catch (err: any) {
        console.error('[Shopify Auth Start] Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
