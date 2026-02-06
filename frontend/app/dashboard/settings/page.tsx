'use client';

import { useState } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell, ChevronRight,
    ShoppingBag, Store, Check, X, ExternalLink,
    ArrowUpRight, Box, History, Link2, Unlink
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function SettingsPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();

    // Mock connection states
    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null, domain: null as string | null },
        etsy: { connected: false, name: null as string | null, shopId: null as string | null }
    });

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleConnectShopify = () => {
        // Redirect to Shopify OAuth endpoint with return URL
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/shopify/callback`);
        window.location.href = `https://api.mercsync.com/webhook/auth/shopify/start?return_url=${returnUrl}`;
    };

    const handleConnectEtsy = () => {
        // In production, this would initiate OAuth flow
        alert('Etsy OAuth flow would start here. This is a demo.');
    };

    const handleDisconnect = (platform: 'shopify' | 'etsy') => {
        setStores(prev => ({
            ...prev,
            [platform]: { connected: false, name: null, domain: null, shopId: null }
        }));
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">

            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col sticky top-0 h-screen">
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
            <main className="flex-1 min-w-0">
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
                                        onClick={handleConnectShopify}
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

                        {/* Etsy */}
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
                                        onClick={handleConnectEtsy}
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

                </div>
            </main>
        </div>
    );
}
