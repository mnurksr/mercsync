'use client';

import { useState, useEffect } from 'react';
import { getInventoryItems, getInventoryStats, type InventoryItem } from '../../actions/inventory';
import { getSetupStatus, type SetupStatus } from '../../actions/staging';
import {
    LayoutDashboard, LogOut, Settings, Bell,
    ShoppingBag, Store, Check, Search,
    Package, History, Box, Filter, MoreVertical,
    Download, Loader2, CheckCircle2, AlertTriangle, GitCompare, ExternalLink,
    RefreshCw, TrendingDown, XCircle, Link2
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Skeleton } from "@/components/ui/skeleton";

// ====== FRESH LOAD LOADER ======
// Caching removed as per user request to ensure skeleton states are visible

export default function ProductsPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // ====== FRESH LOAD STATE ======
    // User requested NO caching to ensure skeleton loading is always visible on navigation
    const [isLoading, setIsLoading] = useState(true);

    // Data states
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [stats, setStats] = useState({ total: 0, lowStock: 0, outOfStock: 0, shopifyOnly: 0, etsyOnly: 0 });
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

    // Connection states
    const [connectingTarget, setConnectingTarget] = useState<'shopify' | 'etsy' | null>(null);
    const [shopName, setShopName] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);

    useEffect(() => {
        if (user) loadData();
    }, [user]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (user) loadData();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const loadData = async () => {
        // ====== STALE-WHILE-REVALIDATE: Background refresh, update only if changed ======
        try {
            const [itemList, statsData, wizardStatus] = await Promise.all([
                getInventoryItems(searchQuery || undefined),
                getInventoryStats(),
                getSetupStatus()
            ]);

            setItems(itemList);
            setStats(statsData);
            setSetupStatus(wizardStatus);

        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleConnect = (platform: 'shopify' | 'etsy') => {
        if (!shopName.trim()) return;
        if (!user?.id) return;

        let cleanShopName = shopName.trim();
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/${platform}/callback`);

        if (platform === 'shopify' && !cleanShopName.includes('.')) {
            cleanShopName += '.myshopify.com';
        }

        const shop = encodeURIComponent(cleanShopName);
        window.location.href = `https://api.mercsync.com/webhook/auth/${platform}/start?user_id=${user.id}&shop=${shop}&return_url=${returnUrl}`;
    };

    const handleImportProducts = async () => {
        setIsImporting(true);
        try {
            const response = await fetch('https://api.mercsync.com/webhook/shopify-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user?.id })
            });
            if (response.ok) {
                setImportSuccess(true);
                setTimeout(() => setImportSuccess(false), 5000);
                await loadData();
            }
        } catch (error) {
            console.error('Import error:', error);
        } finally {
            setIsImporting(false);
        }
    };

    const filteredItems = items.filter(item => {
        if (filterStatus === 'all') return true;
        return item.status === filterStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'synced':
                return <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Synced</span>;
            case 'low':
                return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">Low Stock</span>;
            case 'out':
                return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Out of Stock</span>;
            case 'shopify_only':
                return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Shopify Only</span>;
            case 'etsy_only':
                return <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Etsy Only</span>;
            default:
                return <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">{status}</span>;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex" style={{ overscrollBehavior: 'none' }}>
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
                    <Link href="/dashboard/products" className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium">
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
                        <h1 className="text-xl font-bold text-gray-800">Inventory</h1>
                        <p className="text-xs text-gray-500">{stats.total} products tracked</p>
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

                <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 space-y-6">

                    {/* Import Success Banner */}
                    {importSuccess && (
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <p className="text-sm font-medium text-green-800">Products imported successfully!</p>
                        </div>
                    )}

                    {/* Setup Wizard - Only show when setup is not complete */}
                    {!isLoading && setupStatus && !setupStatus.isComplete && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Shopify Box */}
                            <div className={`rounded-2xl p-5 border-2 transition-all ${setupStatus.shopifyExported
                                ? 'bg-green-50 border-green-200'
                                : setupStatus.shopifyConnected
                                    ? 'bg-[#95BF47]/10 border-[#95BF47]'
                                    : 'bg-gray-50 border-gray-200'
                                }`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${setupStatus.shopifyExported ? 'bg-green-100' : 'bg-white border border-gray-100'}`}>
                                        {setupStatus.shopifyExported ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <ShoppingBag className="w-5 h-5 text-[#95BF47]" />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Shopify</h4>
                                        <p className="text-xs text-gray-500">
                                            {setupStatus.shopifyExported ? `${setupStatus.shopifyProductCount} products` : setupStatus.shopifyConnected ? 'Connected' : 'Not connected'}
                                        </p>
                                    </div>
                                </div>
                                {!setupStatus.shopifyConnected ? (
                                    connectingTarget === 'shopify' ? (
                                        <div className="flex gap-2">
                                            <input autoFocus type="text" placeholder="store-name" className="flex-1 px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#95BF47] outline-none text-sm" value={shopName} onChange={e => setShopName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect('shopify')} />
                                            <button onClick={() => handleConnect('shopify')} className="bg-[#95BF47] text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#7ea23d]">Go</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => { setConnectingTarget('shopify'); setShopName(''); }} className="w-full px-4 py-2 bg-[#95BF47] text-white font-semibold rounded-xl hover:bg-[#7ea23d] text-sm">Connect Shopify</button>
                                    )
                                ) : setupStatus.shopifyExported ? (
                                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium"><Check className="w-4 h-4" />Export Complete</div>
                                ) : (
                                    <button onClick={handleImportProducts} disabled={isImporting} className="w-full px-4 py-2 bg-[#95BF47] text-white font-semibold rounded-xl hover:bg-[#7ea23d] text-sm flex items-center justify-center gap-2">
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export Products
                                    </button>
                                )}
                            </div>

                            {/* Map Products Box */}
                            <Link href="/dashboard/staging" className={`rounded-2xl p-5 border-2 transition-all flex flex-col items-center justify-center text-center hover:shadow-md ${(setupStatus.shopifyExported || setupStatus.etsyExported) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-50 pointer-events-none'}`}>
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${(setupStatus.shopifyExported || setupStatus.etsyExported) ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                    <GitCompare className={`w-6 h-6 ${(setupStatus.shopifyExported || setupStatus.etsyExported) ? 'text-blue-600' : 'text-gray-400'}`} />
                                </div>
                                <h4 className="font-bold text-gray-900 mb-1">Map Products</h4>
                                <p className="text-xs text-gray-500 mb-3">Match products between platforms</p>
                                {(setupStatus.shopifyExported || setupStatus.etsyExported) && (
                                    <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">View Staging <ExternalLink className="w-3 h-3" /></div>
                                )}
                            </Link>

                            {/* Etsy Box */}
                            <div className={`rounded-2xl p-5 border-2 transition-all ${setupStatus.etsyExported
                                ? 'bg-green-50 border-green-200'
                                : setupStatus.etsyConnected
                                    ? 'bg-[#F56400]/10 border-[#F56400]'
                                    : 'bg-gray-50 border-gray-200'
                                }`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${setupStatus.etsyExported ? 'bg-green-100' : 'bg-white border border-gray-100'}`}>
                                        {setupStatus.etsyExported ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Store className="w-5 h-5 text-[#F56400]" />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Etsy</h4>
                                        <p className="text-xs text-gray-500">
                                            {setupStatus.etsyExported ? `${setupStatus.etsyProductCount} products` : setupStatus.etsyConnected ? 'Connected' : 'Not connected'}
                                        </p>
                                    </div>
                                </div>
                                {!setupStatus.etsyConnected ? (
                                    connectingTarget === 'etsy' ? (
                                        <div className="flex gap-2">
                                            <input autoFocus type="text" placeholder="shop-name" className="flex-1 px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F56400] outline-none text-sm" value={shopName} onChange={e => setShopName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect('etsy')} />
                                            <button onClick={() => handleConnect('etsy')} className="bg-[#F56400] text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#d95700]">Go</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => { setConnectingTarget('etsy'); setShopName(''); }} className="w-full px-4 py-2 bg-[#F56400] text-white font-semibold rounded-xl hover:bg-[#d95700] text-sm">Connect Etsy</button>
                                    )
                                ) : setupStatus.etsyExported ? (
                                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium"><Check className="w-4 h-4" />Export Complete</div>
                                ) : (
                                    <button onClick={handleImportProducts} disabled={isImporting} className="w-full px-4 py-2 bg-[#F56400] text-white font-semibold rounded-xl hover:bg-[#d95700] text-sm flex items-center justify-center gap-2">
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export Products
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-gray-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-500">Total Products</span>
                            </div>
                            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-gray-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <TrendingDown className="w-5 h-5 text-amber-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-500">Low Stock</span>
                            </div>
                            <p className="text-3xl font-bold text-amber-600">{stats.lowStock}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-gray-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                    <XCircle className="w-5 h-5 text-red-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-500">Out of Stock</span>
                            </div>
                            <p className="text-3xl font-bold text-red-600">{stats.outOfStock}</p>
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-gray-200">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <ShoppingBag className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-500">Shopify Only</span>
                            </div>
                            <p className="text-3xl font-bold text-blue-600">{stats.shopifyOnly}</p>
                        </div>
                    </div>

                    {/* Products Table */}
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        {/* Search & Filter Bar */}
                        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                >
                                    <option value="all">All Status</option>
                                    <option value="synced">Synced</option>
                                    <option value="low">Low Stock</option>
                                    <option value="out">Out of Stock</option>
                                    <option value="mismatch">Mismatch</option>
                                </select>
                                <button onClick={loadData} className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <ShoppingBag className="w-3.5 h-3.5" />Shopify
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <Store className="w-3.5 h-3.5" />Etsy
                                            </div>
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {isLoading ? (
                                        // Skeleton Loading Rows
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <Skeleton className="w-10 h-10 rounded-lg" />
                                                        <div className="space-y-2">
                                                            <Skeleton className="h-4 w-32" />
                                                            <Skeleton className="h-3 w-20" />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <Skeleton className="w-6 h-6 rounded-full" />
                                                        <Skeleton className="w-6 h-6 rounded-full" />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Skeleton className="h-6 w-12 mx-auto" />
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Skeleton className="h-6 w-12 mx-auto" />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Skeleton className="h-6 w-20 rounded-full" />
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Skeleton className="h-8 w-8 ml-auto rounded-lg" />
                                                </td>
                                            </tr>
                                        ))
                                    ) : filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center">
                                                <Box className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="font-medium text-gray-600">No products found</p>
                                                <p className="text-sm text-gray-400">Try adjusting your search or filter</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                                            {item.imageUrl ? (
                                                                <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-gray-900 truncate max-w-[200px]">{item.name || 'Unnamed Product'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {(item.platform === 'shopify' || item.platform === 'both') && (
                                                            <svg className="w-5 h-5" viewBox="0 0 109.5 124.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M95.9 23.9c-.1-.6-.6-1-1.1-1-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.7-.7-2.2-.5-2.7-.3 0 0-1.4.4-3.7 1.1-.4-1.3-1-2.8-1.8-4.4-2.6-5-6.5-7.7-11.1-7.7-.3 0-.6 0-1 .1-.1-.2-.3-.3-.4-.5-2-2.2-4.6-3.2-7.7-3.1-6 .2-12 4.5-16.8 12.2-3.4 5.4-6 12.2-6.8 17.5-6.9 2.1-11.7 3.6-11.8 3.7-3.5 1.1-3.6 1.2-4 4.5-.3 2.5-9.5 73.1-9.5 73.1l75.6 13.1 32.6-8.1s-22.2-149.2-22.3-149.8zM67.2 18.5l-5.7 1.8c0-3-.4-7.3-1.8-11 4.5.9 6.7 5.9 7.5 9.2zm-9.4 2.9l-12.3 3.8c1.2-4.6 3.5-9.2 6.3-12.2 1.1-1.1 2.6-2.4 4.3-3.1 1.6 3.5 1.7 8.5 1.7 11.5zm-7.9-15.5c1.4 0 2.6.3 3.6.9-1.6.8-3.2 2.1-4.7 3.6-3.8 4-6.6 10.2-7.8 16.2-4.1 1.3-8.1 2.5-11.8 3.7 2.3-10.8 11.6-24.2 20.7-24.4z" fill="#95BF47" />
                                                                <path d="M94.8 22.9c-.5 0-9.3-.2-9.3-.2s-7.4-7.2-8.1-7.9c-.3-.3-.6-.4-1-.4v98.8l32.6-8.1S86.8 55.5 86.7 55c-.1-.5-.6-.9-1.1-.9-.5 0-9.3-.2-9.3-.2" fill="#5E8E3E" />
                                                                <path d="M58.2 38.9l-4.3 12.9s-3.8-2-8.5-2c-6.8 0-7.2 4.3-7.2 5.4 0 5.9 15.4 8.2 15.4 22.1 0 10.9-6.9 18-16.2 18-11.2 0-16.9-7-16.9-7l3-9.9s5.9 5.1 10.8 5.1c3.2 0 4.6-2.5 4.6-4.4 0-7.7-12.6-8-12.6-20.8 0-10.7 7.7-21 23.2-21 6 .1 8.7 1.6 8.7 1.6z" fill="#fff" />
                                                            </svg>
                                                        )}
                                                        {(item.platform === 'etsy' || item.platform === 'both') && (
                                                            <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256 256-114.6 256-256S397.4 0 256 0z" fill="#F56400" />
                                                                <path d="M374.8 336.3c-.6 4.5-1.6 8-8.2 11.5-16 8.4-51.5 12.8-51.5 12.8l-2.9-18.5s32.4-4.3 35.6-18.6c1.4-6.5-4.5-8.3-9.7-8.8-55.2-5.8-53.3-5.9-56.7-8.5-6.2-4.8-8-16-8.2-22.9l-3.7-55c-.2-3 0-10.6 3.5-16.3 3.5-5.7 10.2-9.7 17.6-9.7 10.2 0 17.3 7.7 18.7 16.5l3.5 24.5h73.9s2-72.8-62.5-72.8c-41.7 0-65 19.2-77.6 48.8-2.9 6.7-4.2 15-4.2 22.2l.5 39.6s1 42.6 30.4 67.2c18.7 15.6 48.7 26.5 101.9 19.8l-.4-31.8" fill="#fff" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {item.platform === 'etsy' ? (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    ) : (
                                                        <span className="text-lg font-bold text-gray-900">
                                                            {item.shopifyStock}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {item.platform === 'shopify' ? (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    ) : (
                                                        <span className="text-lg font-bold text-gray-900">
                                                            {item.etsyStock}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(item.status)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                            <div>Showing {filteredItems.length} of {items.length} products</div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
