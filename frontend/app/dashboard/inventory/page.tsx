'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    getInventoryItems,
    forceSyncStock,
    updateInventoryStock,
    getShopifyLocations,
    bulkUpdateStock,
    updateInventoryConfig,
    type InventoryItem
} from '../../actions/inventory';
import {
    Search, Package, Layers, RefreshCw,
    AlertTriangle, Check, Loader2,
    Box, ShoppingBag, Store, Pencil, X,
    ChevronRight, History, Zap, CheckSquare, Square,
    ExternalLink
} from 'lucide-react';
import { useToast } from "@/components/ui/useToast";
import SyncProgressModal from '@/components/dashboard/SyncProgressModal';

// --- SymmetricSyncModal Component ---
interface SymmetricSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (newStock: number) => Promise<void>;
    onSaveConfig: (selectedLocationIds: string[]) => Promise<void>;
    item: InventoryItem | null;
    shopLocations: { id: string, name: string, active: boolean }[];
}

function SymmetricSyncModal({ isOpen, onClose, onConfirm, onSaveConfig, item, shopLocations }: SymmetricSyncModalProps) {
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [syncSource, setSyncSource] = useState<'shopify' | 'etsy' | 'latest' | 'manual'>('manual');
    const [manualStock, setManualStock] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (item) {
            setManualStock(item.master_stock);

            // Default select locations from product config, fallback to active shop settings
            if (item.selected_location_ids && item.selected_location_ids.length > 0) {
                setSelectedLocations(item.selected_location_ids);
            } else {
                setSelectedLocations(shopLocations.filter(l => l.active).map(l => l.id));
            }

            // Auto-detect best source if it's "Action Required"
            const sTime = item.shopify_updated_at ? new Date(item.shopify_updated_at).getTime() : 0;
            const eTime = item.etsy_updated_at ? new Date(item.etsy_updated_at).getTime() : 0;
            if (sTime > eTime) setSyncSource('shopify');
            else if (eTime > sTime) setSyncSource('etsy');
        }
    }, [item, shopLocations]);

    // Calculate live Shopify stock based on selected locations
    const liveShopifyStock = useMemo(() => {
        if (!item || !item.location_inventory_map || selectedLocations.length === 0) return 0;

        return selectedLocations.reduce((sum, locId) => {
            let qty = 0;
            const map = item.location_inventory_map;

            if (Array.isArray(map)) {
                // Handle array of objects format: [{ location_id, stock, updated_at }]
                const locData = map.find((l: any) => l.location_id === locId || l.location_id?.toString() === locId);
                if (locData && locData.stock !== undefined) {
                    qty = parseInt(locData.stock, 10) || 0;
                }
            } else if (typeof map === 'object' && map !== null) {
                // Handle key-value map format: { "locId": stock }
                const val = (map as any)[locId];
                qty = parseInt(val, 10) || 0;
            }

            return sum + qty;
        }, 0);
    }, [item, selectedLocations]);

    const isLatestShopify = useMemo(() => {
        if (!item) return true;
        const sTime = item.shopify_updated_at ? new Date(item.shopify_updated_at).getTime() : 0;
        const eTime = item.etsy_updated_at ? new Date(item.etsy_updated_at).getTime() : 0;
        if (sTime === 0 && eTime === 0) return true; // Default to Shopify
        return sTime >= eTime;
    }, [item]);

    const liveEtsyStock = item?.etsy_stock_snapshot || 0;

    const finalStockToApply = syncSource === 'shopify'
        ? liveShopifyStock
        : syncSource === 'etsy'
            ? liveEtsyStock
            : syncSource === 'latest'
                ? (isLatestShopify ? liveShopifyStock : liveEtsyStock)
                : manualStock;

    const handleConfirm = async () => {
        if (!syncSource || syncSource === 'manual') {
            // Default to highest or alert user? They should select a card.
            // But we can default to latest if none selected.
        }

        setIsSubmitting(true);
        try {
            await onConfirm(finalStockToApply);
            // User requested to NOT close modal here so they can see updated numbers.
        } finally {
            setIsSubmitting(false);
            // Reset selection visually to indicate it was applied
            setSyncSource('manual');
        }
    };

    const handleSaveConfig = async () => {
        setIsSubmitting(true);
        try {
            await onSaveConfig(selectedLocations);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !item) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                <div className="px-8 py-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 leading-none">Resolve Discrepancy</h3>
                        <p className="text-gray-400 font-bold text-xs mt-2 uppercase tracking-widest">Symmetric Stock Synchronization</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-gray-100 rounded-2xl transition-all active:scale-90">
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                <div className="px-8 py-6 overflow-hidden flex-1 flex flex-col justify-center">
                    <div className="flex flex-col md:flex-row items-stretch justify-center gap-6 relative">
                        {/* Shopify Column */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div
                                className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-md ${syncSource === 'shopify' ? 'border-blue-500 bg-blue-50/30' : 'border-gray-50 bg-gray-50/50 hover:border-blue-200'}`}
                                onClick={() => setSyncSource('shopify')}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                                            <ShoppingBag className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs font-black text-blue-600 uppercase tracking-tighter">Shopify</span>
                                    </div>
                                    {isLatestShopify && (
                                        <span className="px-2 py-0.5 bg-blue-600 text-[8px] text-white font-black rounded-full uppercase">Latest</span>
                                    )}
                                </div>

                                {isSubmitting && syncSource === 'shopify' ? (
                                    <div className="h-10 w-24 bg-gray-200 animate-pulse rounded-lg mb-1" />
                                ) : (
                                    <div className="text-4xl font-black text-gray-900 mb-1">{liveShopifyStock}</div>
                                )}
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Inventory</p>
                            </div>

                            {/* Tracked Locations */}
                            <div className="p-5 rounded-[2rem] border border-gray-100 bg-gray-50 shadow-inner flex flex-col mt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5">
                                        <Zap className="w-3 h-3 text-indigo-500" /> Tracked Locations
                                    </h4>
                                    <span className="text-[8px] font-bold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">SUMMED</span>
                                </div>
                                <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar max-h-[120px]">
                                    {shopLocations.map(loc => (
                                        <label key={loc.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${selectedLocations.includes(loc.id) ? 'border-indigo-200 bg-white shadow-sm' : 'border-gray-200/50 bg-white/50 hover:bg-white'}`}>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={selectedLocations.includes(loc.id)}
                                                onChange={() => {
                                                    setSelectedLocations(prev =>
                                                        prev.includes(loc.id) ? prev.filter(id => id !== loc.id) : [...prev, loc.id]
                                                    );
                                                    setSyncSource('shopify');
                                                }}
                                            />
                                            <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all ${selectedLocations.includes(loc.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 bg-gray-50'}`}>
                                                {selectedLocations.includes(loc.id) && <Check className="w-2.5 h-2.5 text-white" />}
                                            </div>
                                            <span className="text-[11px] font-bold text-gray-700 truncate">{loc.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Center Latest Button */}
                        <div className="hidden md:flex flex-col justify-center items-center z-10 -mx-4 absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2">
                            <button
                                onClick={() => setSyncSource(isLatestShopify ? 'shopify' : 'etsy')}
                                className="w-14 h-14 rounded-full border-[6px] border-white shadow-xl flex items-center justify-center transition-all bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 active:scale-95"
                                title="Use Latest Updated Stock"
                            >
                                <History className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Etsy Column */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div
                                className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-md h-auto flex flex-col justify-start ${syncSource === 'etsy' ? 'border-orange-500 bg-orange-50/30' : 'border-gray-50 bg-gray-50/50 hover:border-orange-200'}`}
                                onClick={() => setSyncSource('etsy')}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
                                            <Store className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs font-black text-orange-600 uppercase tracking-tighter">Etsy</span>
                                    </div>
                                    {!isLatestShopify && (
                                        <span className="px-2 py-0.5 bg-orange-600 text-[8px] text-white font-black rounded-full uppercase">Latest</span>
                                    )}
                                </div>

                                <div className="mt-2">
                                    {isSubmitting && syncSource === 'etsy' ? (
                                        <div className="h-10 w-24 bg-gray-200 animate-pulse rounded-lg mb-1" />
                                    ) : (
                                        <div className="text-4xl font-black text-gray-900 mb-1">{liveEtsyStock}</div>
                                    )}
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform Stock</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-0 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-200 transition-all active:scale-95 w-full md:w-auto"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={async () => {
                            try {
                                setIsSubmitting(true);
                                await onSaveConfig(selectedLocations);
                                await handleConfirm();
                            } finally {
                                setIsSubmitting(false);
                            }
                        }}
                        disabled={isSubmitting || syncSource === 'manual'}
                        className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Save & Sync
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Main InventoryPage Component ---
export default function InventoryPage() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [shopLocations, setShopLocations] = useState<{ id: string, name: string, active: boolean }[]>([]);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pendingBulkAction, setPendingBulkAction] = useState<'shopify' | 'etsy' | 'latest' | null>(null);

    // Sync Modal State
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [targetItem, setTargetItem] = useState<InventoryItem | null>(null);

    // Background Job State
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [syncJobId, setSyncJobId] = useState<string>('');

    useEffect(() => {
        loadData();
        loadLocations();
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

    const loadLocations = async () => {
        const locs = await getShopifyLocations();
        setShopLocations(locs);
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
        if (!targetItem) return;

        // Optimistic UI Update
        const previousItems = [...items];

        const updatedItem = {
            ...targetItem,
            master_stock: newStock,
            status: 'Matching',
            shopify_stock_snapshot: newStock,
            etsy_stock_snapshot: newStock
        };

        setItems(items.map(i => i.id === targetItem.id ? updatedItem : i));
        // Update the modal's target item reference so the modal numbers re-render instantly too
        setTargetItem(updatedItem);

        try {
            const res = await updateInventoryStock(targetItem.id, newStock);
            if (res.success) {
                toast.success(res.message);
                loadData(); // Re-fetch to ensure data consistency later
            } else {
                setItems(previousItems); // Rollback on failure
                setTargetItem(targetItem);
                toast.error(res.message);
            }
        } catch (err) {
            setItems(previousItems); // Rollback on failure
            setTargetItem(targetItem);
            toast.error('Failed to update stock');
        }
    };

    const handleSaveConfig = async (selectedLocationIds: string[]) => {
        if (!targetItem) return;

        try {
            const res = await updateInventoryConfig(targetItem.id, selectedLocationIds);
            if (res.success) {
                toast.success('Inventory configuration saved.');
                loadData();
            } else {
                toast.error(res.error || 'Failed to save configuration');
            }
        } catch (err) {
            toast.error('Failed to save configuration');
        }
    };

    const handleBulkSync = async (strategy: 'shopify' | 'etsy' | 'latest') => {
        setIsSyncing(true);
        try {
            // Using fetch to trigger background job
            const jobId = `stock_sync_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            // Note: We're sending a dummy user_id here for the job queue since /api/sync/stock requires it.
            // In a fully authenticated Next.js API route we'd extract it from the session, but we'll send a placeholder.
            const res = await fetch('/api/sync/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: jobId,
                    user_id: 'auto-stock-sync',
                    itemIds: selectedIds,
                    strategy
                })
            });

            if (res.ok) {
                setSyncJobId(jobId);
                setIsProgressModalOpen(true);
            } else {
                const errData = await res.json();
                toast.error(errData.error || 'Failed to start bulk sync');
            }
        } catch (err) {
            toast.error('Failed to start bulk sync');
        } finally {
            setIsSyncing(false);
        }
    };

    const getStockStatus = (status: string | null) => {
        if (status === 'Action Required') return { label: 'Action Required', color: 'bg-red-50 text-red-600 ring-red-500/20' };
        if (status === 'Mismatch') return { label: 'Mismatch', color: 'bg-red-50 text-red-600 ring-red-500/20' };
        return { label: 'In Sync', color: 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' };
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === items.length) setSelectedIds([]);
        else setSelectedIds(items.map(i => i.id));
    };

    return (
        <div className="w-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Inventory Control</h1>
                    <p className="text-gray-500 font-medium">Review stock discrepancies and sync across Etsy & Shopify.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleForceSync()}
                        disabled={isSyncing || isLoading}
                        className="flex items-center gap-2 px-6 py-3.5 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-indigo-600" />}
                        Fetch Latest Counts
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
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="pl-8 pr-4 py-6 w-10">
                                    <button onClick={toggleSelectAll} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                                        {selectedIds.length === items.length && items.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                                    </button>
                                </th>
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Listing</th>
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">SKU</th>
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Status</th>
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Master</th>
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Snapshots</th>
                                <th className="pl-2 pr-8 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {isLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-8 py-6"><div className="h-5 w-5 bg-gray-100 rounded"></div></td>
                                        <td className="px-4 py-6"><div className="h-5 bg-gray-100 rounded-lg w-48"></div></td>
                                        <td className="px-4 py-6"><div className="h-4 bg-gray-100 rounded-lg w-24"></div></td>
                                        <td className="px-4 py-6"><div className="h-6 bg-gray-100 rounded-full w-20 mx-auto"></div></td>
                                        <td className="px-4 py-6"><div className="h-5 bg-gray-100 rounded-lg w-12 mx-auto"></div></td>
                                        <td className="px-4 py-6"><div className="h-4 bg-gray-100 rounded-lg w-32 mx-auto"></div></td>
                                        <td className="pl-4 pr-8 py-6 text-right"><div className="h-10 bg-gray-100 rounded-xl w-20 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-24 text-center">
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
                                    const displayStatus = getStockStatus(item.status);
                                    const isSelected = selectedIds.includes(item.id);
                                    return (
                                        <tr key={item.id} className={`hover:bg-indigo-50/10 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                            <td className="pl-8 pr-4 py-4">
                                                <button onClick={() => toggleSelect(item.id)} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                                                    {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 shadow-sm overflow-hidden">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="w-5 h-5" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 max-w-[200px]">
                                                        <p className="text-sm font-black text-gray-900 truncate">{item.name || 'Unnamed Product'}</p>
                                                        <div className="flex items-center gap-2 mt-1 ">
                                                            {item.shopify_variant_id && <ShoppingBag className="w-2.5 h-2.5 text-blue-500" />}
                                                            {item.etsy_variant_id && <Store className="w-2.5 h-2.5 text-orange-500" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] font-black text-gray-500 tracking-tight bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{item.sku || 'NO-SKU'}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 ${displayStatus.color}`}>
                                                    {displayStatus.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-base font-black text-gray-900">{item.status === 'Action Required' ? '-' : item.master_stock}</span>
                                            </td>
                                            <td className="px-2 py-4 text-center">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-center gap-2 text-[10px] font-bold">
                                                        <span className="text-blue-600">S: {item.shopify_stock_snapshot}</span>
                                                        <span className="text-gray-300">|</span>
                                                        <span className="text-orange-600">E: {item.etsy_stock_snapshot}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="pl-4 pr-8 py-4 text-right">
                                                <button
                                                    onClick={() => {
                                                        setTargetItem(item);
                                                        setSyncModalOpen(true);
                                                    }}
                                                    className="px-4 py-2.5 bg-gray-900 text-white font-black text-[10px] rounded-xl shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 ml-auto uppercase tracking-widest"
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                    Sync
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

            {/* Simplified Confirmation Floating Bar */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
                    <div className="bg-gray-900/95 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-12 ring-1 ring-white/20">
                        {/* Selected Items Counter */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-indigo-500 font-bold text-sm flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                    {selectedIds.length}
                                </div>
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-400 rounded-full animate-ping"></div>
                            </div>
                            <div>
                                <p className="font-bold text-sm tracking-tight text-white/90">Selected Items</p>
                                <p className="text-gray-400 text-[11px] font-medium uppercase tracking-wider">Ready to synchronize</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    setSelectedIds([]);
                                    setPendingBulkAction(null);
                                }}
                                className="px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                            >
                                Clear
                            </button>
                            {!pendingBulkAction ? (
                                <>
                                    <button
                                        onClick={() => setPendingBulkAction('shopify')}
                                        className="px-6 py-2.5 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 font-bold text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap border border-blue-500/30"
                                    >
                                        <ShoppingBag className="w-4 h-4" />
                                        Shopify Source
                                    </button>
                                    <button
                                        onClick={() => setPendingBulkAction('etsy')}
                                        className="px-6 py-2.5 rounded-xl bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 hover:text-orange-300 font-bold text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap border border-orange-500/30"
                                    >
                                        <Store className="w-4 h-4" />
                                        Etsy Source
                                    </button>
                                    <button
                                        onClick={() => setPendingBulkAction('latest')}
                                        className="px-6 py-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 font-bold text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap border border-indigo-500/30"
                                    >
                                        <History className="w-4 h-4" />
                                        Latest Source
                                    </button>
                                </>
                            ) : (
                                <div className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Apply:</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${pendingBulkAction === 'shopify' ? 'text-blue-400' :
                                            pendingBulkAction === 'etsy' ? 'text-orange-400' :
                                                'text-indigo-400'
                                            }`}>
                                            {pendingBulkAction} source
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            handleBulkSync(pendingBulkAction);
                                            setPendingBulkAction(null);
                                        }}
                                        className="px-8 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/30 active:scale-95 whitespace-nowrap"
                                    >
                                        <Check className="w-4 h-4" />
                                        Confirm
                                    </button>
                                    <button
                                        onClick={() => setPendingBulkAction(null)}
                                        className="p-2 text-white/40 hover:text-white transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <SyncProgressModal
                isOpen={isProgressModalOpen}
                jobId={syncJobId}
                onClose={() => {
                    setIsProgressModalOpen(false);
                    loadData(); // Formally reload data after sync is fully complete
                    setSelectedIds([]);
                }}
            />

            {/* Symmetric Sync Modal */}
            <SymmetricSyncModal
                isOpen={syncModalOpen}
                onClose={() => {
                    setSyncModalOpen(false);
                    setTargetItem(null);
                }}
                onConfirm={handleUpdateStock}
                onSaveConfig={handleSaveConfig}
                item={targetItem}
                shopLocations={shopLocations}
            />
        </div>
    );
}
