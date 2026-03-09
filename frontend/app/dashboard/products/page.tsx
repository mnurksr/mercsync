'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPlatformListings, getInventoryStats, type ListingItem } from '../../actions/inventory';
import {
    Search, Package, Box, Filter,
    Loader2, ShoppingBag, Store, AlertTriangle,
    ChevronDown, ChevronRight, CheckSquare, Square, Check, X, Copy, Pencil, RefreshCw
} from 'lucide-react';
import { useToast } from "@/components/ui/useToast";
import { useAuth } from '@/components/AuthProvider';
import CloneModal, { type CrossListingItem, type CloneSourceData } from '@/components/dashboard/CloneModal';

export default function ProductsPage() {
    const toast = useToast();
    const router = useRouter();
    const { user, supabase } = useAuth();
    const [activePlatform, setActivePlatform] = useState<'shopify' | 'etsy'>('shopify');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
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
        } catch (error) {
            console.error('Failed to load listings:', error);
            toast.error('Failed to load products.');
        } finally {
            setIsLoading(false);
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

    const filteredItems = items.filter(item => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'unmatched') return item.matchStatus === 'unmatched' || item.matchStatus === 'partially_matched';
        if (filterStatus === 'out') return item.totalStock <= 0;
        return item.platformStatus === filterStatus;
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
            description: '', // Initial fetch might not have description, backend will use it if provided
            variants: item.variants.map(v => ({
                platformId: v.id,
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
            // Robust auth check: Use state user first, then try to fetch session directly
            let currentUserId = user?.id;

            if (!currentUserId && supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id;
            }

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

            router.push(`/setup/syncing?job_id=${job_id}`);
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

        // For bulk, we'll just add them to the queue with default mappings
        setCrossListing(prev => {
            const targetPlatform = activePlatform === 'shopify' ? 'etsy' : 'shopify';
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
                            source_variant_id: v.id,
                            title: v.title,
                            sku: v.sku || '',
                            price: v.price,
                            stock: v.stock,
                            selected: true
                        }))
                    });
                }
            });

            return { ...prev, [listKey]: newList };
        });

        toast.success(`Added ${selectedListings.length} items to clone queue.`);
        setSelectedItems(new Set());
    };

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
                <div className="flex items-center gap-4">
                    {selectedItems.size > 0 && (
                        <button
                            onClick={handleBulkClone}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all animate-in zoom-in-95"
                        >
                            <Copy className="w-4 h-4" />
                            Add {selectedItems.size} to Queue
                        </button>
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
                        <p className="text-sm font-medium text-gray-500">Unmatched / Partial</p>
                        <p className="text-2xl font-bold text-gray-900">{isLoading ? <span className="animate-pulse">...</span> : stats.unmatched}</p>
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
                            <option value="all">All Items</option>
                            <option value="unmatched">Needs Matching (Unmatched)</option>
                            <option value="out">Out of Stock</option>
                            <option value="active">Active on Platform</option>
                            <option value="draft">Draft on Platform</option>
                        </select>
                    </div>
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
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Stock</th>
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
                                    <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <Package className="w-12 h-12 text-gray-300 mb-3" />
                                            <p className="text-lg font-medium text-gray-900">No products found</p>
                                            <p className="text-sm mt-1">Try adjusting your search or platform view.</p>
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
                                                                <span className="text-[11px] font-medium text-gray-500 tracking-wide uppercase">
                                                                    ID: {item.id}
                                                                </span>
                                                                <span className="text-[11px] font-medium text-gray-400">•</span>
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
                                                    <span className={`text-sm font-bold ${item.totalStock <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                        {item.totalStock} <span className="text-gray-500 font-medium text-xs">units</span>
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {isQueued ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                                                Queued
                                                            </span>
                                                            <button
                                                                onClick={(e) => handleCloneClick(item, e)}
                                                                className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors shadow-sm"
                                                                title="Edit queue details"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => handleCloneClick(item, e)}
                                                            disabled={item.matchStatus === 'synced'}
                                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border shadow-sm text-xs font-semibold rounded-lg transition-all ${item.matchStatus === 'synced'
                                                                ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed opacity-0' // Hide for synced
                                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-indigo-600'
                                                                }`}
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                            Clone
                                                        </button>
                                                    )}
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
                                                                            <td className="px-4 py-3">
                                                                                <span className={`text-sm font-semibold ${variant.stock <= 0 ? 'text-red-500' : 'text-gray-700'}`}>
                                                                                    {variant.stock} <span className="text-xs text-gray-400">units</span>
                                                                                </span>
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
            </div>

            {/* Modals */}
            <CloneModal
                isOpen={cloneModal.isOpen}
                onClose={() => setCloneModal({ isOpen: false, sourceData: null, targetPlatform: 'shopify' })}
                onConfirm={handleCloneConfirm}
                sourceData={cloneModal.sourceData}
                targetPlatform={cloneModal.targetPlatform}
                initialData={cloneModal.initialData}
                targetId={cloneModal.targetId}
            />
        </div>
    );
}
