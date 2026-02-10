'use client';

import { useState, useEffect } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell, ChevronRight,
    ShoppingBag, Store, Check, X, ExternalLink,
    ArrowUpRight, Box, History, Link2, Unlink
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop, disconnectShop } from '../../actions/shop';

// ====== FRESH LOAD LOADER ======
// Caching removed as per user request to ensure skeleton states are visible

export default function SettingsPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();

    // ====== FRESH LOAD STATE ======
    // User requested NO caching to ensure skeleton loading is always visible on navigation
    const [isLoading, setIsLoading] = useState(true);

    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null, domain: null as string | null },
        etsy: { connected: false, name: null as string | null, shopId: null as string | null }
    });

    // Modal states
    const [showShopifyModal, setShowShopifyModal] = useState(false);
    const [showEtsyModal, setShowEtsyModal] = useState(false);
    const [shopName, setShopName] = useState('');

    // Debug state
    const [debugInfo, setDebugInfo] = useState<any>(null);

    useEffect(() => {
        if (user) {
            checkConnections();
        }
    }, [user]);

    const checkConnections = async () => {
        // Background refresh - cache already loaded in initial state
        try {
            const shopify = await getConnectedShop('shopify');
            const etsy = await getConnectedShop('etsy');

            const newStores = {
                shopify: {
                    connected: shopify.connected,
                    name: shopify.shop_domain,
                    domain: shopify.shop_domain
                },
                etsy: {
                    connected: etsy.connected,
                    name: etsy.shop_domain,
                    shopId: null
                }
            };

            setDebugInfo({
                userId: user?.id,
                shopifyResult: shopify,
                timestamp: new Date().toISOString()
            });

            setStores(newStores);

        } catch (error) {
            console.error('Failed to check connections:', error);
            setDebugInfo({ error: 'Failed to check connections', details: error });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleConnectShopify = () => {
        if (!shopName.trim()) {
            alert('Lütfen mağaza adını girin');
            return;
        }

        if (!user?.id) {
            alert('Kullanıcı oturumu bulunamadı. Lütfen sayfayı yenileyin veya tekrar giriş yapın.');
            return;
        }

        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/shopify/callback`);
        const userId = user.id;

        // Ensure shop name has .myshopify.com if not present
        let cleanShopName = shopName.trim();
        if (!cleanShopName.includes('.')) {
            cleanShopName += '.myshopify.com';
        }
        const shop = encodeURIComponent(cleanShopName);

        window.location.href = `https://api.mercsync.com/webhook/auth/shopify/start?user_id=${userId}&shop=${shop}&return_url=${returnUrl}`;
    };

    const handleConnectEtsy = () => {
        if (!shopName.trim()) {
            alert('Lütfen mağaza adını girin');
            return;
        }
        // Build OAuth URL with user_id and shop name
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/etsy/callback`);
        const userId = user?.id || '';
        const shop = encodeURIComponent(shopName.trim());
        window.location.href = `https://api.mercsync.com/webhook/auth/etsy/start?user_id=${userId}&shop=${shop}&return_url=${returnUrl}`;
    };

    const handleDisconnect = async (platform: 'shopify' | 'etsy') => {
        if (confirm('Are you sure you want to disconnect?')) {
            try {
                const result = await disconnectShop(platform);

                if (result.success) {
                    setStores((prev: typeof stores) => ({
                        ...prev,
                        [platform]: { connected: false, name: null, domain: null, shopId: null }
                    }));

                    // Force refresh debug info
                    checkConnections();
                } else {
                    alert(`Failed to disconnect: ${result.message}`);
                }
            } catch (err: any) {
                alert(`Error: ${err.message}`);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">

            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col fixed top-0 left-0 h-screen z-20">
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
                        <span className="text-xl font-bold tracking-tight">MercSync</span>
                    </Link>
                </div>

                <nav className="p-4 space-y-1 flex-1">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
                        <LayoutDashboard className="w-5 h-5" />
                        Overview
                    </Link>
                    <Link href="/dashboard/products" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
                        <Box className="w-5 h-5" />
                        Products
                    </Link>
                    <Link href="/dashboard/history" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
                        <History className="w-5 h-5" />
                        Sync History
                    </Link>
                    <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium">
                        <Settings className="w-5 h-5" />
                        Integrations
                    </Link>
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 md:ml-64">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-8">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Integrations</h1>
                        <p className="text-xs text-gray-500">Connect your e-commerce stores</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative">
                            <Bell className="w-5 h-5" />
                        </button>
                        <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-8">

                    {/* Info Banner */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                                <Link2 className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-blue-900 mb-1">Connect Your Stores</h3>
                                <p className="text-blue-700 text-sm">
                                    Link your Shopify and Etsy stores to enable automatic inventory synchronization.
                                    Your credentials are securely stored and encrypted.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Store Connections */}
                    <section className="space-y-6">
                        <h2 className="text-lg font-bold text-gray-900">Connected Stores</h2>

                        {/* Shopify */}
                        {isLoading ? (
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
                                    <div className="space-y-2">
                                        <div className="h-5 w-32 bg-gray-200 rounded"></div>
                                        <div className="h-4 w-24 bg-gray-200 rounded"></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <motion.div
                                whileHover={{ y: -2 }}
                                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all"
                            >

                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-[#95BF47] rounded-2xl flex items-center justify-center">
                                            <ShoppingBag className="w-7 h-7 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Shopify</h3>
                                            {stores.shopify.connected ? (
                                                <>
                                                    <p className="text-sm text-gray-500">{stores.shopify.domain}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                        <span className="text-xs text-green-600 font-medium">Connected</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-sm text-gray-400">Not connected</p>
                                            )}
                                        </div>
                                    </div>

                                    {stores.shopify.connected ? (
                                        <div className="flex items-center gap-3">
                                            <a
                                                href={`https://${stores.shopify.domain}/admin`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                            </a>
                                            <button
                                                onClick={() => handleDisconnect('shopify')}
                                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                                            >
                                                <Unlink className="w-4 h-4" />
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setShopName(''); setShowShopifyModal(true); }}
                                            className="px-6 py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-semibold rounded-xl flex items-center gap-2 transition-colors"
                                        >
                                            Connect <ArrowUpRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {!stores.shopify.connected && (
                                    <div className="mt-6 pt-6 border-t border-gray-100">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3">What you'll get:</h4>
                                        <ul className="space-y-2">
                                            {['Real-time inventory sync', 'Order notifications', 'Automatic stock updates'].map((feature, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Etsy */}
                        {isLoading ? (
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
                                    <div className="space-y-2">
                                        <div className="h-5 w-32 bg-gray-200 rounded"></div>
                                        <div className="h-4 w-24 bg-gray-200 rounded"></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <motion.div
                                whileHover={{ y: -2 }}
                                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-[#F56400] rounded-2xl flex items-center justify-center">
                                            <Store className="w-7 h-7 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Etsy</h3>
                                            {stores.etsy.connected ? (
                                                <>
                                                    <p className="text-sm text-gray-500">{stores.etsy.name}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                        <span className="text-xs text-green-600 font-medium">Connected</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-sm text-gray-400">Not connected</p>
                                            )}
                                        </div>
                                    </div>

                                    {stores.etsy.connected ? (
                                        <div className="flex items-center gap-3">
                                            <a
                                                href="https://www.etsy.com/your/shops/me"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                            </a>
                                            <button
                                                onClick={() => handleDisconnect('etsy')}
                                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                                            >
                                                <Unlink className="w-4 h-4" />
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setShopName(''); setShowEtsyModal(true); }}
                                            className="px-6 py-3 bg-[#F56400] hover:bg-[#d95700] text-white font-semibold rounded-xl flex items-center gap-2 transition-colors"
                                        >
                                            Connect <ArrowUpRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {!stores.etsy.connected && (
                                    <div className="mt-6 pt-6 border-t border-gray-100">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3">What you'll get:</h4>
                                        <ul className="space-y-2">
                                            {['Real-time inventory sync', 'Order notifications', 'Automatic stock updates'].map((feature, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </section>

                    {/* Account Info */}
                    <section className="space-y-4">
                        <h2 className="text-lg font-bold text-gray-900">Account</h2>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold text-white">
                                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{user?.email || 'User'}</h3>
                                        <p className="text-sm text-gray-500">Free Plan</p>
                                    </div>
                                </div>
                                <Link
                                    href="/pricing"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors"
                                >
                                    Upgrade
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* DEBUG INFO */}
                    <section className="bg-gray-900 rounded-2xl p-6 text-gray-300 font-mono text-xs overflow-x-auto">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-white font-bold uppercase">Debug Info</h3>
                            <button onClick={checkConnections} className="text-blue-400 hover:text-blue-300">Refresh Debug</button>
                        </div>
                        <pre>
                            {JSON.stringify({
                                userId: debugInfo?.userId || 'Not Logged In',
                                shopify: {
                                    status: stores.shopify.connected ? 'Connected' : 'Disconnected',
                                    domain: stores.shopify.domain,
                                    debugMessage: debugInfo?.shopifyResult?.debugMessage
                                },
                                lastCheck: debugInfo?.timestamp
                            }, null, 2)}
                        </pre>
                        <p className="mt-2 text-gray-500">
                            If "Shopify" is Disconnected, check "debugMessage".
                            <br />
                            Common causes:
                            <br />
                            1. <code>owner_id</code> mismatch (RLS problem or n8n inserted wrong ID).
                            <br />
                            2. <code>is_active</code> is false.
                        </p>
                    </section>
                </div>
            </main>

            {/* Shopify Connect Modal */}
            <AnimatePresence>
                {showShopifyModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setShowShopifyModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 bg-[#95BF47] rounded-xl flex items-center justify-center">
                                    <ShoppingBag className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Connect Shopify</h3>
                                    <p className="text-sm text-gray-500">Enter your store name to continue</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Store Name
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={shopName}
                                            onChange={(e) => setShopName(e.target.value)}
                                            placeholder="my-store"
                                            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#95BF47] focus:border-transparent"
                                        />
                                        <span className="text-gray-400 text-sm">.myshopify.com</span>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setShowShopifyModal(false)}
                                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConnectShopify}
                                        className="flex-1 py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                    >
                                        Connect <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Etsy Connect Modal */}
            <AnimatePresence>
                {showEtsyModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setShowEtsyModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 bg-[#F56400] rounded-xl flex items-center justify-center">
                                    <Store className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Connect Etsy</h3>
                                    <p className="text-sm text-gray-500">Enter your shop name to continue</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Shop Name
                                    </label>
                                    <input
                                        type="text"
                                        value={shopName}
                                        onChange={(e) => setShopName(e.target.value)}
                                        placeholder="YourEtsyShopName"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F56400] focus:border-transparent"
                                    />
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setShowEtsyModal(false)}
                                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConnectEtsy}
                                        className="flex-1 py-3 bg-[#F56400] hover:bg-[#d95700] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                    >
                                        Connect <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
