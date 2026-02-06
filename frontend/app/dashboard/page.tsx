'use client';

import RealtimeInventory from '@/components/RealtimeInventory';
import { LayoutDashboard, LogOut, Settings, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
    const { supabase } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">

            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col sticky top-0 h-screen">
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">M</div>
                        <span className="text-xl font-bold tracking-tight">MercSync</span>
                    </div>
                </div>

                <nav className="p-4 space-y-1 flex-1">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium">
                        <LayoutDashboard className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
                        <Settings className="w-5 h-5" />
                        Integrations
                    </Link>
                    <Link href="/dashboard/mapper" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl font-medium transition-colors">
                        <div className="w-5 h-5 flex items-center justify-center">⚡️</div>
                        Inventory Mapper
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
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-8">
                    <h1 className="text-xl font-bold text-gray-800">Overview</h1>
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                        </button>
                        <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-600">
                            AD
                        </div>
                    </div>
                </header>

                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">

                    {/* CTA: Inventory Mapper */}
                    <Link href="/dashboard/mapper" className="block group">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 sm:p-8 shadow-lg shadow-blue-500/20 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:shadow-xl hover:scale-[1.01] transition-all">
                            <div>
                                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                    <span>⚡️</span> Start Stock Mapping
                                </h2>
                                <p className="text-blue-100 max-w-xl text-sm sm:text-base">
                                    Upload your inventory files to detect overselling risks and sync your stores automatically.
                                </p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-3 rounded-xl font-bold flex items-center gap-2 group-hover:bg-white group-hover:text-blue-600 transition-colors shrink-0">
                                Launch Wizard <ChevronDown className="w-5 h-5 -rotate-90" />
                            </div>
                        </div>
                    </Link>

                    {/* Stats Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Order Rate</h3>
                            <div className="mt-2 text-3xl font-bold text-gray-900">-- <span className="text-sm text-gray-400 font-normal">orders/hr</span></div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Sync Latency</h3>
                            <div className="mt-2 text-3xl font-bold text-green-600">~120 <span className="text-sm text-gray-400 font-normal">ms</span></div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">API Usage</h3>
                            <div className="mt-2 flex items-end gap-2">
                                <div className="text-3xl font-bold text-blue-600">14%</div>
                                <div className="mb-1 text-xs text-gray-400">Shopify Global</div>
                            </div>
                        </div>
                    </div>

                    {/* Realtime Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800">Live Inventory Stream</h3>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Live</span>
                            </div>
                        </div>
                        <div className="p-0">
                            <RealtimeInventory />
                        </div>
                    </div>

                    {/* Info Helper */}
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 flex items-start gap-3">
                        <div className="mt-0.5">💡</div>
                        <div>
                            <strong>How it works:</strong> This dashboard uses Supabase Realtime to listen for every database change instantly. When n8n processes a reservation in the background, the table updates automatically without refreshing.
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
