/**
 * Shopify shop domain utility.
 *
 * Inside the Shopify admin iframe, the ?shop= parameter is only present
 * on the initial app load. Internal navigation (router.push) loses it.
 * This utility persists the shop domain in sessionStorage so it survives
 * page transitions within the app.
 */

const STORAGE_KEY = 'mercsync_shop_domain';

/**
 * Get the shop domain. Checks (in order):
 * 1. URL searchParams (?shop=xxx.myshopify.com)
 * 2. sessionStorage (previously persisted)
 *
 * If found in URL params, also persists to sessionStorage for future use.
 */
export function getShopDomain(searchParams?: { get: (key: string) => string | null }): string | undefined {
    // 1. Check URL param
    const fromUrl = searchParams?.get('shop') || undefined;
    if (fromUrl) {
        try { sessionStorage.setItem(STORAGE_KEY, fromUrl); } catch { }
        return fromUrl;
    }

    // 2. Check sessionStorage
    try {
        return sessionStorage.getItem(STORAGE_KEY) || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Persist shop domain (call this early, e.g. in layout or setup page)
 */
export function setShopDomain(domain: string) {
    try { sessionStorage.setItem(STORAGE_KEY, domain); } catch { }
}
