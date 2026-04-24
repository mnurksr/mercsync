'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type EmbeddedAdminRedirectProps = {
    shopDomain?: string | null;
};

export default function EmbeddedAdminRedirect({ shopDomain }: EmbeddedAdminRedirectProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!shopDomain) return;

        // Only bounce when the app is opened directly in the browser tab.
        // Inside Shopify embedded mode, the app runs in an iframe.
        if (window.top !== window.self) return;

        const appHandle = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'mercsync-1';
        const storeHandle = shopDomain.replace('.myshopify.com', '');
        const query = searchParams.toString();
        const targetUrl = `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}${pathname}${query ? `?${query}` : ''}`;

        if (window.location.href !== targetUrl) {
            window.location.replace(targetUrl);
        }
    }, [pathname, searchParams, shopDomain]);

    return null;
}
