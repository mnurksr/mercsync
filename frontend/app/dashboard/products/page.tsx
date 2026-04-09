'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPlatformListings, getInventoryStats, getUserId, type ListingItem } from '../../actions/inventory';
import { getConnectedShop } from '../../actions/shop';
import { getSettings } from '../../actions/settings';
import { deleteProduct, unmatchProduct } from '../../actions/matching';
import {
    Search, Package, Box, Filter,
    Loader2, ShoppingBag, Store, AlertTriangle,
    ChevronDown, ChevronRight, CheckSquare, Square, Check, X, Copy, Pencil, RefreshCw,
    Archive, FileText, AlertCircle, Link2, Unlink, Trash2, ExternalLink
} from 'lucide-react';
import { useToast } from "@/components/ui/useToast";
import { useAuth } from '@/components/AuthProvider';
import CloneModal, { type CrossListingItem, type CloneSourceData } from '@/components/dashboard/CloneModal';
import SyncProgressModal from '@/components/dashboard/SyncProgressModal';
import MatchModal from '@/components/dashboard/MatchModal';

export default function ProductsPage() {
    const toast = useToast();
    const router = useRouter();
    const { user, supabase } = useAuth();
    const [activePlatform, setActivePlatform] = useState<'shopify' | 'etsy'>('shopify');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [items, setItems] = useState<ListingItem[]>([]);
    const [stats, setStats] = useState({ total: 0, unmatched: 0, outOfStock: 0 });

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // Queuing State
    const [crossListing, setCrossListing] = useState<{ to_shopify: CrossListingItem[], to_etsy: CrossListingItem[] }>({ to_shopify: [], to_etsy: [] });
    const [cloneModal, setCloneModal] = useState<{
        isOpen: boolean;
        sourceData: CloneSourceData | null;
        targetPlatform: 'shopify' | 'etsy';
        initialData?: CrossListingItem;
        targetId?: string;
    }>({
        isOpen: false,
        sourceData: null,
        targetPlatform: 'shopify'
    });

    const [syncJobId, setSyncJobId] = useState<string | null>(null);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    
    // Shop Metadata
    const [shopCurrencies, setShopCurrencies] = useState<{ shopify: string, etsy: string }>({ shopify: 'USD', etsy: 'USD' });
    const [pricingRules, setPricingRules] = useState<any[]>([]);

    // Import Modal
    const [showImportModal, setShowImportModal] = useState(false);
    const [shopifyFilters, setShopifyFilters] = useState<string[]>(['active']);
    const [etsyFilters, setEtsyFilters] = useState<string[]>(['active']);

    // Match Modal
    const [matchModal, setMatchModal] = useState<{ isOpen: boolean; product: ListingItem | null }>({
        isOpen: false, product: null
    });

    // Delete Confirmation
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; product: ListingItem | null; isDeleting: boolean }>({
        isOpen: false, product: null, isDeleting: false
    });

    // Bulk Actions Dropdown
    const [bulkActionsOpen, setBulkActionsOpen] = useState(false);

    // Bulk Operation State
    const [bulkOp, setBulkOp] = useState<{
        pending: 'unmatch' | 'delete' | null;
        running: boolean;
        progress: number;
        total: number;
    }>({ pending: null, running: false, progress: 0, total: 0 });

    const toggleFilter = (platform: 'shopify' | 'etsy', filter: string) => {
        if (platform === 'shopify') {
            setShopifyFilters(prev => prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]);
        } else {
            setEtsyFilters(prev => prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]);
        }
    };

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
        setSelectedItems(new Set()); // Reset selections on reload
        try {
            const [itemList, statsData] = await Promise.all([
                getPlatformListings(activePlatform, searchQuery || undefined),
                getInventoryStats(activePlatform)
            ]);

            setItems(itemList);
            setStats(statsData);

            // Fetch price rules via server action (handles auth properly in Shopify embed)
            try {
                const savedSettings = await getSettings();
                if (savedSettings.price_rules && savedSettings.price_rules.length > 0) {
                    setPricingRules(savedSettings.price_rules);
                }
            } catch (settingsErr) {
                console.warn('ProductsPage: Failed to load price rules from settings', settingsErr);
            }
        } catch (error) {
            console.error('Failed to load listings:', error);
            toast.error('Failed to load products.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReimport = async () => {
        setShowImportModal(false);
        setIsImporting(true);
        toast.info('Starting fresh import from stores, please do not close the page...');
        try {
            const activeUserId = await getUserId();
            if (!activeUserId) throw new Error('Not authenticated');

            const shopInfo = await getConnectedShop('shopify');
            if (!shopInfo.connected || !shopInfo.shop_domain) throw new Error('Shop configuration not found');

            const etsyInfo = await getConnectedShop('etsy');

            if (shopifyFilters.length === 0 && etsyFilters.length === 0) {
                toast.warning('Please select at least one product type to import.');
                setIsImporting(false);
                return;
            }

            const importPromises = [];

            if (shopifyFilters.length > 0) {
                importPromises.push(
                    fetch('/api/sync/shopify-import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ownerId: activeUserId, options: { shopify: shopifyFilters } })
                    })
                );
            }

            if (etsyInfo.connected && etsyInfo.shop_domain && etsyFilters.length > 0) {
                importPromises.push(
                    fetch('/api/sync/etsy-import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ owner_id: activeUserId, shop_domain: etsyInfo.shop_domain, filters: etsyFilters })
                    })
                );
            }

            if (importPromises.length === 0) {
                toast.warning('No stores available to import from.');
                setIsImporting(false);
                return;
            }

            const responses = await Promise.all(importPromises);
            if (!responses.every(r => r.ok)) {
                throw new Error('One or more store imports failed. Please check your connections.');
            }

            toast.success('Successfully imported base data. Redirecting to matching interface...');
            setTimeout(() => {
                router.push('/staging');
            }, 1500);
        } catch (e: any) {
            console.error('Re-import error:', e);
            toast.error(e.message || 'Failed to trigger import');
        } finally {
            setIsImporting(false);
        }
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedRows(newSet);
    };

    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedItems(newSet);
    };

    const toggleAllSelection = () => {
        if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(i => i.id)));
        }
    };

    const toggleFilterChip = (key: string) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const filteredItems = items.filter(item => {
        if (activeFilters.size === 0) return true;
        const checks: boolean[] = [];
        if (activeFilters.has('unmatched')) checks.push(item.matchStatus === 'unmatched' || item.matchStatus === 'partially_matched');
        if (activeFilters.has('synced')) checks.push(item.matchStatus === 'synced');
        // Platform status filters
        const statusFilters = Array.from(activeFilters).filter(f => !['unmatched', 'synced'].includes(f));
        if (statusFilters.length > 0) checks.push(statusFilters.includes(item.platformStatus.toLowerCase()));
        return checks.some(Boolean);
    });

    const isItemQueued = (sourceId: string) => {
        return crossListing.to_shopify.some(i => i.source_id === sourceId) ||
            crossListing.to_etsy.some(i => i.source_id === sourceId);
    };

    const getQueuedItem = (sourceId: string) => {
        return crossListing.to_shopify.find(i => i.source_id === sourceId) ||
            crossListing.to_etsy.find(i => i.source_id === sourceId);
    };

    const handleCloneClick = (item: ListingItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        const sourcePlatform = activePlatform;
        const targetPlatform = sourcePlatform === 'shopify' ? 'etsy' : 'shopify';
        const listKey = targetPlatform === 'shopify' ? 'to_shopify' : 'to_etsy';

        const existing = crossListing[listKey].find(i => i.source_id === item.id);

        const sourceData: CloneSourceData = {
            title: item.title,
            platform: sourcePlatform,
            sourceId: item.id,
            imageUrl: item.imageUrl || '',
            sku: item.variants?.[0]?.sku || '',
            price: item.variants?.[0]?.price || 0,
            stock: item.totalStock,
            description: item.description || '', // Now populated from staging table
            variants: item.variants.map(v => ({
                platformId: v.shopifyVariantId || v.id, // Ensure we use 47... if available
                variantTitle: v.title,
                sku: v.sku || '',
                price: v.price,
                stockQuantity: v.stock
            }))
        };

        setCloneModal({
            isOpen: true,
            sourceData,
            targetPlatform,
            initialData: existing,
            targetId: item.id // Use listing ID as target parent hint if potentially matched
        });
    };

    const handleCloneConfirm = (data: CrossListingItem) => {
        const listKey = cloneModal.targetPlatform === 'shopify' ? 'to_shopify' : 'to_etsy';

        setCrossListing(prev => {
            const newList = [...prev[listKey]];
            const idx = newList.findIndex(i => i.source_id === data.source_id);

            if (idx > -1) {
                newList[idx] = data;
            } else {
                newList.push(data);
            }

            return { ...prev, [listKey]: newList };
        });

        setCloneModal({ isOpen: false, sourceData: null, targetPlatform: 'shopify' });
        toast.success(`${data.title} added to clone queue.`);
    };

    const saveChanges = async () => {
        setIsSaving(true);
        try {
            // Robust auth check: Use server action getUserId() to bypass iframe cookie issues
            const currentUserId = await getUserId();

            if (!currentUserId) {
                toast.error("Please login to sync (Session not found).");
                return;
            }

            const job_id = crypto.randomUUID();
            const payload = {
                user_id: currentUserId,
                job_id,
                initial_state: { matched_inventory: [], unmatched_inventory: [] },
                final_state: {
                    matched_inventory: [],
                    queued_clones: crossListing
                },
                timestamp: new Date().toISOString()
            };

            const res = await fetch('/api/sync/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to start sync');

            setSyncJobId(job_id);
            setIsProgressModalOpen(true);
        } catch (err) {
            console.error('Save error:', err);
            toast.error("Failed to start synchronization.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleBulkClone = () => {
        const selectedListings = filteredItems.filter(i => selectedItems.has(i.id) && i.matchStatus !== 'synced');
        if (selectedListings.length === 0) return;

        const targetPlatform = activePlatform === 'shopify' ? 'etsy' : 'shopify';
        // For bulk, we'll apply the default rule for the target platform if it exists
        const defaultRule = pricingRules.find(r => r.platform === targetPlatform);

        setCrossListing(prev => {
            const listKey = targetPlatform === 'shopify' ? 'to_shopify' : 'to_etsy';
            const newList = [...prev[listKey]];

            selectedListings.forEach(item => {
                if (!newList.some(i => i.source_id === item.id)) {
                    newList.push({
                        source_id: item.id,
                        title: item.title,
                        sku: item.variants?.[0]?.sku || '',
                        price: item.variants?.[0]?.price || 0,
                        stock: item.totalStock,
                        image: item.imageUrl || '',
                        variants: item.variants.map(v => ({
                            source_variant_id: v.shopifyVariantId || v.id, // Ensure we use 47... if available
                            title: v.title,
                            sku: v.sku || '',
                            price: v.price,
                            stock: v.stock,
                            selected: true
                        })),
                        price_rule: defaultRule || null
                    });
                }
            });

            return { ...prev, [listKey]: newList };
        });

        toast.success(`Added ${selectedListings.length} items to clone queue with ${defaultRule ? 'dynamic pricing' : 'default pricing'}.`);
        setSelectedItems(new Set());
    };

    // Bulk Unmatch: Stage for confirmation (no window.confirm)
    const handleBulkUnmatch = () => {
        const selected = filteredItems.filter(i => selectedItems.has(i.id));
        if (selected.some(i => i.matchStatus !== 'synced')) return;
        setBulkOp({ pending: 'unmatch', running: false, progress: 0, total: selected.length });
    };

    // Bulk Delete: Stage for confirmation (no window.confirm)
    const handleBulkDelete = () => {
        const selected = filteredItems.filter(i => selectedItems.has(i.id));
        if (selected.length === 0) return;
        setBulkOp({ pending: 'delete', running: false, progress: 0, total: selected.length });
    };

    // Execute confirmed bulk operation
    const executeBulkOp = async () => {
        const selected = filteredItems.filter(i => selectedItems.has(i.id));
        if (!bulkOp.pending || selected.length === 0) return;

        setBulkOp(prev => ({ ...prev, running: true, progress: 0, total: selected.length }));
        let successCount = 0;

        for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            try {
                if (bulkOp.pending === 'unmatch') {
                    const res = await unmatchProduct(activePlatform, item.id);
                    if (res.success) successCount++;
                } else if (bulkOp.pending === 'delete') {
                    const res = await deleteProduct(activePlatform, item.id);
                    if (res.success) successCount++;
                }
            } catch { /* skip */ }
            setBulkOp(prev => ({ ...prev, progress: i + 1 }));
        }

        const label = bulkOp.pending === 'unmatch' ? 'Unmatched' : 'Removed';
        toast.success(`${label} ${successCount} of ${selected.length} products.`);
        setBulkOp({ pending: null, running: false, progress: 0, total: 0 });
        setSelectedItems(new Set());
        loadData();
    };

    // Selection Analysis: compute what bulk actions are available
    const selectedList = filteredItems.filter(i => selectedItems.has(i.id));
    const allSelectedSynced = selectedList.length > 0 && selectedList.every(i => i.matchStatus === 'synced');
    const allSelectedUnmatched = selectedList.length > 0 && selectedList.every(i => i.matchStatus !== 'synced');

    const getMatchStatusBadge = (status: string) => {
        switch (status) {
            case 'synced':
                return <span className="px-2.5 py-1 bg-green-50 text-green-700 ring-1 ring-green-600/20 rounded-md text-[10px] font-bold uppercase tracking-wider">Synced</span>;
            case 'partially_matched':
                return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 rounded-md text-[10px] font-bold uppercase tracking-wider">Partial Match</span>;
            case 'unmatched':
                return <span className="px-2.5 py-1 bg-red-50 text-red-700 ring-1 ring-red-600/20 rounded-md text-[10px] font-bold uppercase tracking-wider">Unmatched</span>;
            default:
                return null;
        }
    };

    const getPlatformStatusBadge = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'active') return <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Active</span>;
        if (s === 'draft') return <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>Draft</span>;
        return <span className="text-xs font-semibold text-gray-500 capitalize">{status}</span>;
    };

    const totalQueued = crossListing.to_shopify.length + crossListing.to_etsy.length;

    return (
        <div className="max-w-6xl mx-auto w-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Catalog</h1>
                    <p className="text-gray-500">View your products, their status, and variant mappings.</p>
                </div>

                {/* Platform Toggle */}
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                    <button
                        onClick={() => setShowImportModal(true)}
                        disabled={isImporting || isLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300 rounded-xl text-sm font-semibold shadow-sm transition-all animate-in fade-in"
                        title="Re-sync products from your stores"
                    >
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <RefreshCw className="w-4 h-4" />}
                        Re-Sync
                    </button>

                    {selectedItems.size > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setBulkActionsOpen(!bulkActionsOpen)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl shadow-lg text-sm font-semibold hover:bg-gray-800 transition-all"
                            >
                                <CheckSquare className="w-4 h-4" />
                                {selectedItems.size} selected
                                <ChevronDown className={`w-4 h-4 transition-transform ${bulkActionsOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {bulkActionsOpen && (
                                <>
                                    {/* Backdrop */}
                                    <div className="fixed inset-0 z-40" onClick={() => setBulkActionsOpen(false)}></div>
                                    {/* Dropdown */}
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                                        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                            Bulk Actions
                                        </div>

                                        {/* Clone All */}
                                        <button
                                            onClick={() => { handleBulkClone(); setBulkActionsOpen(false); }}
                                            disabled={!allSelectedUnmatched}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${allSelectedUnmatched
                                                ? 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
                                                : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                        >
                                            <Copy className="w-4 h-4 shrink-0" />
                                            <div>
                                                <div className="font-semibold">Clone All</div>
                                                <div className="text-[10px] text-gray-400">Add to clone queue</div>
                                            </div>
                                        </button>

                                        {/* Unmatch All */}
                                        <button
                                            onClick={() => { handleBulkUnmatch(); setBulkActionsOpen(false); }}
                                            disabled={!allSelectedSynced}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${allSelectedSynced
                                                ? 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'
                                                : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                        >
                                            <Unlink className="w-4 h-4 shrink-0" />
                                            <div>
                                                <div className="font-semibold">Unmatch All</div>
                                                <div className="text-[10px] text-gray-400">Break all cross-platform links</div>
                                            </div>
                                        </button>

                                        <div className="border-t border-gray-100"></div>

                                        {/* Delete All */}
                                        <button
                                            onClick={() => { handleBulkDelete(); setBulkActionsOpen(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4 shrink-0" />
                                            <div>
                                                <div className="font-semibold">Delete All</div>
                                                <div className="text-[10px] text-gray-400">Remove from MercSync tracking</div>
                                            </div>
                                        </button>

                                        <div className="border-t border-gray-100"></div>

                                        {/* Clear Selection */}
                                        <button
                                            onClick={() => { setSelectedItems(new Set()); setBulkActionsOpen(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-500 hover:bg-gray-50 transition-colors"
                                        >
                                            <X className="w-4 h-4 shrink-0" />
                                            <span className="font-medium">Clear Selection</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

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
            </div>

            {/* KPI Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                        <p className="text-sm font-medium text-gray-500">Unmatched / Partial</p>
                        <p className="text-2xl font-bold text-gray-900">{isLoading ? <span className="animate-pulse">...</span> : stats.unmatched}</p>
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
                <div className="relative">
                    <button
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all ${activeFilters.size > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-white'}`}
                    >
                        <Filter className="w-4 h-4" />
                        {activeFilters.size > 0 ? `${activeFilters.size} Filter${activeFilters.size > 1 ? 's' : ''}` : 'Filters'}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilterPanel ? 'rotate-180' : ''}`} />
                    </button>

                    {showFilterPanel && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Match Status</span>
                                {activeFilters.size > 0 && <button onClick={() => setActiveFilters(new Set())} className="text-[10px] font-medium text-indigo-600 hover:underline">Clear all</button>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[{ key: 'unmatched', label: 'Unmatched' }, { key: 'synced', label: 'Synced' }].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => toggleFilterChip(f.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeFilters.has(f.key) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        {activeFilters.has(f.key) && <Check className="w-3 h-3 inline mr-1" />}{f.label}
                                    </button>
                                ))}
                            </div>

                            <div className="border-t border-gray-100 pt-3">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Platform Status</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(activePlatform === 'shopify'
                                    ? [{ key: 'active', label: 'Active' }, { key: 'draft', label: 'Draft' }, { key: 'archived', label: 'Archived' }]
                                    : [{ key: 'active', label: 'Active' }, { key: 'draft', label: 'Draft' }, { key: 'expired', label: 'Expired' }, { key: 'inactive', label: 'Inactive' }]
                                ).map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => toggleFilterChip(f.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeFilters.has(f.key) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        {activeFilters.has(f.key) && <Check className="w-3 h-3 inline mr-1" />}{f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-4 py-4 w-12 text-center">
                                    <button
                                        onClick={toggleAllSelection}
                                        className="text-gray-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {selectedItems.size > 0 && selectedItems.size === filteredItems.length ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
                                    </button>
                                </th>
                                <th className="px-2 py-4 w-10"></th>
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Match Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                // Skeleton loading rows
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-4"><div className="w-5 h-5 bg-gray-200 rounded"></div></td>
                                        <td className="px-2 py-4"><div className="w-4 h-4 bg-gray-200 rounded"></div></td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                                                <div className="h-4 bg-gray-200 rounded w-48"></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 rounded-full"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-12 bg-gray-200 rounded"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 w-24 bg-gray-200 rounded inline-block"></div></td>
                                    </tr>
                                ))
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-gray-500 bg-white">
                                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                                            <div className="w-16 h-16 bg-gray-50 flex items-center justify-center rounded-2xl mb-4 border border-gray-100 shadow-sm">
                                                <Package className="w-8 h-8 text-gray-400" />
                                            </div>
                                            {stats.total === 0 ? (
                                                <>
                                                    <p className="text-xl font-bold text-gray-900 mb-2">No Products in Database</p>
                                                    <p className="text-sm text-gray-500 mb-8 max-w-xs text-center">It looks like your staging database is empty. You need to fetch products from your connected stores to get started.</p>
                                                    <button 
                                                        onClick={() => setShowImportModal(true)} 
                                                        disabled={isImporting} 
                                                        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                                                    >
                                                        {isImporting ? <Loader2 className="w-5 h-5 animate-spin"/> : <RefreshCw className="w-5 h-5" />}
                                                        {isImporting ? 'Fetching...' : 'Fetch Store Products'}
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-lg font-bold text-gray-900 mb-1">No products found</p>
                                                    <p className="text-sm">Try adjusting your search or platform view filter.</p>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item) => {
                                    const isExpanded = expandedRows.has(item.id);
                                    const isSelected = selectedItems.has(item.id);
                                    const queuedItem = getQueuedItem(item.id);
                                    const isQueued = !!queuedItem;

                                    return (
                                        <React.Fragment key={item.id}>
                                            <tr
                                                onClick={() => toggleRow(item.id)}
                                                className={`group transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50/30' : 'hover:bg-gray-50/50'}`}
                                            >
                                                <td className="px-4 py-4 w-12 text-center" onClick={(e) => toggleSelection(item.id, e)}>
                                                    {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                                                </td>
                                                <td className="px-2 py-4 w-10 text-gray-400">
                                                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200/50 shadow-sm flex items-center justify-center">
                                                            {item.imageUrl ? (
                                                                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1 break-all pr-4">
                                                                {isQueued ? queuedItem.title : item.title}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[11px] font-semibold text-gray-500">{item.variantsCount} VARIANTS</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {getPlatformStatusBadge(item.platformStatus)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {getMatchStatusBadge(item.matchStatus)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
                                                        {item.variants?.[0]?.sku || 'NO-SKU'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="grid grid-cols-2 gap-1 w-[220px] ml-auto" onClick={(e) => e.stopPropagation()}>
                                                        {/* Row 1, Col 1: Current platform link (always exists) */}
                                                        {activePlatform === 'shopify' ? (
                                                            <a
                                                                href={`https://${item.shopDomain}/admin/products/${item.variants[0]?.shopifyProductId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 rounded-md text-blue-600 transition-all text-[10px] font-medium"
                                                            >
                                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                                                View in Shopify
                                                            </a>
                                                        ) : (
                                                            <a
                                                                href={`https://www.etsy.com/your/listings/${item.variants[0]?.etsyListingId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-orange-50 hover:border-orange-200 rounded-md text-orange-600 transition-all text-[10px] font-medium"
                                                            >
                                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                                                View in Etsy
                                                            </a>
                                                        )}

                                                        {/* Row 1, Col 2: Other platform link (or placeholder if unmatched) */}
                                                        {activePlatform === 'shopify' ? (
                                                            item.variants[0]?.etsyListingId ? (
                                                                <a
                                                                    href={`https://www.etsy.com/your/listings/${item.variants[0].etsyListingId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-orange-50 hover:border-orange-200 rounded-md text-orange-600 transition-all text-[10px] font-medium"
                                                                >
                                                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                                                    View in Etsy
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setDeleteConfirm({ isOpen: true, product: item, isDeleting: false })}
                                                                    className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 rounded-md text-gray-400 transition-all text-[10px] font-medium"
                                                                >
                                                                    <Trash2 className="w-3 h-3 shrink-0" />
                                                                    Delete
                                                                </button>
                                                            )
                                                        ) : (
                                                            item.variants[0]?.shopifyProductId ? (
                                                                <a
                                                                    href={`https://${item.shopDomain}/admin/products/${item.variants[0].shopifyProductId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 rounded-md text-blue-600 transition-all text-[10px] font-medium"
                                                                >
                                                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                                                    View in Shopify
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setDeleteConfirm({ isOpen: true, product: item, isDeleting: false })}
                                                                    className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 rounded-md text-gray-400 transition-all text-[10px] font-medium"
                                                                >
                                                                    <Trash2 className="w-3 h-3 shrink-0" />
                                                                    Delete
                                                                </button>
                                                            )
                                                        )}

                                                        {/* Row 2, Col 1: Match / Unmatch */}
                                                        <button
                                                            onClick={() => setMatchModal({ isOpen: true, product: item })}
                                                            className={`inline-flex items-center justify-center gap-1 h-7 border rounded-md transition-all text-[10px] font-semibold ${item.matchStatus === 'synced'
                                                                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                                }`}
                                                        >
                                                            {item.matchStatus === 'synced' ? (
                                                                <><Unlink className="w-3 h-3 shrink-0" /> Unmatch</>
                                                            ) : (
                                                                <><Link2 className="w-3 h-3 shrink-0" /> Match</>
                                                            )}
                                                        </button>

                                                        {/* Row 2, Col 2: Clone / Edit Queue / Delete */}
                                                        {isQueued ? (
                                                            <button
                                                                onClick={() => handleCloneClick(item, { stopPropagation: () => {} } as any)}
                                                                className="inline-flex items-center justify-center gap-1 h-7 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-all text-[10px] font-semibold"
                                                            >
                                                                <Pencil className="w-3 h-3 shrink-0" />
                                                                Edit Queue
                                                            </button>
                                                        ) : item.matchStatus === 'synced' ? (
                                                            <button
                                                                onClick={() => setDeleteConfirm({ isOpen: true, product: item, isDeleting: false })}
                                                                className="inline-flex items-center justify-center gap-1 h-7 border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 rounded-md text-gray-500 transition-all text-[10px] font-medium"
                                                            >
                                                                <Trash2 className="w-3 h-3 shrink-0" />
                                                                Delete
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleCloneClick(item, { stopPropagation: () => {} } as any)}
                                                                className="inline-flex items-center justify-center gap-1 h-7 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-all text-[10px] font-semibold"
                                                            >
                                                                <Copy className="w-3 h-3 shrink-0" />
                                                                Clone
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Variants Row */}
                                            {isExpanded && (
                                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                                    <td colSpan={7} className="px-12 py-6">
                                                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Variants Breakdown</span>
                                                            </div>
                                                            <table className="w-full text-left">
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {item.variants.map((variant) => (
                                                                        <tr key={variant.id} className="hover:bg-gray-50/50">
                                                                            <td className="px-4 py-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    {variant.imageUrl ? (
                                                                                        <img src={variant.imageUrl} className="w-8 h-8 rounded border border-gray-200 object-cover" />
                                                                                    ) : (
                                                                                        <div className="w-8 h-8 rounded border border-gray-200 bg-gray-50 flex items-center justify-center">
                                                                                            <Package className="w-4 h-4 text-gray-300" />
                                                                                        </div>
                                                                                    )}
                                                                                    <div>
                                                                                        <p className="text-sm font-semibold text-gray-800">{variant.title}</p>
                                                                                        <p className="text-xs text-gray-500 font-mono mt-0.5">{variant.sku || 'No SKU'}</p>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3">
                                                                                <span className="text-sm font-medium text-gray-900">{variant.price}</span>
                                                                                <span className="text-[10px] text-gray-500 ml-0.5">TL</span>
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right">
                                                                                {variant.isMatched ? (
                                                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                                                                                        <Check className="w-3.5 h-3.5" /> Matched
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md ring-1 ring-rose-500/20">
                                                                                        <X className="w-3.5 h-3.5" /> Unmatched
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Simplified Confirmation Floating Bar */}
                {totalQueued > 0 && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
                        <div className="bg-gray-900/95 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-12 ring-1 ring-white/20">
                            {/* Queued Items Counter */}
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-indigo-500 font-bold text-sm flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                        {totalQueued}
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-400 rounded-full animate-ping"></div>
                                </div>
                                <div>
                                    <p className="font-bold text-sm tracking-tight text-white/90">Queued for Sync</p>
                                    <p className="text-gray-400 text-[11px] font-medium uppercase tracking-wider">Ready to synchronize</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setCrossListing({ to_shopify: [], to_etsy: [] })}
                                    className="px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={saveChanges}
                                    disabled={isSaving}
                                    className="px-8 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/30 active:scale-95 whitespace-nowrap"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    Confirm & Sync Clones
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bulk Operation Confirmation Bar */}
                {bulkOp.pending && !bulkOp.running && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
                        <div className={`backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-12 ring-1 ring-white/20 ${
                            bulkOp.pending === 'delete' ? 'bg-red-900/95' : 'bg-amber-900/95'
                        }`}>
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className={`w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center shadow-lg ${
                                        bulkOp.pending === 'delete' ? 'bg-red-500 shadow-red-500/20' : 'bg-amber-500 shadow-amber-500/20'
                                    }`}>
                                        {bulkOp.total}
                                    </div>
                                    <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping ${
                                        bulkOp.pending === 'delete' ? 'bg-red-400' : 'bg-amber-400'
                                    }`}></div>
                                </div>
                                <div>
                                    <p className="font-bold text-sm tracking-tight text-white/90">
                                        {bulkOp.pending === 'delete' ? 'Delete Products' : 'Unmatch Products'}
                                    </p>
                                    <p className="text-white/50 text-[11px] font-medium uppercase tracking-wider">
                                        {bulkOp.pending === 'delete'
                                            ? 'Remove from MercSync tracking only'
                                            : 'Break cross-platform links'
                                        }
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setBulkOp({ pending: null, running: false, progress: 0, total: 0 })}
                                    className="px-4 py-2.5 text-xs font-bold text-white/50 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeBulkOp}
                                    className={`px-8 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap ${
                                        bulkOp.pending === 'delete'
                                            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30'
                                            : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
                                    }`}
                                >
                                    {bulkOp.pending === 'delete' ? <Trash2 className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                                    {bulkOp.pending === 'delete' ? `Delete ${bulkOp.total} Products` : `Unmatch ${bulkOp.total} Products`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bulk Operation Progress Modal */}
                {bulkOp.running && (
                    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">
                                            {bulkOp.pending === 'delete' ? 'Deleting Products' : 'Unmatching Products'}
                                        </h3>
                                        <p className="text-sm text-gray-500 uppercase tracking-wider">Please wait for completion</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-gray-700">
                                        Processing {bulkOp.progress} of {bulkOp.total}
                                    </span>
                                    <span className="text-sm font-bold text-indigo-600">
                                        {bulkOp.total > 0 ? Math.round((bulkOp.progress / bulkOp.total) * 100) : 0}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            bulkOp.pending === 'delete' ? 'bg-red-500' : 'bg-amber-500'
                                        }`}
                                        style={{ width: `${bulkOp.total > 0 ? (bulkOp.progress / bulkOp.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-3 text-center">
                                    {bulkOp.pending === 'delete'
                                        ? 'Removing products from MercSync tracking...'
                                        : 'Breaking cross-platform links...'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}

            {/* Import Filter Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Import Options</h2>
                                    <p className="text-sm text-gray-500 mt-0.5">Select which product types to include in the import.</p>
                                </div>
                                <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-2 gap-6">
                            {/* Shopify */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-bold text-gray-800">Shopify</span>
                                </div>
                                <div className="space-y-2">
                                    {[
                                        { key: 'active', label: 'Active', icon: <Box className="w-3.5 h-3.5 text-green-600" />, color: 'bg-green-50 border-green-100' },
                                        { key: 'draft', label: 'Draft', icon: <FileText className="w-3.5 h-3.5 text-gray-500" />, color: 'bg-gray-50 border-gray-100' },
                                        { key: 'archived', label: 'Archived', icon: <Archive className="w-3.5 h-3.5 text-orange-500" />, color: 'bg-orange-50 border-orange-100' },
                                    ].map(f => (
                                        <button
                                            key={f.key}
                                            onClick={() => toggleFilter('shopify', f.key)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${shopifyFilters.includes(f.key) ? `${f.color} ring-1 ring-blue-400` : 'bg-white border-gray-100 opacity-50'}`}
                                        >
                                            <div className="flex items-center gap-2">{f.icon}<span className="text-sm font-medium text-gray-700">{f.label}</span></div>
                                            {shopifyFilters.includes(f.key) && <Check className="w-4 h-4 text-blue-600" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Etsy */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Store className="w-4 h-4 text-orange-500" />
                                    <span className="text-sm font-bold text-gray-800">Etsy</span>
                                </div>
                                <div className="space-y-2">
                                    {[
                                        { key: 'active', label: 'Active', icon: <Box className="w-3.5 h-3.5 text-green-600" />, color: 'bg-green-50 border-green-100' },
                                        { key: 'draft', label: 'Draft', icon: <FileText className="w-3.5 h-3.5 text-gray-500" />, color: 'bg-gray-50 border-gray-100' },
                                        { key: 'expired', label: 'Expired', icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" />, color: 'bg-red-50 border-red-100' },
                                        { key: 'inactive', label: 'Inactive', icon: <AlertCircle className="w-3.5 h-3.5 text-gray-400" />, color: 'bg-gray-50 border-gray-100' },
                                    ].map(f => (
                                        <button
                                            key={f.key}
                                            onClick={() => toggleFilter('etsy', f.key)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${etsyFilters.includes(f.key) ? `${f.color} ring-1 ring-orange-400` : 'bg-white border-gray-100 opacity-50'}`}
                                        >
                                            <div className="flex items-center gap-2">{f.icon}<span className="text-sm font-medium text-gray-700">{f.label}</span></div>
                                            {etsyFilters.includes(f.key) && <Check className="w-4 h-4 text-orange-500" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex justify-end gap-3">
                            <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleReimport}
                                disabled={isImporting || (shopifyFilters.length === 0 && etsyFilters.length === 0)}
                                className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                {isImporting ? 'Importing...' : 'Start Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clone Modal */}
            <CloneModal
                isOpen={cloneModal.isOpen}
                onClose={() => setCloneModal({ isOpen: false, sourceData: null, targetPlatform: 'shopify', initialData: undefined, targetId: undefined })}
                onConfirm={handleCloneConfirm}
                sourceData={cloneModal.sourceData}
                targetPlatform={cloneModal.targetPlatform}
                initialData={cloneModal.initialData}
                targetId={cloneModal.targetId}
                shopCurrencies={shopCurrencies}
                pricingRules={pricingRules}
            />
            <SyncProgressModal
                isOpen={isProgressModalOpen}
                jobId={syncJobId}
                onClose={() => {
                    setIsProgressModalOpen(false);
                    loadData(); // Reload data after progress modal closes
                    setCrossListing({ to_shopify: [], to_etsy: [] }); // Clear queue
                }}
            />

            {/* Match Management Modal */}
            <MatchModal
                isOpen={matchModal.isOpen}
                onClose={() => setMatchModal({ isOpen: false, product: null })}
                product={matchModal.product}
                platform={activePlatform}
                onMatchUpdated={() => loadData()}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirm.isOpen && deleteConfirm.product && (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirm({ isOpen: false, product: null, isDeleting: false })}>
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-rose-600 text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Remove Product</h3>
                                    <p className="text-sm opacity-75">from MercSync tracking</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                                    {deleteConfirm.product.imageUrl ? (
                                        <img src={deleteConfirm.product.imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-gray-300" /></div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{deleteConfirm.product.title}</p>
                                    <p className="text-xs text-gray-500">{deleteConfirm.product.variantsCount} variant(s)</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                <div className="text-xs text-amber-800 leading-relaxed">
                                    <p className="font-semibold mb-1">This only removes the product from MercSync.</p>
                                    <p>Your actual listing on {activePlatform === 'shopify' ? 'Shopify' : 'Etsy'} will <span className="font-bold">not</span> be affected. The product will remain on your store.</p>
                                    {deleteConfirm.product.matchStatus === 'synced' && (
                                        <p className="mt-1.5 font-semibold text-amber-900">⚠ The matched product on the other platform will become unmatched.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirm({ isOpen: false, product: null, isDeleting: false })}
                                disabled={deleteConfirm.isDeleting}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!deleteConfirm.product) return;
                                    setDeleteConfirm(prev => ({ ...prev, isDeleting: true }));
                                    try {
                                        const res = await deleteProduct(activePlatform, deleteConfirm.product.id);
                                        if (res.success) {
                                            toast.success('Product removed from MercSync tracking.');
                                            loadData();
                                        } else {
                                            toast.error(res.message);
                                        }
                                    } catch {
                                        toast.error('Failed to delete product.');
                                    }
                                    setDeleteConfirm({ isOpen: false, product: null, isDeleting: false });
                                }}
                                disabled={deleteConfirm.isDeleting}
                                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {deleteConfirm.isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {deleteConfirm.isDeleting ? 'Removing...' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
