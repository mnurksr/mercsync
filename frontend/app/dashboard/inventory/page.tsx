'use client';

import React, { useState, useEffect } from 'react';
import { getInventoryItems, forceSyncStock, updateInventoryStock, type InventoryItem } from '../../actions/inventory';
import {
    Search, Package, Layers, RefreshCw,
    AlertTriangle, Check, Loader2,
    Box, ShoppingBag, Store, Pencil, X
} from 'lucide-react';
import { useToast } from "@/components/ui/useToast";

// --- StockEditModal Component ---
interface StockEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (newStock: number) => Promise<void>;
    item: InventoryItem | null;
}

function StockEditModal({ isOpen, onClose, onConfirm, item }: StockEditModalProps) {
    const [newStock, setNewStock] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (item) setNewStock(item.available_stock);
    }, [item]);

    if (!isOpen || !item) return null;

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm(newStock);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900">Update Stock</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600 border border-gray-100">
                            <Package className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                            <p className="text-xs font-mono text-gray-500 mt-0.5">{item.sku || 'NO-SKU'}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">New Available Stock</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={newStock}
                                    onChange={(e) => setNewStock(parseInt(e.target.value) || 0)}
                                    className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-lg font-bold"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Units</div>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                <strong>Important:</strong> This change will be pushed to all connected platforms (Shopify and Etsy). This cannot be undone.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-6 bg-gray-50 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 px-4 rounded-2xl border border-gray-200 bg-white text-gray-700 font-bold text-sm hover:bg-gray-100 transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        className="flex-[2] py-3.5 px-4 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Confirm Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Main InventoryPage Redesign ---
export default function InventoryPage() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

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

    const handleUpdateStock = async (newStock: number) => {
        if (!selectedItem) return;

        try {
            const res = await updateInventoryStock(selectedItem.id, newStock);
            if (res.success) {
                toast.success(res.message);
                loadData();
            } else {
                toast.error(res.message);
            }
        } catch (err) {
            toast.error('Failed to update stock');
        }
    };

    const getStockStatus = (available: number) => {
        if (available <= 0) return { label: 'Out of Stock', color: 'bg-red-50 text-red-600 ring-red-500/20' };
        if (available < 5) return { label: 'Low Stock', color: 'bg-amber-50 text-amber-600 ring-amber-500/20' };
        return { label: 'In Stock', color: 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' };
    };

    return (
        <div className="w-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Master Inventory</h1>
                    <p className="text-gray-500 font-medium">Control your warehouse stock levels across all sales channels.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleForceSync()}
                        disabled={isSyncing || isLoading}
                        className="flex items-center gap-2 px-6 py-3.5 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-indigo-600" />}
                        Global Sync
                    </button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-2 mb-8 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="w-5 h-5 text-gray-400 absolute left-5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search by SKU or product name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-14 pr-6 py-4.5 bg-transparent text-gray-900 rounded-2xl focus:outline-none transition-all text-base font-bold placeholder:text-gray-300"
                    />
                </div>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden relative">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="pl-8 pr-6 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Listing</th>
                                <th className="px-6 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">SKU Identifier</th>
                                <th className="px-6 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Status</th>
                                <th className="px-6 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Master Stock</th>
                                <th className="pl-6 pr-8 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {isLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="pl-8 pr-6 py-6"><div className="h-5 bg-gray-100 rounded-lg w-48"></div></td>
                                        <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded-lg w-24"></div></td>
                                        <td className="px-6 py-6"><div className="h-6 bg-gray-100 rounded-full w-20 mx-auto"></div></td>
                                        <td className="px-6 py-6"><div className="h-5 bg-gray-100 rounded-lg w-12 mx-auto"></div></td>
                                        <td className="pl-6 pr-8 py-6 text-right"><div className="h-10 bg-gray-100 rounded-xl w-20 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-300">
                                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                                <Layers className="w-10 h-10 opacity-40" />
                                            </div>
                                            <p className="text-xl font-black text-gray-900">Your Inventory is quiet.</p>
                                            <p className="text-sm font-medium mt-2">Finish your shop setup to populate these records.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => {
                                    const status = getStockStatus(item.available_stock);
                                    return (
                                        <tr key={item.id} className="hover:bg-indigo-50/10 transition-colors group">
                                            <td className="pl-6 pr-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 shadow-sm overflow-hidden group-hover:border-indigo-200 transition-colors">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="w-5 h-5 group-hover:text-indigo-500 transition-colors" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 max-w-[200px] lg:max-w-sm">
                                                        <p className="text-sm font-black text-gray-900 truncate">{item.name || 'Unnamed Product'}</p>
                                                        <div className="flex items-center gap-2 mt-1 ">
                                                            {item.shopify_variant_id && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase border border-blue-100">
                                                                    <ShoppingBag className="w-2.5 h-2.5" /> Shopify
                                                                </span>
                                                            )}
                                                            {item.etsy_variant_id && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase border border-orange-100">
                                                                    <Store className="w-2.5 h-2.5" /> Etsy
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-xs font-black text-gray-500 tracking-tight bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">{item.sku || 'NO-SKU'}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-base font-black text-gray-900">{item.available_stock}</span>
                                            </td>
                                            <td className="pl-4 pr-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedItem(item);
                                                            setEditModalOpen(true);
                                                        }}
                                                        className="px-3 py-2 bg-white border border-gray-200 text-gray-700 font-bold text-[10px] rounded-lg shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-1.5 active:scale-95"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                        Update
                                                    </button>
                                                    <button
                                                        onClick={() => handleForceSync(item.id)}
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-indigo-100 rounded-lg transition-all"
                                                        title="Force re-sync"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Stock Modal */}
            <StockEditModal
                isOpen={editModalOpen}
                onClose={() => {
                    setEditModalOpen(false);
                    setSelectedItem(null);
                }}
                onConfirm={handleUpdateStock}
                item={selectedItem}
            />
        </div>
    );
}
