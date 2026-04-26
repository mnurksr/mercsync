const APP_HANDLE = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'mercsync-1';
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://mercsync.com';

export function buildEmbeddedAppUrl(shopDomain: string, path = '/dashboard') {
    const storeHandle = shopDomain.replace('.myshopify.com', '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `https://admin.shopify.com/store/${storeHandle}/apps/${APP_HANDLE}${normalizedPath}?shop=${encodeURIComponent(shopDomain)}`;
}

export function buildAppOriginUrl(path: string) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${APP_ORIGIN}${normalizedPath}`;
}
