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
import { useAuth } from '@/components/AuthProvider';
import { SymmetricSyncModal } from './SymmetricSyncModal';


// --- Main InventoryPage Component ---
export default function InventoryPage() {
    const { user } = useAuth();
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [platformFilter, setPlatformFilter] = useState<'all' | 'shopify' | 'etsy'>('all');
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

    // --- Filter & Sort Logic ---
    const filteredAndSortedItems = useMemo(() => {
        let result = items;

        // Platform Filter
        if (platformFilter === 'shopify') {
            result = result.filter(i => i.shopify_variant_id && !i.etsy_variant_id);
        } else if (platformFilter === 'etsy') {
            result = result.filter(i => i.etsy_variant_id && !i.shopify_variant_id);
        }

        // Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i => 
                i.sku?.toLowerCase().includes(q) || 
                i.name?.toLowerCase().includes(q)
            );
        }

        // Sort: Keep variants together by sorting by product link and then name
        return [...result].sort((a, b) => {
            const productA = a.shopify_product_id || a.etsy_listing_id || '';
            const productB = b.shopify_product_id || b.etsy_listing_id || '';
            
            if (productA !== productB) {
                // If they belong to different products, sort by product alphabetically (or group them)
                return (a.name || '').localeCompare(b.name || '');
            }
            
            // If same product, sort alphabetically by name
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [items, platformFilter, searchQuery]);

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

    const handleUpdateStock = async (newStock: number, platformsToSync: Array<'shopify' | 'etsy'> = ['shopify', 'etsy'], breakdown?: { locationId: string; allocation: number }[]) => {
        if (!targetItem) return;

        // Optimistic UI Update
        const previousItems = [...items];

        const updatedItem = {
            ...targetItem,
            master_stock: newStock,
            status: 'Matching',
            shopify_stock_snapshot: platformsToSync.includes('shopify') ? newStock : targetItem.shopify_stock_snapshot,
            etsy_stock_snapshot: platformsToSync.includes('etsy') ? newStock : targetItem.etsy_stock_snapshot
        };

        setItems(items.map(i => i.id === targetItem.id ? updatedItem : i));
        // Update the modal's target item reference so the modal numbers re-render instantly too
        setTargetItem(updatedItem);

        try {
            const res = await updateInventoryStock(targetItem.id, newStock, platformsToSync, breakdown);
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
            // Using fetch to trigger background job with a valid postgres UUID
            const jobId = crypto.randomUUID();

            // Use actual user ID instead of dummy string "auto-stock-sync"
            const res = await fetch('/api/sync/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: jobId,
                    user_id: user?.id,
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

    const getStockStatus = (item: InventoryItem) => {
        if (!item.shopify_variant_id || !item.etsy_variant_id) {
            if (item.shopify_variant_id && !item.etsy_variant_id) {
                return { label: 'Shopify Only', color: 'bg-blue-50 text-blue-600 ring-blue-500/20' };
            }
            if (item.etsy_variant_id && !item.shopify_variant_id) {
                return { label: 'Etsy Only', color: 'bg-orange-50 text-orange-600 ring-orange-500/20' };
            }
            return { label: 'Unlinked', color: 'bg-gray-50 text-gray-500 ring-gray-500/20 border-dashed' };
        }
        if (item.status === 'Action Required' || item.status === 'MISMATCH' || item.status === 'Mismatch') {
            return { label: 'Mismatch', color: 'bg-amber-50 text-amber-600 ring-amber-500/20' };
        }
        // Compare actual platform snapshots — if they differ, it's a mismatch
        if (item.shopify_stock_snapshot !== item.etsy_stock_snapshot) {
            return { label: 'Mismatch', color: 'bg-amber-50 text-amber-600 ring-amber-500/20' };
        }
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
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-2 flex-1 flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="w-5 h-5 text-gray-400 absolute left-5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by SKU or product name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-14 pr-6 py-4 bg-transparent text-gray-900 rounded-2xl focus:outline-none transition-all text-sm font-bold placeholder:text-gray-300"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex items-center gap-1 shrink-0">
                    {[
                        { id: 'all', label: 'All Listings', icon: Layers },
                        { id: 'shopify', label: 'Shopify Only', icon: ShoppingBag },
                        { id: 'etsy', label: 'Etsy Only', icon: Store },
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            onClick={() => setPlatformFilter(btn.id as any)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                                platformFilter === btn.id 
                                    ? 'bg-gray-900 text-white shadow-lg' 
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <btn.icon className={`w-3.5 h-3.5 ${platformFilter === btn.id ? 'text-indigo-400' : 'text-gray-300'}`} />
                            {btn.label}
                        </button>
                    ))}
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
                                <th className="px-2 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Links</th>
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
                            ) : filteredAndSortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-300">
                                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                                <AlertTriangle className="w-10 h-10 opacity-40" />
                                            </div>
                                            <p className="text-xl font-black text-gray-900">No matching products found.</p>
                                            <p className="text-sm font-medium mt-2">Adjust your filters or search terms.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedItems.map((item) => {
                                    const displayStatus = getStockStatus(item);
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
                                                    <div className="min-w-0 max-w-[300px]">
                                                        <p className="text-sm font-black text-gray-900 line-clamp-2 whitespace-normal leading-tight">{item.name || 'Unnamed Product'}</p>
                                                        <div className="flex items-center gap-2 mt-1.5 opacity-70">
                                                            {item.shopify_variant_id && <ShoppingBag className="w-2.5 h-2.5 text-blue-600" />}
                                                            {item.etsy_variant_id && <Store className="w-2.5 h-2.5 text-orange-600" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    {item.shopify_product_id ? (
                                                        <a href={`https://${item.shop_domain || 'admin.shopify.com'}/admin/products/${item.shopify_product_id}`} target="_blank" rel="noreferrer" title="Edit on Shopify" className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 hover:text-blue-600 transition-colors border border-blue-100 shadow-sm">
                                                            <ShoppingBag className="w-4 h-4" />
                                                        </a>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 flex items-center justify-center border border-gray-100" title="No Shopify Product Linked">
                                                            <ShoppingBag className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                    {item.etsy_listing_id ? (
                                                        <a href={`https://www.etsy.com/your/shops/me/tools/listings/${item.etsy_listing_id}`} target="_blank" rel="noreferrer" title="Edit on Etsy" className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center hover:bg-orange-100 hover:text-orange-600 transition-colors border border-orange-100 shadow-sm">
                                                            <Store className="w-4 h-4" />
                                                        </a>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 flex items-center justify-center border border-gray-100" title="No Etsy Product Linked">
                                                            <Store className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 ${displayStatus.color}`}>
                                                    {displayStatus.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-base font-black text-gray-900">{item.status === 'Action Required' ? '-' : item.master_stock}</span>
                                            </td>
                                            <td className="px-2 py-4">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="flex items-center justify-between w-[120px] bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 shadow-inner">
                                                        <div className="flex items-center gap-1.5 w-[40px]" title="Shopify Stock Snapshot">
                                                            <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                            <span className="text-[11px] font-black text-gray-900">{item.shopify_variant_id ? (item.shopify_stock_snapshot ?? 0) : '–'}</span>
                                                        </div>
                                                        <div className="w-px h-3 bg-gray-300 rounded-full shrink-0"></div>
                                                        <div className="flex items-center gap-1.5 w-[40px] flex-row-reverse" title="Etsy Stock Snapshot">
                                                            <Store className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                                            <span className="text-[11px] font-black text-gray-900 text-right w-full">{item.etsy_variant_id ? (item.etsy_stock_snapshot ?? 0) : '–'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="pl-4 pr-8 py-4 text-right">
                                                {item.shopify_variant_id && item.etsy_variant_id ? (
                                                    <button
                                                        onClick={() => {
                                                            setTargetItem(item);
                                                            setSyncModalOpen(true);
                                                        }}
                                                        className="px-4 py-2.5 bg-gray-900 text-white font-black text-[10px] rounded-xl shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 ml-auto uppercase tracking-widest"
                                                    >
                                                        <Zap className="w-3.5 h-3.5 shadow-sm shadow-indigo-500/20" />
                                                        Sync
                                                    </button>
                                                ) : (
                                                    <button
                                                        disabled
                                                        className="px-4 py-2.5 bg-gray-50 text-gray-300 font-bold text-[10px] rounded-xl border border-gray-100 ml-auto uppercase tracking-widest cursor-not-allowed flex items-center gap-2"
                                                        title="Cannot sync single-platform items"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                        Locked
                                                    </button>
                                                )}
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
