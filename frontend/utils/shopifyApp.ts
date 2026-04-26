const APP_HANDLE = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'mercsync-1';
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://mercsync.com';
const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '';

export function buildEmbeddedAppUrl(shopDomain: string, path = '/dashboard') {
    const storeHandle = shopDomain.replace('.myshopify.com', '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `https://admin.shopify.com/store/${storeHandle}/apps/${APP_HANDLE}${normalizedPath}?shop=${encodeURIComponent(shopDomain)}`;
}

export function buildAppOriginUrl(path: string) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${APP_ORIGIN}${normalizedPath}`;
}

function encodeStatePayload(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);

    if (typeof window === 'undefined') {
        return Buffer.from(json).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    return window.btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

export function buildShopifyAuthorizeUrl(shopDomain: string, returnUrl: string, userId = '') {
    const cleanShop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    const normalizedShop = cleanShop.includes('.') ? cleanShop : `${cleanShop}.myshopify.com`;
    const nonce = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const state = encodeStatePayload({
        user_id: userId,
        nonce,
        timestamp: Date.now(),
        return_url: returnUrl,
    });
    const scopes = 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_locations';
    const redirectUri = `${APP_ORIGIN}/api/auth/shopify/callback/`;
    const authUrl = new URL(`https://${normalizedShop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    return authUrl.toString();
}
