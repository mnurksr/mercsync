'use client';

import { useState } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell, ChevronRight,
    ShoppingBag, Store, Check, X, RefreshCw, AlertTriangle,
    ArrowUpRight, Clock, Package, TrendingUp, Shield, Box, History
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock data - in production this would come from Supabase
const mockSyncEvents = [
    { id: 1, product: 'Vintage Leather Bag', action: 'synced', platform: 'shopify', time: '2 min ago', status: 'success' },
    { id: 2, product: 'Handmade Ceramic Mug', action: 'updated', platform: 'etsy', time: '5 min ago', status: 'success' },
    { id: 3, product: 'Wooden Desk Organizer', action: 'low stock alert', platform: 'both', time: '12 min ago', status: 'warning' },
    { id: 4, product: 'Custom Phone Case', action: 'synced', platform: 'shopify', time: '18 min ago', status: 'success' },
    { id: 5, product: 'Knitted Winter Scarf', action: 'synced', platform: 'etsy', time: '25 min ago', status: 'success' },
];

export default function Dashboard() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Mock connection states - in production from database
    const [stores] = useState({
        shopify: { connected: false, name: null, lastSync: null },
        etsy: { connected: false, name: null, lastSync: null }
    });

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1500);
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
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium">
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
                    <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
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
                        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
                        <p className="text-xs text-gray-500">Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}!</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleRefresh}
                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                        </button>
                        <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">

                    {/* Store Connection Cards */}
                    <section>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Connected Stores</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Shopify Card */}
                            <motion.div
                                whileHover={{ y: -2 }}
                                className={`bg-white rounded-2xl border-2 p-6 transition-all ${stores.shopify.connected
                                    ? 'border-green-200 shadow-sm'
                                    : 'border-dashed border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-[#95BF47] rounded-xl flex items-center justify-center">
                                            <ShoppingBag className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">Shopify</h3>
                                            {stores.shopify.connected ? (
                                                <p className="text-sm text-gray-500">{stores.shopify.name}</p>
                                            ) : (
                                                <p className="text-sm text-gray-400">Not connected</p>
                                            )}
                                        </div>
                                    </div>
                                    {stores.shopify.connected ? (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                                            <Check className="w-3.5 h-3.5" /> Connected
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                                            <X className="w-3.5 h-3.5" /> Offline
                                        </span>
                                    )}
                                </div>

                                {stores.shopify.connected ? (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400">Last sync: {stores.shopify.lastSync}</span>
                                        <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                            Manage <ChevronRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                ) : (
                                    <Link
                                        href="/settings"
                                        className="w-full mt-2 py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        Connect Shopify <ArrowUpRight className="w-4 h-4" />
                                    </Link>
                                )}
                            </motion.div>

                            {/* Etsy Card */}
                            <motion.div
                                whileHover={{ y: -2 }}
                                className={`bg-white rounded-2xl border-2 p-6 transition-all ${stores.etsy.connected
                                    ? 'border-green-200 shadow-sm'
                                    : 'border-dashed border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-[#F56400] rounded-xl flex items-center justify-center">
                                            <Store className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">Etsy</h3>
                                            {stores.etsy.connected ? (
                                                <p className="text-sm text-gray-500">{stores.etsy.name}</p>
                                            ) : (
                                                <p className="text-sm text-gray-400">Not connected</p>
                                            )}
                                        </div>
                                    </div>
                                    {stores.etsy.connected ? (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                                            <Check className="w-3.5 h-3.5" /> Connected
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                                            <X className="w-3.5 h-3.5" /> Offline
                                        </span>
                                    )}
                                </div>

                                {stores.etsy.connected ? (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400">Last sync: {stores.etsy.lastSync}</span>
                                        <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                            Manage <ChevronRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                ) : (
                                    <Link
                                        href="/settings"
                                        className="w-full mt-2 py-3 bg-[#F56400] hover:bg-[#d95700] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        Connect Etsy <ArrowUpRight className="w-4 h-4" />
                                    </Link>
                                )}
                            </motion.div>
                        </div>
                    </section>

                    {/* Sync Health Metrics */}
                    <section>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Sync Health</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                        <Package className="w-5 h-5 text-blue-600" />
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-gray-900">--</div>
                                <div className="text-xs text-gray-500 mt-1">Products Synced</div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                                        <TrendingUp className="w-5 h-5 text-green-600" />
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-green-600">--%</div>
                                <div className="text-xs text-gray-500 mt-1">Sync Success Rate</div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-orange-600">--</div>
                                <div className="text-xs text-gray-500 mt-1">At-Risk Products</div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-purple-600" />
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-gray-900">--</div>
                                <div className="text-xs text-gray-500 mt-1">Last Sync</div>
                            </div>
                        </div>
                    </section>

                    {/* Quick Actions */}
                    <section>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Link href="/dashboard/products" className="group">
                                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white hover:shadow-xl hover:shadow-blue-200 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Box className="w-5 h-5" />
                                                <span className="font-bold text-lg">View Products</span>
                                            </div>
                                            <p className="text-blue-100 text-sm">See all your synced products and stock levels</p>
                                        </div>
                                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </Link>

                            <Link href="/dashboard/settings" className="group">
                                <div className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-gray-300 hover:shadow-md transition-all">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Shield className="w-5 h-5 text-gray-700" />
                                                <span className="font-bold text-lg text-gray-900">Manage Connections</span>
                                            </div>
                                            <p className="text-gray-500 text-sm">Connect or manage your Shopify & Etsy stores</p>
                                        </div>
                                        <ChevronRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </section>

                    {/* Activity Feed */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</h2>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-xs font-medium text-green-700">Live</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            {(!stores.shopify.connected && !stores.etsy.connected) ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <RefreshCw className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="font-semibold text-gray-900 mb-2">No activity yet</h3>
                                    <p className="text-gray-500 text-sm mb-6">Connect your stores to start seeing sync activity here</p>
                                    <Link
                                        href="/settings"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                                    >
                                        Connect Your First Store <ArrowUpRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {mockSyncEvents.map((event) => (
                                        <div key={event.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2 h-2 rounded-full ${event.status === 'success' ? 'bg-green-500' :
                                                    event.status === 'warning' ? 'bg-orange-500' : 'bg-red-500'
                                                    }`}></div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{event.product}</p>
                                                    <p className="text-sm text-gray-500">{event.action}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-medium text-gray-400">{event.time}</p>
                                                <p className="text-xs text-gray-300 capitalize">{event.platform}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Help Tip */}
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 flex items-start gap-3">
                        <div className="mt-0.5">💡</div>
                        <div>
                            <strong>Getting Started:</strong> Connect your Shopify and Etsy stores above, then use the Inventory Mapper to analyze your products and set up automatic synchronization.
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
