'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { buildAppOriginUrl, buildEmbeddedAppUrl } from '@/utils/shopifyApp';

export default function ReauthPage() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const shop = searchParams.get('shop');
        const target = searchParams.get('target') || '/dashboard';

        if (!shop) {
            window.location.href = '/login';
            return;
        }

        const returnUrl = encodeURIComponent(buildEmbeddedAppUrl(shop, target));
        const authUrl = `${buildAppOriginUrl('/api/auth/shopify/start')}?shop=${encodeURIComponent(shop)}&return_url=${returnUrl}`;

        try {
            if (window.top && window.top !== window.self) {
                window.top.location.href = authUrl;
                return;
            }
        } catch {}

        window.location.href = authUrl;
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
