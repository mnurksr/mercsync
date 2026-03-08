'use client';

import { useState, useEffect } from 'react';
import { getPlatformListings, getInventoryStats, type ListingItem } from '../../actions/inventory';
import {
    Search, Package, Box, Filter,
    Loader2, ShoppingBag, Store, AlertTriangle
} from 'lucide-react';

export default function ProductsPage() {
    const [activePlatform, setActivePlatform] = useState<'shopify' | 'etsy'>('shopify');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<ListingItem[]>([]);
    const [stats, setStats] = useState({ total: 0, lowStock: 0, outOfStock: 0 });

    useEffect(() => {
        loadData();
    }, [activePlatform]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            loadData();
        }, 400);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [itemList, statsData] = await Promise.all([
                getPlatformListings(activePlatform, searchQuery || undefined),
                getInventoryStats(activePlatform)
            ]);

            setItems(itemList);
            setStats(statsData);
        } catch (error) {
            console.error('Failed to load listings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredItems = items.filter(item => {
        if (filterStatus === 'all') return true;
        return item.status === filterStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'synced':
            case 'active':
                return <span className="px-3 py-1 bg-green-50 text-green-700 ring-1 ring-green-600/20 rounded-full text-xs font-semibold">Synced</span>;
            case 'low':
                return <span className="px-3 py-1 bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 rounded-full text-xs font-semibold">Low Stock</span>;
            case 'out':
            case 'out_of_stock':
                return <span className="px-3 py-1 bg-red-50 text-red-700 ring-1 ring-red-600/20 rounded-full text-xs font-semibold">Out of Stock</span>;
            default:
                return <span className="px-3 py-1 bg-gray-50 text-gray-700 ring-1 ring-gray-600/20 rounded-full text-xs font-semibold">{status}</span>;
        }
    };

    return (
        <div className="max-w-6xl mx-auto w-full pb-20">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Catalog</h1>
                    <p className="text-gray-500">View your products as they appear on your sales channels.</p>
                </div>

                {/* Platform Toggle */}
                <div className="bg-gray-100 p-1.5 rounded-xl flex items-center shadow-inner">
                    <button
                        onClick={() => setActivePlatform('shopify')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activePlatform === 'shopify'
                                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/50'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <ShoppingBag className={`w-4 h-4 ${activePlatform === 'shopify' ? 'text-blue-600' : ''}`} />
                        Shopify
                    </button>
                    <button
                        onClick={() => setActivePlatform('etsy')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activePlatform === 'etsy'
                                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/50'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Store className={`w-4 h-4 ${activePlatform === 'etsy' ? 'text-orange-500' : ''}`} />
                        Etsy
                    </button>
                </div>
            </div>

            {/* KPI Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                        <Package className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Total Listings</p>
                        <p className="text-2xl font-bold text-gray-900">{isLoading ? <span className="animate-pulse">...</span> : stats.total}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Low Stock</p>
                        <p className="text-2xl font-bold text-gray-900">{isLoading ? <span className="animate-pulse">...</span> : stats.lowStock}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                        <Box className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Out of Stock</p>
                        <p className="text-2xl font-bold text-gray-900">{isLoading ? <span className="animate-pulse">...</span> : stats.outOfStock}</p>
                    </div>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search products by title or sku..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative bg-gray-50 border border-gray-200 rounded-xl flex items-center overflow-hidden">
                        <div className="pl-3 py-2 border-r border-gray-200 text-gray-400">
                            <Filter className="w-4 h-4" />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-transparent pl-3 pr-8 py-2.5 text-sm font-semibold text-gray-700 focus:outline-none cursor-pointer appearance-none"
                        >
                            <option value="all">All Statuses</option>
                            <option value="synced">Synced</option>
                            <option value="low">Low Stock</option>
                            <option value="out">Out of Stock</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Stock</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Variants</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                // Skeleton loading rows
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                                                <div className="h-4 bg-gray-200 rounded w-48"></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 rounded-full"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-12 bg-gray-200 rounded"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded"></div></td>
                                    </tr>
                                ))
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <Package className="w-12 h-12 text-gray-300 mb-3" />
                                            <p className="text-lg font-medium text-gray-900">No products found</p>
                                            <p className="text-sm mt-1">Try adjusting your search or platform view.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item) => (
                                    <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200/50 shadow-sm flex items-center justify-center">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-5 h-5 text-gray-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                                        {item.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] font-medium text-gray-500 tracking-wide uppercase">
                                                            ID: {item.id}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(item.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`text-sm font-bold ${item.totalStock <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {item.totalStock} <span className="text-gray-500 font-medium text-xs">units</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex -space-x-2">
                                                    {[...Array(Math.min(3, item.variantsCount))].map((_, i) => (
                                                        <div key={i} className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center z-10">
                                                            <Package className="w-3 h-3 text-gray-400" />
                                                        </div>
                                                    ))}
                                                    {item.variantsCount > 3 && (
                                                        <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center z-0 text-[10px] font-bold text-gray-500">
                                                            +{item.variantsCount - 3}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs font-semibold text-gray-600">{item.variantsCount} options</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
