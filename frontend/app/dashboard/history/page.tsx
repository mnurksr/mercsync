'use client';

import { useState } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell,
    ShoppingBag, Store, Check, X, RefreshCw, AlertTriangle,
    ArrowUpRight, Clock, History, Box, Filter, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock sync history data
const mockHistory = [
    { id: 1, action: 'Inventory Synced', product: 'Vintage Leather Bag', from: 'shopify', to: 'etsy', change: '12 → 11', time: '2 min ago', status: 'success' },
    { id: 2, action: 'Inventory Synced', product: 'Handmade Ceramic Mug', from: 'etsy', to: 'shopify', change: '8 → 7', time: '5 min ago', status: 'success' },
    { id: 3, action: 'Low Stock Alert', product: 'Wooden Desk Organizer', from: 'system', to: null, change: 'Stock: 3', time: '12 min ago', status: 'warning' },
    { id: 4, action: 'Inventory Synced', product: 'Custom Phone Case', from: 'shopify', to: 'etsy', change: '25 → 24', time: '18 min ago', status: 'success' },
    { id: 5, action: 'Sync Failed', product: 'Knitted Winter Scarf', from: 'etsy', to: 'shopify', change: 'Connection timeout', time: '25 min ago', status: 'error' },
    { id: 6, action: 'Inventory Synced', product: 'Artisan Candle Set', from: 'shopify', to: 'etsy', change: '15 → 14', time: '30 min ago', status: 'success' },
    { id: 7, action: 'Store Connected', product: null, from: 'shopify', to: null, change: 'my-store.myshopify.com', time: '1 hour ago', status: 'success' },
    { id: 8, action: 'Store Connected', product: null, from: 'etsy', to: null, change: 'MyEtsyShop', time: '1 hour ago', status: 'success' },
    { id: 9, action: 'Inventory Synced', product: 'Leather Wallet', from: 'etsy', to: 'shopify', change: '7 → 6', time: '2 hours ago', status: 'success' },
    { id: 10, action: 'Mismatch Detected', product: 'Personalized Jewelry Box', from: 'system', to: null, change: 'Shopify: 4, Etsy: 6', time: '3 hours ago', status: 'warning' },
];

export default function HistoryPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const [filterStatus, setFilterStatus] = useState('all');

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const filteredHistory = mockHistory.filter(item => {
        return filterStatus === 'all' || item.status === filterStatus;
    });

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>;
            case 'warning':
                return <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-orange-600" /></div>;
            case 'error':
                return <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><X className="w-4 h-4 text-red-600" /></div>;
            default:
                return <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><Clock className="w-4 h-4 text-gray-600" /></div>;
        }
    };

    const getPlatformIcon = (platform: string) => {
        switch (platform) {
            case 'shopify':
                return <ShoppingBag className="w-4 h-4 text-[#95BF47]" />;
            case 'etsy':
                return <Store className="w-4 h-4 text-[#F56400]" />;
            default:
                return <RefreshCw className="w-4 h-4 text-gray-400" />;
        }
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
                    <Link href="/dashboard/history" className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium">
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
                        <h1 className="text-xl font-bold text-gray-800">Sync History</h1>
                        <p className="text-xs text-gray-500">View all synchronization events</p>
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

                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">

                    {/* Filter */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                            {['all', 'success', 'warning', 'error'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === status
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Live updates
                        </div>
                    </div>

                    {/* History Timeline */}
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="divide-y divide-gray-50">
                            {filteredHistory.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                                >
                                    {getStatusIcon(item.status)}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-gray-900">{item.action}</span>
                                            {item.product && (
                                                <span className="text-gray-500">• {item.product}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            {item.from && (
                                                <>
                                                    {getPlatformIcon(item.from)}
                                                    {item.to && (
                                                        <>
                                                            <span>→</span>
                                                            {getPlatformIcon(item.to)}
                                                        </>
                                                    )}
                                                </>
                                            )}
                                            <span className="text-gray-300">|</span>
                                            <span>{item.change}</span>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <span className="text-sm text-gray-400">{item.time}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {filteredHistory.length === 0 && (
                            <div className="p-12 text-center">
                                <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="font-semibold text-gray-900 mb-2">No events found</h3>
                                <p className="text-gray-500 text-sm">Try adjusting your filter</p>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
