'use client';

import { useState, useEffect } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell, ChevronRight,
    ShoppingBag, Store, Check, X, RefreshCw, Search,
    ArrowUpRight, Package, History, Box, Filter, MoreVertical,
    Download, Loader2, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock products data
const mockProducts = [
    { id: 1, name: 'Vintage Leather Bag', sku: 'VLB-001', shopifyStock: 12, etsyStock: 12, status: 'synced', lastSync: '2 min ago' },
    { id: 2, name: 'Handmade Ceramic Mug', sku: 'HCM-002', shopifyStock: 8, etsyStock: 8, status: 'synced', lastSync: '5 min ago' },
    { id: 3, name: 'Wooden Desk Organizer', sku: 'WDO-003', shopifyStock: 3, etsyStock: 5, status: 'mismatch', lastSync: '12 min ago' },
    { id: 4, name: 'Custom Phone Case', sku: 'CPC-004', shopifyStock: 25, etsyStock: 25, status: 'synced', lastSync: '18 min ago' },
    { id: 5, name: 'Knitted Winter Scarf', sku: 'KWS-005', shopifyStock: 0, etsyStock: 2, status: 'low', lastSync: '25 min ago' },
    { id: 6, name: 'Artisan Candle Set', sku: 'ACS-006', shopifyStock: 15, etsyStock: 15, status: 'synced', lastSync: '30 min ago' },
    { id: 7, name: 'Leather Wallet', sku: 'LW-007', shopifyStock: 7, etsyStock: 7, status: 'synced', lastSync: '45 min ago' },
    { id: 8, name: 'Personalized Jewelry Box', sku: 'PJB-008', shopifyStock: 4, etsyStock: 4, status: 'synced', lastSync: '1 hour ago' },
];

export default function ProductsPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Shopify connection and import states
    const [isShopifyConnected, setIsShopifyConnected] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);
    const [showConnectionBanner, setShowConnectionBanner] = useState(false);

    useEffect(() => {
        // Check for Shopify connection from localStorage
        const connectionData = localStorage.getItem('shopify_connection');
        if (connectionData) {
            const parsed = JSON.parse(connectionData);
            setIsShopifyConnected(parsed.connected);
        }

        // Check if redirected from OAuth callback
        if (searchParams.get('shopify_connected') === 'true') {
            setShowConnectionBanner(true);
            setIsShopifyConnected(true);
            // Hide banner after 5 seconds
            setTimeout(() => setShowConnectionBanner(false), 5000);
        }
    }, [searchParams]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleImportProducts = async () => {
        setIsImporting(true);
        try {
            // Call the import API endpoint
            const response = await fetch('https://api.mercsync.com/webhook/shopify/import-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user?.id,
                    action: 'import_all_products'
                })
            });

            if (!response.ok) {
                throw new Error('Import failed');
            }

            setImportSuccess(true);
            setTimeout(() => setImportSuccess(false), 5000);
        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to import products. Please try again.');
        } finally {
            setIsImporting(false);
        }
    };

    const filteredProducts = mockProducts.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterStatus === 'all' || product.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'synced':
                return <span className="px-2.5 py-1 text-xs font-semibold text-green-700 bg-green-50 rounded-full">Synced</span>;
            case 'mismatch':
                return <span className="px-2.5 py-1 text-xs font-semibold text-orange-700 bg-orange-50 rounded-full">Mismatch</span>;
            case 'low':
                return <span className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 rounded-full">Low Stock</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-50 rounded-full">Unknown</span>;
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
            <main className="flex-1 min-w-0">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-8">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Products</h1>
                        <p className="text-xs text-gray-500">{mockProducts.length} products synced</p>
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

                    {/* Connection Success Banner */}
                    {showConnectionBanner && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-green-800">Shopify Connected Successfully!</h3>
                                    <p className="text-sm text-green-600">You can now import your products.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowConnectionBanner(false)}
                                className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}

                    {/* Import Success Banner */}
                    {importSuccess && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3"
                        >
                            <CheckCircle2 className="w-5 h-5 text-blue-600" />
                            <p className="text-sm font-medium text-blue-800">Products imported successfully! They will appear shortly.</p>
                        </motion.div>
                    )}

                    {/* Import Products Section */}
                    {isShopifyConnected && (
                        <div className="bg-gradient-to-r from-[#95BF47] to-[#7ea23d] rounded-2xl p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                                    <ShoppingBag className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-lg">Import Shopify Products</h3>
                                    <p className="text-white/80 text-sm">Pull all products from your connected Shopify store</p>
                                </div>
                            </div>
                            <button
                                onClick={handleImportProducts}
                                disabled={isImporting}
                                className="px-6 py-3 bg-white text-[#95BF47] font-bold rounded-xl hover:bg-white/90 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isImporting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" />
                                        Import Products
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Not Connected - Show connect prompt */}
                    {!isShopifyConnected && (
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                                    <ShoppingBag className="w-6 h-6 text-gray-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">Connect Shopify to Import Products</h3>
                                    <p className="text-gray-500 text-sm">Link your store to automatically sync inventory</p>
                                </div>
                            </div>
                            <Link
                                href="/dashboard/settings"
                                className="px-6 py-3 bg-[#95BF47] text-white font-bold rounded-xl hover:bg-[#7ea23d] transition-colors flex items-center gap-2"
                            >
                                Connect Shopify
                                <ArrowUpRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}

                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search products by name or SKU..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-700"
                            >
                                <option value="all">All Status</option>
                                <option value="synced">Synced</option>
                                <option value="mismatch">Mismatch</option>
                                <option value="low">Low Stock</option>
                            </select>
                        </div>
                    </div>

                    {/* Products Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Product</th>
                                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">SKU</th>
                                        <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
                                                Shopify
                                            </div>
                                        </th>
                                        <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <Store className="w-4 h-4 text-[#F56400]" />
                                                Etsy
                                            </div>
                                        </th>
                                        <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                                        <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Last Sync</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredProducts.map((product) => (
                                        <motion.tr
                                            key={product.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-gray-50 transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                                        <Package className="w-5 h-5 text-gray-400" />
                                                    </div>
                                                    <span className="font-medium text-gray-900">{product.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-500 font-mono">{product.sku}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-lg font-bold text-gray-900">{product.shopifyStock}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-lg font-bold text-gray-900">{product.etsyStock}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {getStatusBadge(product.status)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-sm text-gray-400">{product.lastSync}</span>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredProducts.length === 0 && (
                            <div className="p-12 text-center">
                                <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="font-semibold text-gray-900 mb-2">No products found</h3>
                                <p className="text-gray-500 text-sm">Try adjusting your search or filter</p>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
