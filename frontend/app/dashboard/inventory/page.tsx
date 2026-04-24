'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    getInventoryItems,
    forceSyncStock,
    updateInventoryStock,
    getShopifyLocations,
    getShopSelectedLocationIds,
    bulkUpdateStock,
    updateInventoryConfig,
    fetchLatestCounts,
    pushMismatchStock,
    type InventoryItem
} from '../../actions/inventory';
import {
    Search, Package, Layers, RefreshCw,
    AlertTriangle, Check, Loader2,
    Box, Pencil, X,
    ChevronRight, History, Zap, CheckSquare, Square,
    ExternalLink, ChevronDown, Upload, Table2, ArrowRight, Percent
} from 'lucide-react';
import { EtsyIcon, ShopifyIcon } from '@/components/PlatformIcons';
import { useToast } from "@/components/ui/useToast";
import SyncProgressModal from '@/components/dashboard/SyncProgressModal';
import { SymmetricSyncModal } from './SymmetricSyncModal';
import { getPlanConfig, PLAN_CONFIG } from '@/config/plans';
import { getConnectedShop } from '../../actions/shop';
import { classifyInventoryState } from '@/utils/inventoryStatus';

function formatInventoryDisplayName(name?: string | null) {
    const raw = (name || '').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Unnamed Product';

    const parts = raw.split(' - ').map(part => part.trim()).filter(Boolean);
    if (parts.length <= 1) return raw;

    const deduped: string[] = [];

    for (const part of parts) {
        const lowerPart = part.toLowerCase();

        if (deduped.some(existing => existing.toLowerCase() === lowerPart)) {
            continue;
        }

        const repeatedPrefix = deduped.find(existing => lowerPart.startsWith(`${existing.toLowerCase()} `));
        if (repeatedPrefix) {
            const remainder = part.slice(repeatedPrefix.length).trim();
            if (remainder) {
                deduped.push(remainder);
            }
            continue;
        }

        deduped.push(part);
    }

    return deduped.join(' - ');
}


// --- Main InventoryPage Component ---
export default function InventoryPage() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [platformFilter, setPlatformFilter] = useState<'all' | 'shopify' | 'etsy'>('all');
    const [isSyncing, setIsSyncing] = useState(false);
    const [shopLocations, setShopLocations] = useState<{ id: string, name: string, active: boolean }[]>([]);
    const [shopSelectedLocIds, setShopSelectedLocIds] = useState<string[]>([]);
    const [shopPlanType, setShopPlanType] = useState<string | null>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Status dropdown
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);

    // Sync Modal State
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [targetItem, setTargetItem] = useState<InventoryItem | null>(null);

    // Background Job State
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [syncJobId, setSyncJobId] = useState<string>('');

    // Bulk Edit State
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [bulkEditItems, setBulkEditItems] = useState<{ id: string; item: InventoryItem; source: 'shopify' | 'etsy' | 'manual'; manualValue: number }[]>([]);
    const [bulkLocationPercents, setBulkLocationPercents] = useState<Record<string, number>>({});
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

    // Fetch / Push loading
    const [isFetchingLatest, setIsFetchingLatest] = useState(false);
    const [isPushingMismatch, setIsPushingMismatch] = useState(false);

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

    // --- Status categories ---
    const statusCategories = useMemo(() => [
        { key: 'in_sync', label: 'In Sync', color: 'bg-emerald-100 text-emerald-700' },
        { key: 'mismatch', label: 'Mismatch', color: 'bg-amber-100 text-amber-700' },
        { key: 'action_required', label: 'Action Required', color: 'bg-red-100 text-red-700' },
        { key: 'shopify_only', label: 'Shopify Only', color: 'bg-blue-100 text-blue-700' },
        { key: 'etsy_only', label: 'Etsy Only', color: 'bg-orange-100 text-orange-700' },
        { key: 'digital', label: 'Digital', color: 'bg-purple-100 text-purple-700' },
    ], []);

    const getStockState = useCallback((item: InventoryItem) => classifyInventoryState({
        isDigital: item.is_digital,
        shopifyVariantId: item.shopify_variant_id,
        etsyVariantId: item.etsy_variant_id,
        masterStock: item.master_stock,
        shopifyStock: item.shopify_stock_snapshot,
        etsyStock: item.etsy_stock_snapshot,
    }), []);

    const getItemStatusKey = useCallback((item: InventoryItem): string => {
        return getStockState(item);
    }, [getStockState]);

    // --- Filter & Sort Logic ---
    const filteredAndSortedItems = useMemo(() => {
        let result = items;

        if (platformFilter === 'shopify') {
            result = result.filter(i => i.shopify_variant_id && !i.etsy_variant_id);
        } else if (platformFilter === 'etsy') {
            result = result.filter(i => i.etsy_variant_id && !i.shopify_variant_id);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i =>
                i.sku?.toLowerCase().includes(q) ||
                i.name?.toLowerCase().includes(q)
            );
        }

        return [...result].sort((a, b) => {
            // Digital items always go to the bottom
            if (a.is_digital && !b.is_digital) return 1;
            if (!a.is_digital && b.is_digital) return -1;

            const productA = a.shopify_product_id || a.etsy_listing_id || '';
            const productB = b.shopify_product_id || b.etsy_listing_id || '';
            if (productA !== productB) {
                return (a.name || '').localeCompare(b.name || '');
            }
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [items, platformFilter, searchQuery]);

    const loadLocations = async () => {
        const locs = await getShopifyLocations();
        setShopLocations(locs);
        const selIds = await getShopSelectedLocationIds();
        setShopSelectedLocIds(selIds);
        const shop = await getConnectedShop('shopify');
        setShopPlanType(shop.plan_type || null);
    };

    const handleUpdateStock = async (newStock: number, platformsToSync: Array<'shopify' | 'etsy'> = ['shopify', 'etsy'], breakdown?: { locationId: string; allocation: number }[]) => {
        if (!targetItem) return;

        const previousItems = [...items];
        const updatedItem = {
            ...targetItem,
            master_stock: newStock,
            status: 'Matching',
            shopify_stock_snapshot: platformsToSync.includes('shopify') ? newStock : targetItem.shopify_stock_snapshot,
            etsy_stock_snapshot: platformsToSync.includes('etsy') ? newStock : targetItem.etsy_stock_snapshot
        };

        setItems(items.map(i => i.id === targetItem.id ? updatedItem : i));
        setTargetItem(updatedItem);

        try {
            const res = await updateInventoryStock(targetItem.id, newStock, platformsToSync, breakdown);
            if (res.success) {
                toast.success(res.message);
                loadData();
            } else {
                setItems(previousItems);
                setTargetItem(targetItem);
                toast.error(res.message);
            }
        } catch (err) {
            setItems(previousItems);
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

    const handleFetchLatest = async () => {
        setIsFetchingLatest(true);
        try {
            const res = await fetchLatestCounts();
            if (res.success) { toast.success(res.message); loadData(); }
            else { toast.error(res.message); }
        } catch { toast.error('Failed to fetch latest counts'); }
        finally { setIsFetchingLatest(false); }
    };

    const handlePushMismatch = async () => {
        setIsPushingMismatch(true);
        try {
            const res = await pushMismatchStock();
            if (res.success) { toast.success(res.message); loadData(); }
            else { toast.error(res.message); }
        } catch { toast.error('Failed to push mismatch stock'); }
        finally { setIsPushingMismatch(false); }
    };

    const getStockStatus = (item: InventoryItem) => {
        const state = getStockState(item);
        if (state === 'digital') return { label: 'Digital', color: 'bg-purple-50 text-purple-600 ring-purple-500/20' };
        if (state === 'shopify_only') return { label: 'Shopify Only', color: 'bg-blue-50 text-blue-600 ring-blue-500/20' };
        if (state === 'etsy_only') return { label: 'Etsy Only', color: 'bg-orange-50 text-orange-600 ring-orange-500/20' };
        if (state === 'unlinked') return { label: 'Unlinked', color: 'bg-gray-50 text-gray-500 ring-gray-500/20 border-dashed' };
        if (state === 'mismatch') return { label: 'Mismatch', color: 'bg-amber-50 text-amber-600 ring-amber-500/20' };
        if (state === 'action_required') return { label: 'Action Required', color: 'bg-red-50 text-red-600 ring-red-500/20' };
        return { label: 'In Sync', color: 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' };
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredAndSortedItems.length) setSelectedIds([]);
        else setSelectedIds(filteredAndSortedItems.map(i => i.id));
    };

    // Status dropdown: toggle-select all items of a given status
    const toggleSelectByStatus = (statusKey: string) => {
        const matchingIds = items.filter(i => getItemStatusKey(i) === statusKey).map(i => i.id);
        const allAlreadySelected = matchingIds.every(id => selectedIds.includes(id));
        if (allAlreadySelected) {
            // Deselect all of this status
            setSelectedIds(prev => prev.filter(id => !matchingIds.includes(id)));
        } else {
            // Select all of this status
            setSelectedIds(prev => [...new Set([...prev, ...matchingIds])]);
        }
    };

    // --- Bulk edit: active locations from shops table ---
    const bulkActiveLocations = useMemo(() => {
        if (shopSelectedLocIds.length === 0) return [];
        return shopLocations.filter(loc => shopSelectedLocIds.includes(loc.id));
    }, [shopLocations, shopSelectedLocIds]);

    // --- Bulk Edit Helpers ---
    const openBulkEdit = () => {
        // Exclude digital products from bulk edit
        const selectedItems = items.filter(i => selectedIds.includes(i.id) && i.shopify_variant_id && i.etsy_variant_id && !i.is_digital);
        if (selectedItems.length === 0) {
            toast.error('Please select matched, non-digital items');
            return;
        }
        setBulkEditItems(selectedItems.map(item => ({
            id: item.id,
            item,
            source: 'shopify' as const,
            manualValue: item.master_stock || 0,
        })));

        // Initialize location percents evenly across active (selected) locations
        if (bulkActiveLocations.length > 1) {
            const even = Math.floor(100 / bulkActiveLocations.length);
            const remainder = 100 - (even * bulkActiveLocations.length);
            const percents: Record<string, number> = {};
            bulkActiveLocations.forEach((loc, i) => {
                percents[loc.id] = even + (i === 0 ? remainder : 0);
            });
            setBulkLocationPercents(percents);
        } else if (bulkActiveLocations.length === 1) {
            setBulkLocationPercents({ [bulkActiveLocations[0].id]: 100 });
        }

        setShowBulkEdit(true);
    };

    const getBulkItemStock = (entry: typeof bulkEditItems[0]): number => {
        if (entry.source === 'shopify') return entry.item.shopify_stock_snapshot || 0;
        if (entry.source === 'etsy') return entry.item.etsy_stock_snapshot || 0;
        return entry.manualValue;
    };

    // Location percent auto-balance handler
    const handleBulkPercentChange = (locId: string, newVal: number) => {
        setBulkLocationPercents(prev => {
            const clamped = Math.max(0, Math.min(100, newVal));
            const newDist = { ...prev, [locId]: clamped };

            if (bulkActiveLocations.length === 2) {
                const otherLocId = bulkActiveLocations.find(l => l.id !== locId)!.id;
                newDist[otherLocId] = 100 - clamped;
            } else if (bulkActiveLocations.length > 2) {
                const otherLocs = bulkActiveLocations.filter(l => l.id !== locId);
                const currentOtherTotal = otherLocs.reduce((sum, l) => sum + (prev[l.id] || 0), 0);
                const targetOtherTotal = 100 - clamped;
                
                if (currentOtherTotal === 0) {
                    // Distribute evenly
                    const each = Math.floor(targetOtherTotal / otherLocs.length);
                    const rem = targetOtherTotal - (each * otherLocs.length);
                    otherLocs.forEach((l, i) => { newDist[l.id] = each + (i === 0 ? rem : 0); });
                } else {
                    // Scale proportionally
                    const scale = targetOtherTotal / currentOtherTotal;
                    let assigned = 0;
                    otherLocs.forEach((l, i) => {
                        if (i === otherLocs.length - 1) {
                            newDist[l.id] = Math.max(0, targetOtherTotal - assigned);
                        } else {
                            const v = Math.max(0, Math.round((prev[l.id] || 0) * scale));
                            newDist[l.id] = v;
                            assigned += v;
                        }
                    });
                }
            }

            return newDist;
        });
    };

    const handleBulkSubmit = async () => {
        setIsBulkSubmitting(true);
        try {
            let successCount = 0;
            let errorCount = 0;

            for (const entry of bulkEditItems) {
                const newStock = getBulkItemStock(entry);
                const platformsToSync: Array<'shopify' | 'etsy'> = [];

                if (entry.source === 'shopify') {
                    platformsToSync.push('etsy');
                } else {
                    platformsToSync.push('shopify', 'etsy');
                }

                let breakdown: { locationId: string; allocation: number }[] | undefined;
                if (platformsToSync.includes('shopify') && bulkActiveLocations.length > 0) {
                    breakdown = bulkActiveLocations.map(loc => ({
                        locationId: loc.id,
                        allocation: Math.round(newStock * ((bulkLocationPercents[loc.id] || 0) / 100))
                    }));
                    const totalAllocated = breakdown.reduce((s, b) => s + b.allocation, 0);
                    if (totalAllocated !== newStock && breakdown.length > 0) {
                        breakdown[0].allocation += (newStock - totalAllocated);
                    }
                }

                try {
                    const res = await updateInventoryStock(entry.id, newStock, platformsToSync, breakdown);
                    if (res.success) successCount++;
                    else errorCount++;
                } catch {
                    errorCount++;
                }
            }

            if (errorCount === 0) toast.success(`Successfully updated ${successCount} items.`);
            else toast.error(`Updated ${successCount} items, ${errorCount} failed.`);

            setShowBulkEdit(false);
            setSelectedIds([]);
            loadData();
        } catch { toast.error('Bulk update failed'); }
        finally { setIsBulkSubmitting(false); }
    };

    // --- Bulk Edit View ---
    if (showBulkEdit) {
        const needsShopifyPush = bulkEditItems.some(e => e.source !== 'shopify');
        const allSelected = bulkEditItems.length > 0;

        return (
            <div className="w-full pb-32">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1">Bulk Stock Editor</h1>
                        <p className="text-gray-400 font-medium text-sm">{bulkEditItems.length} items selected for bulk update</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Bulk source buttons */}
                        <button
                            onClick={() => setBulkEditItems(prev => prev.map(e => ({ ...e, source: 'shopify' })))}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all active:scale-95"
                        >
                            <ShopifyIcon size={14} /> All → Shopify
                        </button>
                        <button
                            onClick={() => setBulkEditItems(prev => prev.map(e => ({ ...e, source: 'etsy' })))}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 transition-all active:scale-95"
                        >
                            <EtsyIcon size={14} /> All → Etsy
                        </button>
                        <button onClick={() => setShowBulkEdit(false)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all active:scale-95">
                            <X className="w-4 h-4" /> Cancel
                        </button>
                    </div>
                </div>

                {/* Bulk Table */}
                <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Product</th>
                                    <th className="px-4 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Source</th>
                                    <th className="px-4 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Shopify</th>
                                    <th className="px-4 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Etsy</th>
                                    <th className="px-4 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Manual</th>
                                    <th className="px-4 py-5 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Final Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {bulkEditItems.map((entry, idx) => {
                                    const finalStock = getBulkItemStock(entry);
                                    return (
                                        <tr key={entry.id} className="hover:bg-indigo-50/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
                                                        {entry.item.image_url ? <img src={entry.item.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300" />}
                                                    </div>
                                                    <div className="min-w-0 max-w-[250px]">
                                                        <p className="text-xs font-black text-gray-900 truncate">{formatInventoryDisplayName(entry.item.name)}</p>
                                                        <p className="text-[10px] text-gray-400 font-bold">{entry.item.sku}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <div className={`w-2 h-2 rounded-full ${entry.source === 'shopify' ? 'bg-blue-500' : entry.source === 'etsy' ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                                                    <span className="text-[10px] font-black uppercase text-gray-500">{entry.source}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <button
                                                    onClick={() => setBulkEditItems(prev => prev.map((e, i) => i === idx ? { ...e, source: 'shopify' } : e))}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${entry.source === 'shopify' ? 'bg-blue-500 text-white shadow-md' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                                >
                                                    {entry.item.shopify_stock_snapshot}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <button
                                                    onClick={() => setBulkEditItems(prev => prev.map((e, i) => i === idx ? { ...e, source: 'etsy' } : e))}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${entry.source === 'etsy' ? 'bg-orange-500 text-white shadow-md' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
                                                >
                                                    {entry.item.etsy_stock_snapshot}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={entry.source === 'manual' ? (entry.manualValue === 0 ? '' : entry.manualValue) : ''}
                                                    placeholder="–"
                                                    onFocus={() => setBulkEditItems(prev => prev.map((e, i) => i === idx ? { ...e, source: 'manual' } : e))}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                        setBulkEditItems(prev => prev.map((en, i) => i === idx ? { ...en, source: 'manual', manualValue: isNaN(val) ? 0 : val } : en));
                                                    }}
                                                    className={`w-16 p-1.5 rounded-lg border text-center text-xs font-black outline-none transition-all ${entry.source === 'manual' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-lg font-black text-indigo-600">{finalStock}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Location Distribution - only when >1 selected locations in shop AND pushing to shopify */}
                {needsShopifyPush && bulkActiveLocations.length > 1 && (
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8 p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                <Percent className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Location Distribution</h3>
                                <p className="text-xs font-medium text-gray-400">Set percentage allocation for Shopify locations (always sums to 100%)</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bulkActiveLocations.map(loc => (
                                <div key={loc.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-gray-700 truncate">{loc.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={bulkLocationPercents[loc.id] || 0}
                                            onChange={(e) => handleBulkPercentChange(loc.id, parseInt(e.target.value) || 0)}
                                            className="w-24 accent-indigo-600 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer"
                                        />
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={bulkLocationPercents[loc.id] || 0}
                                                onChange={(e) => handleBulkPercentChange(loc.id, parseInt(e.target.value) || 0)}
                                                className="w-12 p-1 rounded-lg border border-gray-200 text-center text-xs font-black text-gray-900 bg-white outline-none focus:border-indigo-400"
                                            />
                                            <span className="text-xs font-bold text-gray-400">%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-between">
                    <button onClick={() => setShowBulkEdit(false)} className="px-6 py-3 text-gray-500 hover:text-gray-900 font-bold text-sm transition-colors">
                        ← Back to Inventory
                    </button>
                    <button
                        onClick={handleBulkSubmit}
                        disabled={isBulkSubmitting}
                        className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl flex items-center gap-3 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                    >
                        {isBulkSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                        ) : (
                            <><Upload className="w-4 h-4" /> Apply to {bulkEditItems.length} Items</>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Inventory Control</h1>
                    <p className="text-gray-500 font-medium">Review stock discrepancies and sync across Etsy & Shopify.</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={openBulkEdit}
                        disabled={selectedIds.length === 0}
                        className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm shadow-sm active:scale-95 transition-all ${
                            selectedIds.length > 0
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                : 'bg-gray-100 text-gray-300 border-2 border-gray-100 cursor-not-allowed'
                        }`}
                    >
                        <Table2 className="w-4 h-4" />
                        Bulk Edit{selectedIds.length > 0 && ` (${selectedIds.length})`}
                    </button>
                    <button
                        onClick={handlePushMismatch}
                        disabled={isPushingMismatch || isLoading}
                        className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-2 border-amber-100 text-amber-700 rounded-2xl font-bold text-sm shadow-sm hover:bg-amber-100 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isPushingMismatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Push Mismatches
                    </button>
                    <button
                        onClick={handleFetchLatest}
                        disabled={isFetchingLatest || isLoading}
                        className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold text-sm shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isFetchingLatest ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-indigo-600" />}
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
                    <button
                        onClick={() => setPlatformFilter('all')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                            platformFilter === 'all'
                                ? 'bg-gray-900 text-white shadow-lg'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <Layers className={`w-3.5 h-3.5 ${platformFilter === 'all' ? 'text-indigo-400' : 'text-gray-300'}`} />
                        All Listings
                    </button>
                    <button
                        onClick={() => setPlatformFilter('shopify')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                            platformFilter === 'shopify'
                                ? 'bg-gray-900 text-white shadow-lg'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <ShopifyIcon size={14} />
                        Shopify Only
                    </button>
                    <button
                        onClick={() => setPlatformFilter('etsy')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                            platformFilter === 'etsy'
                                ? 'bg-gray-900 text-white shadow-lg'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <EtsyIcon size={14} />
                        Etsy Only
                    </button>
                </div>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden relative">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="pl-8 pr-2 py-6 w-10">
                                    <div className="flex items-center gap-1">
                                        <button onClick={toggleSelectAll} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                                            {selectedIds.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                                        </button>
                                        {/* Status-based bulk select dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                                                className={`p-1 rounded-md hover:bg-gray-100 transition-colors ${selectedIds.length > 0 ? 'text-indigo-600' : 'text-gray-300'}`}
                                                title="Select by status"
                                            >
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                            {showStatusDropdown && (
                                                <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 z-50 min-w-[220px] animate-in fade-in zoom-in-95 duration-200">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Select by Status</p>
                                                    {statusCategories.map(cat => {
                                                        const matchingIds = items.filter(i => getItemStatusKey(i) === cat.key).map(i => i.id);
                                                        const count = matchingIds.length;
                                                        const allSelected = count > 0 && matchingIds.every(id => selectedIds.includes(id));
                                                        return (
                                                            <button
                                                                key={cat.key}
                                                                onClick={() => toggleSelectByStatus(cat.key)}
                                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all mb-1 ${allSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-all ${allSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                                                        {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                                                    </div>
                                                                    {cat.label}
                                                                </div>
                                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${cat.color}`}>{count}</span>
                                                            </button>
                                                        );
                                                    })}
                                                    <hr className="my-2 border-gray-100" />
                                                    <button
                                                        onClick={() => { setSelectedIds([]); setShowStatusDropdown(false); }}
                                                        className="w-full px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 transition-all"
                                                    >
                                                        Clear all selections
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
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
                                                        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5" />}
                                                    </div>
                                                    <div className="min-w-0 max-w-[300px]">
                                                        <p className="text-sm font-black text-gray-900 line-clamp-2 whitespace-normal leading-tight">{formatInventoryDisplayName(item.name)}</p>
                                                        <div className="flex items-center gap-2 mt-1.5 opacity-70">
                                                            {item.shopify_variant_id && <ShopifyIcon size={10} />}
                                                            {item.etsy_variant_id && <EtsyIcon size={10} />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    {item.shopify_product_id ? (
                                                        <a href={`https://${item.shop_domain || 'admin.shopify.com'}/admin/products/${item.shopify_product_id}`} target="_blank" rel="noreferrer" title="Edit on Shopify" className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 hover:text-blue-600 transition-colors border border-blue-100 shadow-sm">
                                                            <ShopifyIcon size={16} />
                                                        </a>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 flex items-center justify-center border border-gray-100"><ShopifyIcon size={16} /></div>
                                                    )}
                                                    {item.etsy_listing_id ? (
                                                        <a href={`https://www.etsy.com/your/shops/me/tools/listings/${item.etsy_listing_id}`} target="_blank" rel="noreferrer" title="Edit on Etsy" className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center hover:bg-orange-100 hover:text-orange-600 transition-colors border border-orange-100 shadow-sm">
                                                            <EtsyIcon size={16} />
                                                        </a>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 flex items-center justify-center border border-gray-100"><EtsyIcon size={16} /></div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 ${displayStatus.color}`}>
                                                    {displayStatus.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className="text-base font-black text-gray-900">{item.is_digital ? '∞' : (getItemStatusKey(item) === 'action_required' ? '-' : item.master_stock)}</span>
                                            </td>
                                            <td className="px-2 py-4">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="flex items-center justify-between w-[120px] bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200 shadow-inner">
                                                        <div className="flex items-center gap-1.5 w-[40px]" title="Shopify Stock Snapshot">
                                                            <ShopifyIcon size={14} />
                                                            <span className="text-[11px] font-black text-gray-900">{item.shopify_variant_id ? (item.shopify_stock_snapshot ?? 0) : '–'}</span>
                                                        </div>
                                                        <div className="w-px h-3 bg-gray-300 rounded-full shrink-0"></div>
                                                        <div className="flex items-center gap-1.5 w-[40px] flex-row-reverse" title="Etsy Stock Snapshot">
                                                            <EtsyIcon size={14} />
                                                            <span className="text-[11px] font-black text-gray-900 text-right w-full">{item.etsy_variant_id ? (item.etsy_stock_snapshot ?? 0) : '–'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="pl-4 pr-8 py-4 text-right">
                                                {item.is_digital ? (
                                                    <button disabled className="px-4 py-2.5 bg-purple-50 text-purple-400 font-bold text-[10px] rounded-xl border border-purple-100 ml-auto uppercase tracking-widest cursor-not-allowed flex items-center gap-2">
                                                        <Package className="w-3.5 h-3.5" /> Digital
                                                    </button>
                                                ) : item.shopify_variant_id && item.etsy_variant_id ? (
                                                    <button
                                                        onClick={() => { setTargetItem(item); setSyncModalOpen(true); }}
                                                        className="px-4 py-2.5 bg-gray-900 text-white font-black text-[10px] rounded-xl shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 ml-auto uppercase tracking-widest"
                                                    >
                                                        {getItemStatusKey(item) === 'action_required' ? (
                                                            <>
                                                                <AlertTriangle className="w-3.5 h-3.5" /> Manage
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Zap className="w-3.5 h-3.5" /> Manage
                                                            </>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <button disabled className="px-4 py-2.5 bg-gray-50 text-gray-300 font-bold text-[10px] rounded-xl border border-gray-100 ml-auto uppercase tracking-widest cursor-not-allowed flex items-center gap-2">
                                                        <X className="w-3.5 h-3.5" /> Locked
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

            {/* Modals */}
            <SyncProgressModal
                isOpen={isProgressModalOpen}
                jobId={syncJobId}
                onClose={() => { setIsProgressModalOpen(false); loadData(); setSelectedIds([]); }}
            />

            <SymmetricSyncModal
                isOpen={syncModalOpen}
                onClose={() => { setSyncModalOpen(false); setTargetItem(null); }}
                onConfirm={handleUpdateStock}
                onSaveConfig={handleSaveConfig}
                item={targetItem}
                shopLocations={shopLocations}
                allowedLocationIds={shopSelectedLocIds}
                maxTrackedLocations={(getPlanConfig(shopPlanType) || PLAN_CONFIG.starter).limits.maxTrackedLocations}
            />

            {/* Click outside to close dropdown */}
            {showStatusDropdown && (
                <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
            )}
        </div>
    );
}
