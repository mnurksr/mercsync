'use client';

import { useState, useEffect } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell,
    ShoppingBag, Store, RefreshCw, AlertTriangle,
    Clock, Package, TrendingUp, Box, History
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getConnectedShop } from '../actions/shop';
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from '../actions/dashboard';
import { getSetupStatus, type SetupStatus } from '../actions/staging';
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [stats, setStats] = useState<DashboardStats>({
        productsSynced: 0,
        syncSuccessRate: 0,
        atRiskProducts: 0,
        connectedStores: 0,
        lastSync: '--'
    });
    const [activities, setActivities] = useState<ActivityItem[]>([]);

    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null, lastSync: null as string | null },
        etsy: { connected: false, name: null as string | null, lastSync: null as string | null }
    });

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        try {
            const [shopify, etsy, dashboardStats, recentActivity, wizardStatus] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getDashboardStats(),
                getRecentActivity(),
                getSetupStatus()
            ]);

            const newStores = {
                shopify: {
                    connected: shopify.connected,
                    name: shopify.shop_domain,
                    lastSync: shopify.last_sync
                },
                etsy: {
                    connected: etsy.connected,
                    name: etsy.shop_domain,
                    lastSync: etsy.last_sync
                }
            };

            setStores(newStores);
            setStats(dashboardStats);
            setActivities(recentActivity);

            // Redirect to setup if not complete
            // Condition: Both stores connected AND at least one product synced (or some other completion metric)
            // For now, let's say both connected is the bare minimum, but strict onboarding implies all steps.
            const isComplete = newStores.shopify.connected && newStores.etsy.connected && dashboardStats.productsSynced > 0;

            if (!isComplete && !isLoading) {
                // We don't want to redirect instantly if it causes a flash, but here we are inside loadData
                // Better to do this check in a simpler way or let the UI handle the redirect
            }

            // Actually, we can just redirect here
            if (!isComplete) {
                // Check if we are already coming from setup to valid loop? 
                // No, just push to setup.
                router.push('/setup');
            }

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadData();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">

            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col fixed top-0 left-0 h-screen z-20">
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
                        <span className="text-xl font-bold tracking-tight">MerSync</span>
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
            <main className="flex-1 min-w-0 md:ml-64">
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

                    {/* Loading State or Main Content */}
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100">
                                    <div className="flex items-center gap-3 mb-3">
                                        <Skeleton className="w-10 h-10 rounded-xl" />
                                    </div>
                                    <Skeleton className="h-8 w-16 mb-2" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
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
                                        <div className="text-2xl font-bold text-gray-900">{stats.productsSynced}</div>
                                        <div className="text-xs text-gray-500 mt-1">Products Synced</div>
                                    </div>

                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                                                <TrendingUp className="w-5 h-5 text-green-600" />
                                            </div>
                                        </div>
                                        <div className="text-2xl font-bold text-green-600">{stats.syncSuccessRate}%</div>
                                        <div className="text-xs text-gray-500 mt-1">Sync Success Rate</div>
                                    </div>

                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                                            </div>
                                        </div>
                                        <div className="text-2xl font-bold text-orange-600">{stats.atRiskProducts}</div>
                                        <div className="text-xs text-gray-500 mt-1">At-Risk Products</div>
                                    </div>

                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                                <Clock className="w-5 h-5 text-purple-600" />
                                            </div>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900">{stats.lastSync}</div>
                                        <div className="text-xs text-gray-500 mt-1">Last Sync</div>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
