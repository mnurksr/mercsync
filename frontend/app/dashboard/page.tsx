'use client';

import { useState, useEffect } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell, ChevronRight, ChevronLeft,
    ShoppingBag, Store, Check, X, RefreshCw, AlertTriangle,
    ArrowUpRight, Clock, Package, TrendingUp, Shield, Box, History,
    PartyPopper, ArrowRight, X as CloseIcon, Loader2, GitCompare, Download
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop } from '../actions/shop';
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from '../actions/dashboard';
import { getSetupStatus, type SetupStatus } from '../actions/staging';
import { Skeleton } from "@/components/ui/skeleton";
import confetti from 'canvas-confetti';

// ====== FRESH LOAD LOADER ======
// Caching removed as per user request to ensure skeleton states are visible

export default function Dashboard() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ====== FRESH LOAD STATE ======
    // User requested NO caching to ensure skeleton loading is always visible on navigation
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

    // Modal states
    const [showShopifyModal, setShowShopifyModal] = useState(false);
    const [showEtsyModal, setShowEtsyModal] = useState(false);
    const [shopName, setShopName] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    // Wizard States
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1); // 1: Shopify, 2: Etsy, 3: Import, 4: Matching
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

    // Calculate the correct wizard step based on actual state
    const calculateWizardStep = (storesData: typeof stores, status: SetupStatus | null) => {
        // If both platforms have exported products -> Step 4 (Matching)
        if (status?.shopifyExported && status?.etsyExported) return 4;
        // If both platforms are connected -> Step 3 (Import)
        if (storesData.shopify.connected && storesData.etsy.connected) return 3;
        // If Shopify is connected -> Step 2 (Etsy)
        if (storesData.shopify.connected) return 2;
        // Otherwise -> Step 1 (Shopify)
        return 1;
    };

    // Save wizard step to localStorage when it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('mercsync_wizard_step', String(wizardStep));
        }
    }, [wizardStep]);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    // Calculate Progress
    const calculateProgress = () => {
        let completed = 0;
        let total = 3;
        if (stores.shopify.connected) completed++;
        if (stores.etsy.connected) completed++;
        if (stats.productsSynced > 0) completed++;
        return Math.round((completed / total) * 100);
    };



    const loadData = async () => {
        // ====== STALE-WHILE-REVALIDATE: Background refresh, update only if changed ======
        try {
            // Fetch all data from server
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
            setSetupStatus(wizardStatus);

            // Calculate correct wizard step based on actual state
            const correctStep = calculateWizardStep(newStores, wizardStatus);
            setWizardStep(correctStep);

            if (correctStep === 4 && showWizard && correctStep !== wizardStep) {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
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

    const handleImportProducts = async () => {
        setIsImporting(true);
        try {
            const response = await fetch('https://api.mercsync.com/webhook/shopify/import-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user?.id,
                    action: 'import_all_products'
                })
            });

            if (!response.ok) throw new Error('Import failed');

            // Poll for updates a few times
            let attempts = 0;
            const pollInterval = setInterval(async () => {
                attempts++;
                await loadData();
                if (attempts >= 5) clearInterval(pollInterval);
            }, 3000);

            alert('Import started successfully! We are syncing your products in the background.');

            // Allow manual advance for UX
            if (showWizard) {
                setTimeout(() => setWizardStep(4), 1500);
                confetti();
            }

        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to start import. Please try again.');
        } finally {
            setIsImporting(false);
        }
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
        let cleanShopName = shopName.trim();
        if (!cleanShopName.includes('.')) {
            cleanShopName += '.myshopify.com';
        }
        const shop = encodeURIComponent(cleanShopName);

        const startUrl = `https://api.mercsync.com/webhook/auth/shopify/start?user_id=${userId}&shop=${shop}&return_url=${returnUrl}`;
        window.location.href = startUrl;
    };

    const handleConnectEtsy = () => {
        if (!shopName.trim()) {
            alert('Lütfen mağaza adını girin');
            return;
        }
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/etsy/callback`);
        const userId = user?.id || '';
        const shop = encodeURIComponent(shopName.trim());
        window.location.href = `https://api.mercsync.com/webhook/auth/etsy/start?user_id=${userId}&shop=${shop}&return_url=${returnUrl}`;
    };

    // Determine if onboarding is complete (all steps done)
    const isOnboardingComplete = stores.shopify.connected && stores.etsy.connected && stats.productsSynced > 0;
    const progress = calculateProgress();

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

                    {/* Setup Progress Card - Wraps the Logic */}
                    {!isLoading && !isOnboardingComplete && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm relative overflow-hidden"
                        >
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="space-y-3 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 rounded-lg">
                                            <TrendingUp className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <h2 className="text-lg font-bold text-gray-900">Complete Your Setup</h2>
                                    </div>
                                    <p className="text-gray-500 text-sm max-w-lg">
                                        Finish connecting your stores to unlock automated inventory syncing.
                                    </p>

                                    {/* Progress Bar */}
                                    <div className="space-y-2 max-w-sm">
                                        <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-gray-400">
                                            <span>{progress}% Completed</span>
                                            <span>3 Steps</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-blue-600 rounded-full"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ duration: 1, ease: "easeOut" }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                        // Calculate correct step from current state before opening
                                        const correctStep = calculateWizardStep(stores, setupStatus);
                                        setWizardStep(correctStep);
                                        setShowWizard(true);
                                    }}
                                    className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl text-sm shadow-md shadow-gray-200 flex items-center gap-2 transition-all whitespace-nowrap"
                                >
                                    {progress > 0 ? 'Continue Setup' : 'Start Setup'} <ArrowRight className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {/* Sync Health Metrics */}
                    <section>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Sync Health</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {isLoading ? (
                                <>
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100">
                                            <div className="flex items-center gap-3 mb-3">
                                                <Skeleton className="w-10 h-10 rounded-xl" />
                                            </div>
                                            <Skeleton className="h-8 w-16 mb-2" />
                                            <Skeleton className="h-3 w-24" />
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>
                    </section>


                </div>
            </main>

            {/* WIZARD MODAL */}
            <AnimatePresence>
                {showWizard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl p-0 w-full max-w-xl shadow-2xl overflow-hidden relative"
                        >
                            {/* Header */}
                            <div className="bg-gray-50 px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {wizardStep > 1 && (
                                        <button
                                            onClick={() => setWizardStep(prev => Math.max(1, prev - 1))}
                                            className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4 text-gray-500" />
                                        </button>
                                    )}
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">
                                            {wizardStep === 4 ? 'Setup Complete!' : `Step ${wizardStep} of 3`}
                                        </h3>
                                        <p className="text-gray-500 text-sm">
                                            {wizardStep === 1 ? 'Connect your primary store' :
                                                wizardStep === 2 ? 'Connect secondary store' :
                                                    wizardStep === 3 ? 'Sync your inventory' :
                                                        'You are ready to go!'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowWizard(false)}
                                    className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                    <CloseIcon className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-8">
                                {/* Step 1: Shopify */}
                                {wizardStep === 1 && (
                                    <div className="space-y-6">
                                        <div className="flex flex-col items-center text-center p-6 bg-green-50 rounded-2xl border border-green-100">
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${stores.shopify.connected ? 'bg-green-500 shadow-green-200' : 'bg-[#95BF47] shadow-green-200'}`}>
                                                {stores.shopify.connected ? <Check className="w-8 h-8 text-white" /> : <ShoppingBag className="w-8 h-8 text-white" />}
                                            </div>
                                            <h4 className="text-lg font-bold text-gray-900 mb-2">
                                                {stores.shopify.connected ? 'Shopify Connected' : 'Connect Shopify'}
                                            </h4>
                                            <p className="text-gray-600 text-sm max-w-xs">
                                                {stores.shopify.connected
                                                    ? `Connected to ${stores.shopify.name || 'your store'}`
                                                    : 'Enter your store domain to connect your Shopify store first.'}
                                            </p>
                                        </div>
                                        {stores.shopify.connected ? (
                                            <button
                                                onClick={() => setWizardStep(2)}
                                                className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                Continue to Etsy <ArrowRight className="w-5 h-5" />
                                            </button>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={shopName}
                                                        onChange={(e) => setShopName(e.target.value)}
                                                        placeholder="my-store"
                                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#95BF47]"
                                                    />
                                                    <span className="text-gray-400 font-medium">.myshopify.com</span>
                                                </div>
                                                <button
                                                    onClick={handleConnectShopify}
                                                    className="w-full py-4 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
                                                >
                                                    Connect Shopify <ArrowRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 2: Etsy */}
                                {wizardStep === 2 && (
                                    <div className="space-y-6">
                                        <div className="flex flex-col items-center text-center p-6 bg-orange-50 rounded-2xl border border-orange-100">
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${stores.etsy.connected ? 'bg-green-500 shadow-green-200' : 'bg-[#F56400] shadow-orange-200'}`}>
                                                {stores.etsy.connected ? <Check className="w-8 h-8 text-white" /> : <Store className="w-8 h-8 text-white" />}
                                            </div>
                                            <h4 className="text-lg font-bold text-gray-900 mb-2">
                                                {stores.etsy.connected ? 'Etsy Connected' : 'Connect Etsy'}
                                            </h4>
                                            <p className="text-gray-600 text-sm max-w-xs">
                                                {stores.etsy.connected
                                                    ? `Connected to ${stores.etsy.name || 'your Etsy shop'}`
                                                    : 'Now connect your Etsy shop to enable cross-platform syncing.'}
                                            </p>
                                        </div>
                                        {stores.etsy.connected ? (
                                            <button
                                                onClick={() => setWizardStep(3)}
                                                className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                Continue to Import <ArrowRight className="w-5 h-5" />
                                            </button>
                                        ) : (
                                            <div className="space-y-4">
                                                <input
                                                    type="text"
                                                    value={shopName}
                                                    onChange={(e) => setShopName(e.target.value)}
                                                    placeholder="Your Etsy Shop Name"
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F56400]"
                                                />
                                                <div className="grid grid-cols-2 gap-4">
                                                    <button
                                                        onClick={() => setWizardStep(3)}
                                                        className="py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                                                    >
                                                        Skip for now
                                                    </button>
                                                    <button
                                                        onClick={handleConnectEtsy}
                                                        className="py-4 bg-[#F56400] hover:bg-[#d95700] text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        Connect Etsy <ArrowRight className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Product Import - Split by Platform */}
                                {wizardStep === 3 && (
                                    <div className="space-y-6">
                                        <div className="text-center mb-4">
                                            <h4 className="text-lg font-bold text-gray-900 mb-2">Import Products</h4>
                                            <p className="text-gray-600 text-sm">
                                                Fetch products from each connected store
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Shopify Import */}
                                            <div className="bg-green-50 rounded-2xl border border-green-100 p-5 flex flex-col items-center text-center">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg ${setupStatus?.shopifyExported ? 'bg-green-500 shadow-green-200' : 'bg-[#95BF47] shadow-green-200'}`}>
                                                    {setupStatus?.shopifyExported ? <Check className="w-7 h-7 text-white" /> : <ShoppingBag className="w-7 h-7 text-white" />}
                                                </div>
                                                <h5 className="font-bold text-gray-900 mb-1">Shopify</h5>
                                                {setupStatus?.shopifyExported ? (
                                                    <>
                                                        <p className="text-green-600 text-xs mb-2 font-medium">{setupStatus.shopifyProductCount} products</p>
                                                        <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
                                                            <Check className="w-4 h-4" /> Export Complete
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-gray-500 text-xs mb-4">Import all Shopify products</p>
                                                        <button
                                                            onClick={async () => {
                                                                setIsImporting(true);
                                                                try {
                                                                    const response = await fetch('https://api.mercsync.com/webhook/shopify-import', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ user_id: user?.id })
                                                                    });
                                                                    if (response.ok) {
                                                                        alert('Shopify products import started!');
                                                                        await loadData();
                                                                    } else {
                                                                        throw new Error('Import failed');
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Shopify import error:', error);
                                                                    alert('Failed to import Shopify products');
                                                                } finally {
                                                                    setIsImporting(false);
                                                                }
                                                            }}
                                                            disabled={isImporting || !stores.shopify.connected}
                                                            className="w-full py-3 bg-[#95BF47] hover:bg-[#7ea23d] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                        >
                                                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                            Import
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {/* Etsy Import */}
                                            <div className="bg-orange-50 rounded-2xl border border-orange-100 p-5 flex flex-col items-center text-center">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg ${setupStatus?.etsyExported ? 'bg-green-500 shadow-green-200' : 'bg-[#F56400] shadow-orange-200'}`}>
                                                    {setupStatus?.etsyExported ? <Check className="w-7 h-7 text-white" /> : <Store className="w-7 h-7 text-white" />}
                                                </div>
                                                <h5 className="font-bold text-gray-900 mb-1">Etsy</h5>
                                                {setupStatus?.etsyExported ? (
                                                    <>
                                                        <p className="text-green-600 text-xs mb-2 font-medium">{setupStatus.etsyProductCount} products</p>
                                                        <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
                                                            <Check className="w-4 h-4" /> Export Complete
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-gray-500 text-xs mb-4">Import all Etsy products</p>
                                                        <button
                                                            onClick={async () => {
                                                                // TODO: Etsy import URL will be added here
                                                                alert('Etsy import coming soon!');
                                                            }}
                                                            disabled={!stores.etsy.connected}
                                                            className="w-full py-3 bg-[#F56400] hover:bg-[#d95700] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                            Import
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Continue Button */}
                                        <button
                                            onClick={() => {
                                                setWizardStep(4);
                                                confetti();
                                            }}
                                            className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            Continue to Matching <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}

                                {/* Step 4: Product Matching - Redirect to Staging */}
                                {wizardStep === 4 && (
                                    <div className="text-center py-8">
                                        <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <GitCompare className="w-12 h-12 text-purple-600" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Match Your Products 🎯</h3>
                                        <p className="text-gray-500 max-w-sm mx-auto mb-8">
                                            Your products are imported! Now let's match your Shopify and Etsy listings together.
                                        </p>
                                        <button
                                            onClick={() => {
                                                setShowWizard(false);
                                                router.push('/dashboard/staging');
                                            }}
                                            className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mx-auto"
                                        >
                                            Start Matching <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Footer Progress Dots */}
                            <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-center gap-2">
                                {[1, 2, 3, 4].map((step) => (
                                    <div
                                        key={step}
                                        className={`w-2.5 h-2.5 rounded-full transition-colors ${step === wizardStep ? 'bg-blue-600' :
                                            step < wizardStep ? 'bg-blue-200' : 'bg-gray-200'
                                            }`}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Keeping old modals for individual access via Settings, if needed, though Wizard covers them. */}
        </div>
    );
}
