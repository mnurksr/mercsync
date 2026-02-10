'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AuthPage() {
    const [shopName, setShopName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleConnect = (e: React.FormEvent) => {
        e.preventDefault();

        if (!shopName.trim()) {
            alert('Please enter your store name');
            return;
        }

        setIsLoading(true);

        // Normalize shop name
        let cleanShopName = shopName.trim().toLowerCase();
        // Remove protocol if present
        cleanShopName = cleanShopName.replace(/^https?:\/\//, '');
        // Remove suffix if present to ensure clean base name, then re-add properly or just send full domain if API expects it.
        // The API likely expects "storename.myshopify.com" or just "storename".
        // Let's assume standard behavior: if user types "foo", we send "foo.myshopify.com". 
        // If user types "foo.myshopify.com", we send that.

        if (!cleanShopName.includes('.')) {
            cleanShopName += '.myshopify.com';
        } else if (!cleanShopName.endsWith('.myshopify.com')) {
            // Handle custom domains if necessary, but standard app install usually starts with myshopify handle.
            // For now, let's assume valid shopify domain.
        }

        const shop = encodeURIComponent(cleanShopName);
        const returnUrl = encodeURIComponent(`${window.location.origin}/dashboard`); // Or wherever you want them to land after auth

        // Redirect to authentication webhook
        window.location.href = `https://api.mercsync.com/webhook/auth/shopify/start?shop=${shop}&return_url=${returnUrl}`;
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">

            <div className="mb-8 text-center">
                <Link href="/" className="inline-flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-xl">M</div>
                    <span className="text-2xl font-bold text-gray-900 tracking-tight">MercSync</span>
                </Link>
                <h2 className="text-gray-500 font-medium">
                    Log in with your Shopify Store
                </h2>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 ring-1 ring-gray-900/5">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-[#95BF47] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-green-100">
                        <ShoppingBag className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Connect Shopify</h3>
                    <p className="text-sm text-gray-500 text-center mt-2">
                        Enter your store URL to log in or install the app.
                    </p>
                </div>

                <form onSubmit={handleConnect} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Store URL</label>
                        <div className="relative">
                            <input
                                type="text"
                                required
                                className="w-full pl-4 pr-32 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#95BF47]/20 focus:border-[#95BF47] transition-all outline-none text-gray-900 placeholder-gray-400"
                                placeholder="my-store"
                                value={shopName}
                                onChange={(e) => setShopName(e.target.value)}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                                .myshopify.com
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-[#95BF47] hover:bg-[#7ea23d] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-green-100"
                    >
                        {isLoading ? (
                            'Redirecting...'
                        ) : (
                            <>
                                Continue <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>
            </div>

            <p className="mt-8 text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} MercSync. Secure Shopify Authentication.
            </p>
        </div>
    );
}
