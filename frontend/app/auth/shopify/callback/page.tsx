'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle, ShoppingBag, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ShopifyCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [shopName, setShopName] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        // Check URL params for OAuth result
        const success = searchParams.get('success');
        const error = searchParams.get('error');
        const shop = searchParams.get('shop');

        if (error) {
            setStatus('error');
            setErrorMessage(error);
        } else if (success === 'true' || shop) {
            setStatus('success');
            setShopName(shop || 'Your Shopify Store');

            // Store connection status in localStorage
            const connectionData = {
                connected: true,
                shop: shop,
                connectedAt: new Date().toISOString()
            };
            localStorage.setItem('shopify_connection', JSON.stringify(connectionData));

            // Auto-redirect to products after 3 seconds
            setTimeout(() => {
                router.push('/dashboard/products?shopify_connected=true');
            }, 3000);
        } else {
            // Simulate success for testing (remove in production)
            setTimeout(() => {
                setStatus('success');
                setShopName('Demo Store');
                localStorage.setItem('shopify_connection', JSON.stringify({
                    connected: true,
                    shop: 'demo-store.myshopify.com',
                    connectedAt: new Date().toISOString()
                }));
            }, 1500);
        }
    }, [searchParams, router]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center">

                {/* Logo */}
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center gap-2">
                        <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-xl">M</div>
                        <span className="text-2xl font-bold text-gray-900 tracking-tight">MercSync</span>
                    </Link>
                </div>

                {/* Loading State */}
                {status === 'loading' && (
                    <div className="space-y-6">
                        <div className="w-20 h-20 bg-[#95BF47]/10 rounded-full flex items-center justify-center mx-auto">
                            <Loader2 className="w-10 h-10 text-[#95BF47] animate-spin" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-2">Connecting to Shopify...</h2>
                            <p className="text-gray-500">Please wait while we complete the connection.</p>
                        </div>
                    </div>
                )}

                {/* Success State */}
                {status === 'success' && (
                    <div className="space-y-6">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-2">Successfully Connected!</h2>
                            <p className="text-gray-500">
                                {shopName && <span className="font-medium text-gray-700">{shopName}</span>}
                                {' '}is now linked to MercSync.
                            </p>
                        </div>

                        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
                            <div className="flex items-center gap-2 justify-center">
                                <ShoppingBag className="w-4 h-4" />
                                <span>Redirecting to Products page...</span>
                            </div>
                        </div>

                        <Link
                            href="/dashboard/products?shopify_connected=true"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-semibold rounded-xl transition-colors"
                        >
                            Go to Products Now
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                )}

                {/* Error State */}
                {status === 'error' && (
                    <div className="space-y-6">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Failed</h2>
                            <p className="text-gray-500">
                                {errorMessage || 'Something went wrong while connecting to Shopify.'}
                            </p>
                        </div>

                        <div className="flex gap-3 justify-center">
                            <Link
                                href="/dashboard/settings"
                                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                            >
                                Go Back
                            </Link>
                            <button
                                onClick={() => {
                                    const returnUrl = encodeURIComponent(`${window.location.origin}/auth/shopify/callback`);
                                    window.location.href = `https://api.mercsync.com/webhook/auth/shopify/start?return_url=${returnUrl}`;
                                }}
                                className="px-6 py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-semibold rounded-xl transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <p className="mt-8 text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} MercSync. Secure OAuth Connection.
            </p>
        </div>
    );
}
