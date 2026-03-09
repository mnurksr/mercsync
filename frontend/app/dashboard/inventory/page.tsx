'use client';

import React, { useState, useEffect } from 'react';
import { getInventoryItems, forceSyncStock, type InventoryItem } from '../../actions/inventory';
import {
    Search, Package, Layers, RefreshCw,
    AlertTriangle, Check, Loader2, ArrowRightLeft,
    Box, ExternalLink
} from 'lucide-react';
import { useToast } from "@/components/ui/useToast";

export default function InventoryPage() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            loadData();
        }, 400);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await getInventoryItems(searchQuery || undefined);
            setItems(data);
        } catch (error) {
            console.error('Failed to load inventory:', error);
            toast.error('Failed to load inventory.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForceSync = async (id?: string) => {
        setIsSyncing(true);
        try {
            const res = await forceSyncStock(id);
            if (res.success) {
                toast.success(res.message);
                loadData();
            } else {
                toast.error(res.message);
            }
        } catch (err) {
            toast.error('Failed to trigger sync');
        } finally {
            setIsSyncing(false);
        }
    };

    const getStockStatus = (available: number) => {
        if (available <= 0) return { label: 'Out of Stock', color: 'bg-red-50 text-red-700 ring-red-600/20' };
        if (available < 5) return { label: 'Low Stock', color: 'bg-amber-50 text-amber-700 ring-amber-600/20' };
        return { label: 'In Stock', color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' };
    };

    return (
        <div className="max-w-6xl mx-auto w-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Inventory</h1>
                    <p className="text-gray-500">Manage your master stock levels and synchronize across platforms.</p>
                </div>

                <button
                    onClick={() => handleForceSync()}
                    disabled={isSyncing || isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    Sync All Items
                </button>
            </div>

            {/* Filters & Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search inventory by SKU or product name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                    />
                </div>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">SKU</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Available</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">Reserved</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider">On Hand</th>
                                <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-48"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                        <td className="px-6 py-5"><div className="h-6 bg-gray-200 rounded-full w-20"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-12"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-12"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-12"></div></td>
                                        <td className="px-6 py-5 text-right"><div className="h-8 bg-gray-200 rounded w-20 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-400">
                                            <Layers className="w-16 h-16 mb-4 opacity-20" />
                                            <p className="text-xl font-bold text-gray-900">Inventory is empty</p>
                                            <p className="text-sm">Wait for initial sync to complete or link your products.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => {
                                    const status = getStockStatus(item.available_stock);
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{item.name || 'Unnamed Product'}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {item.shopify_variant_id && (
                                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">Shopify</span>
                                                            )}
                                                            {item.etsy_variant_id && (
                                                                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase">Etsy</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-mono text-gray-500 font-medium">{item.sku || 'NO-SKU'}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ring-1 ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-bold text-gray-900">{item.available_stock}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-medium text-gray-400">{item.reserved_stock}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-black text-gray-900">{item.on_hand_stock}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    onClick={() => handleForceSync(item.id)}
                                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Force re-sync"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
