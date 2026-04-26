'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { buildEmbeddedAppUrl, buildShopifyAuthorizeUrl } from '@/utils/shopifyApp';
import { getShopDomain } from '@/utils/shopDomain';

export default function ReauthPage() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const target = searchParams.get('target') || '/dashboard';
        const startReauth = async () => {
            let shop = searchParams.get('shop');

            if (!shop) {
                shop = getShopDomain() || null;
            }

            if (!shop) {
                try {
                    const response = await fetch('/api/shop/current', { credentials: 'include' });
                    const data = await response.json();
                    if (data?.shopDomain) {
                        shop = data.shopDomain;
                    }
                } catch (error) {
                    console.error('[Reauth] Failed to resolve current shop:', error);
                }
            }

            if (!shop) {
                window.location.href = '/login';
                return;
            }

            const returnUrl = buildEmbeddedAppUrl(shop, target);
            const authUrl = buildShopifyAuthorizeUrl(shop, returnUrl);
            const form = document.createElement('form');
            form.method = 'GET';
            form.action = authUrl;
            form.target = '_top';
            document.body.appendChild(form);
            form.submit();
        };

        startReauth();
    }, [searchParams]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F6F6F7]">
            <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500" />
                <p className="mt-4 text-sm text-gray-600">Reconnecting your Shopify store...</p>
            </div>
        </div>
    );
}
