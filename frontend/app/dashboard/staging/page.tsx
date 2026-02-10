'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getStagingProducts, type StagingProduct } from '../../actions/staging';
import {
    ArrowLeft, ShoppingBag, Store, RefreshCw, Search,
    Check, X, Loader2, Link2, Sparkles, Wand2, ArrowRight, RotateCcw
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Types
type MatchedPair = {
    id: string;
    shopify: StagingProduct | null;
    etsy: StagingProduct | null;
    single?: 'shopify' | 'etsy';
};

type ReconcileItem = {
    id: string;
    shopify: StagingProduct | null;
    etsy: StagingProduct | null;
    shopifyStock: number;
    etsyStock: number;
    originalShopifyStock: number;
    originalEtsyStock: number;
    single?: 'shopify' | 'etsy';
};

// Editable Stock Component
function EditableStock({
    value,
    onChange,
    isExcess,
    platform
}: {
    value: number;
    onChange: (v: number) => void;
    isExcess: boolean;
    platform: 'shopify' | 'etsy';
}) {
    const [editing, setEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync tempValue when value prop changes (e.g., from Sync button)
    useEffect(() => {
        if (!editing) {
            setTempValue(value.toString());
        }
    }, [value, editing]);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const save = () => {
        const num = parseInt(tempValue) || 0;
        onChange(Math.max(0, num));
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="number"
                value={tempValue}
                onChange={e => setTempValue(e.target.value)}
                onBlur={save}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                className={`w-16 h-14 text-center text-2xl font-bold rounded-xl border-2 outline-none ${platform === 'shopify'
                    ? 'border-[#95BF47] bg-green-50'
                    : 'border-[#F56400] bg-orange-50'
                    }`}
            />
        );
    }

    return (
        <div
            onClick={() => { setTempValue(value.toString()); setEditing(true); }}
            className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 ${isExcess
                ? 'bg-red-100 ring-2 ring-red-400'
                : 'bg-gray-100 hover:bg-gray-200'
                }`}
        >
            {platform === 'shopify'
                ? <ShoppingBag className={`w-4 h-4 mb-0.5 ${isExcess ? 'text-red-500' : 'text-gray-400'}`} />
                : <Store className={`w-4 h-4 mb-0.5 ${isExcess ? 'text-red-500' : 'text-gray-400'}`} />
            }
            <span className={`text-xl font-bold ${isExcess ? 'text-red-600' : 'text-gray-700'}`}>
                {value}
            </span>
        </div>
    );
}

// Cache
const getCache = () => {
    if (typeof window === 'undefined') return null;
    try {
        const s = localStorage.getItem('ms_staging_shopify');
        const e = localStorage.getItem('ms_staging_etsy');
        if (!s && !e) return null;
        return { shopify: s ? JSON.parse(s) : [], etsy: e ? JSON.parse(e) : [] };
    } catch { return null; }
};

export default function StagingPage() {
    const { user } = useAuth();
    const cache = getCache();

    const [shopifyProducts, setShopifyProducts] = useState<StagingProduct[]>(cache?.shopify || []);
    const [etsyProducts, setEtsyProducts] = useState<StagingProduct[]>(cache?.etsy || []);
    const [loading, setLoading] = useState(!cache);

    const [matches, setMatches] = useState<MatchedPair[]>([]);
    const [shopifySearch, setShopifySearch] = useState('');
    const [etsySearch, setEtsySearch] = useState('');

    const [draggedItem, setDraggedItem] = useState<{ product: StagingProduct, from: 'shopify' | 'etsy' } | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [centerHover, setCenterHover] = useState(false);

    const [aiLoading, setAiLoading] = useState(false);

    const router = useRouter();

    const [showReconcile, setShowReconcile] = useState(false);
    const [reconcileItems, setReconcileItems] = useState<ReconcileItem[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [savingOverlay, setSavingOverlay] = useState<'loading' | 'success' | null>(null);

    useEffect(() => { if (user) load(); }, [user]);

    const load = async () => {
        try {
            const [s, e] = await Promise.all([
                getStagingProducts('shopify'),
                getStagingProducts('etsy')
            ]);
            setShopifyProducts(s);
            setEtsyProducts(e);
            localStorage.setItem('ms_staging_shopify', JSON.stringify(s));
            localStorage.setItem('ms_staging_etsy', JSON.stringify(e));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const unmatchedShopify = useMemo(() => {
        const matchedIds = new Set(matches.filter(m => m.shopify).map(m => m.shopify!.id));
        let list = shopifyProducts.filter(p => !matchedIds.has(p.id));
        if (shopifySearch) {
            const q = shopifySearch.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
        }
        return list;
    }, [shopifyProducts, matches, shopifySearch]);

    const unmatchedEtsy = useMemo(() => {
        const matchedIds = new Set(matches.filter(m => m.etsy).map(m => m.etsy!.id));
        let list = etsyProducts.filter(p => !matchedIds.has(p.id));
        if (etsySearch) {
            const q = etsySearch.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
        }
        return list;
    }, [etsyProducts, matches, etsySearch]);

    const handleDragStart = (product: StagingProduct, from: 'shopify' | 'etsy') => {
        if (aiLoading) return; // Block drag during AI matching
        setDraggedItem({ product, from });
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDropTarget(null);
        setCenterHover(false);
    };

    const handleDropOnProduct = (target: StagingProduct) => {
        if (!draggedItem) return;
        const newMatch: MatchedPair = {
            id: `match-${Date.now()}`,
            shopify: draggedItem.from === 'shopify' ? draggedItem.product : target,
            etsy: draggedItem.from === 'etsy' ? draggedItem.product : target
        };
        setMatches(prev => [...prev, newMatch]);
        handleDragEnd();
    };

    const handleDropOnCenter = () => {
        if (!draggedItem) return;
        const newMatch: MatchedPair = {
            id: `single-${Date.now()}`,
            shopify: draggedItem.from === 'shopify' ? draggedItem.product : null,
            etsy: draggedItem.from === 'etsy' ? draggedItem.product : null,
            single: draggedItem.from
        };
        setMatches(prev => [...prev, newMatch]);
        handleDragEnd();
    };

    const removeMatch = (id: string) => {
        setMatches(prev => prev.filter(m => m.id !== id));
    };

    const normalizeName = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    };

    const findEtsyByName = (searchName: string, usedIds: Set<string>): StagingProduct | null => {
        const normalized = normalizeName(searchName);
        const searchWords = normalized.split(' ').filter(w => w.length >= 3);
        let bestMatch: StagingProduct | null = null;
        let bestScore = 0;

        for (const p of etsyProducts) {
            if (usedIds.has(p.id)) continue;
            const pNormalized = normalizeName(p.name);
            if (pNormalized === normalized) return p;

            const pWords = pNormalized.split(' ').filter(w => w.length >= 3);
            let score = 0;
            for (const sw of searchWords) {
                for (const pw of pWords) {
                    if (sw === pw) score += 10;
                    else if (sw.includes(pw) || pw.includes(sw)) score += 5;
                }
            }
            if (score >= 10 && score > bestScore) {
                bestScore = score;
                bestMatch = p;
            }
        }
        return bestMatch;
    };

    // AI Match
    const aiMatch = async () => {
        if (!user?.id) {
            console.log('No user ID');
            return;
        }

        console.log('Starting AI Match for user:', user.id);
        setAiLoading(true);

        try {
            const res = await fetch('https://api.mercsync.com/webhook/auto-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id })
            });

            console.log('AI Response status:', res.status);

            if (res.ok) {
                const json = await res.json();
                const data = Array.isArray(json) ? json[0] : json;
                console.log('AI Response data:', data);

                const newMatches: MatchedPair[] = [];
                const usedShopifyIds = new Set(matches.filter(m => m.shopify).map(m => m.shopify!.id));
                const usedEtsyIds = new Set(matches.filter(m => m.etsy).map(m => m.etsy!.id));

                if (data.linked?.length) {
                    for (const item of data.linked) {
                        const { s_id, name } = item as { s_id: string; e_id: string; name: string };
                        const shopify = shopifyProducts.find(p => p.platformId === s_id && !usedShopifyIds.has(p.id));
                        const etsy = name ? findEtsyByName(name, usedEtsyIds) : null;
                        if (shopify && etsy) {
                            newMatches.push({ id: `ai-${Date.now()}-${Math.random()}`, shopify, etsy });
                            usedShopifyIds.add(shopify.id);
                            usedEtsyIds.add(etsy.id);
                        }
                    }
                }

                if (data.shopify_only?.length) {
                    for (const item of data.shopify_only) {
                        const { s_id } = item as { s_id: string; name: string };
                        const shopify = shopifyProducts.find(p => p.platformId === s_id && !usedShopifyIds.has(p.id));
                        if (shopify) {
                            newMatches.push({ id: `ai-s-${Date.now()}-${Math.random()}`, shopify, etsy: null, single: 'shopify' });
                            usedShopifyIds.add(shopify.id);
                        }
                    }
                }

                if (data.etsy_only?.length) {
                    for (const item of data.etsy_only) {
                        const { name } = item as { e_id: string; name: string };
                        const etsy = name ? findEtsyByName(name, usedEtsyIds) : null;
                        if (etsy) {
                            newMatches.push({ id: `ai-e-${Date.now()}-${Math.random()}`, shopify: null, etsy, single: 'etsy' });
                            usedEtsyIds.add(etsy.id);
                        }
                    }
                }

                console.log('Total new matches:', newMatches.length);
                if (newMatches.length > 0) {
                    setMatches(prev => [...prev, ...newMatches]);
                }
            }
        } catch (err) {
            console.error('AI Match error:', err);
        } finally {
            setAiLoading(false);
        }
    };

    // Open Reconciliation
    const openReconciliation = () => {
        const items: ReconcileItem[] = matches.map(m => {
            const shopifyStock = m.shopify?.stockQuantity ?? 0;
            const etsyStock = m.etsy?.stockQuantity ?? 0;

            return {
                id: m.id,
                shopify: m.shopify,
                etsy: m.etsy,
                shopifyStock,
                etsyStock,
                originalShopifyStock: shopifyStock,
                originalEtsyStock: etsyStock,
                single: m.single
            };
        });

        setReconcileItems(items);
        setShowReconcile(true);
        setSavingOverlay(null);
    };

    // Update stock for an item
    const updateStock = (id: string, platform: 'shopify' | 'etsy', value: number) => {
        setReconcileItems(prev => prev.map(item =>
            item.id === id
                ? platform === 'shopify'
                    ? { ...item, shopifyStock: value }
                    : { ...item, etsyStock: value }
                : item
        ));
    };

    // Sync single item (reduce higher to match lower)
    const syncItem = (id: string) => {
        setReconcileItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const minStock = Math.min(item.shopifyStock, item.etsyStock);
            return { ...item, shopifyStock: minStock, etsyStock: minStock };
        }));
    };

    // Sync ALL items
    const syncAll = () => {
        setReconcileItems(prev => prev.map(item => {
            if (item.single) return item; // Skip singles
            const minStock = Math.min(item.shopifyStock, item.etsyStock);
            return { ...item, shopifyStock: minStock, etsyStock: minStock };
        }));
    };

    // Reset ALL to original
    const resetAll = () => {
        setReconcileItems(prev => prev.map(item => ({
            ...item,
            shopifyStock: item.originalShopifyStock,
            etsyStock: item.originalEtsyStock
        })));
    };

    // Save changes - send to webhook
    const saveChanges = async () => {
        if (!user?.id) return;
        setSyncing(true);

        // DEBUG: Log the actual state being sent
        console.log('=== SAVE DEBUG ===');
        console.log('reconcileItems state:', reconcileItems.map(i => ({
            name: i.shopify?.name || i.etsy?.name,
            shopifyStock: i.shopifyStock,
            etsyStock: i.etsyStock,
            originalShopify: i.originalShopifyStock,
            originalEtsy: i.originalEtsyStock
        })));

        try {
            // Group items
            const syncedItems = reconcileItems.filter(i => i.shopify && i.etsy);
            const shopifyOnlyItems = reconcileItems.filter(i => i.single === 'shopify');
            const etsyOnlyItems = reconcileItems.filter(i => i.single === 'etsy');

            // Build original stocks (before any changes)
            const original_stocks = {
                synced: syncedItems.map(i => ({
                    shopify_id: i.shopify!.platformId,
                    etsy_id: i.etsy!.platformId,
                    shopify_stock: i.originalShopifyStock,
                    etsy_stock: i.originalEtsyStock
                })),
                shopify_only: shopifyOnlyItems.map(i => ({
                    shopify_id: i.shopify!.platformId,
                    stock: i.originalShopifyStock
                })),
                etsy_only: etsyOnlyItems.map(i => ({
                    etsy_id: i.etsy!.platformId,
                    stock: i.originalEtsyStock
                }))
            };

            // Build current stocks (after user edits)
            const current_stocks = {
                synced: syncedItems.map(i => ({
                    shopify_id: i.shopify!.platformId,
                    etsy_id: i.etsy!.platformId,
                    shopify_stock: i.shopifyStock,
                    etsy_stock: i.etsyStock
                })),
                shopify_only: shopifyOnlyItems.map(i => ({
                    shopify_id: i.shopify!.platformId,
                    stock: i.shopifyStock
                })),
                etsy_only: etsyOnlyItems.map(i => ({
                    etsy_id: i.etsy!.platformId,
                    stock: i.etsyStock
                }))
            };

            const payload = {
                user_id: user.id,
                original_stocks,
                current_stocks
            };

            console.log('Sending to webhook:', payload);

            // Show loading overlay
            setSavingOverlay('loading');

            const res = await fetch('https://api.mercsync.com/webhook/sync-stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('Webhook response:', res.status);

            if (res.ok) {
                // Show success briefly then redirect
                setSavingOverlay('success');
                await new Promise(r => setTimeout(r, 1500));
                router.push('/dashboard/products');
            } else {
                console.error('Webhook failed:', await res.text());
                setSavingOverlay(null);
            }
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setSyncing(false);
        }
    };

    const linkedCount = matches.filter(m => m.shopify && m.etsy).length;
    const singleCount = matches.filter(m => m.single).length;

    // === RECONCILIATION VIEW ===
    if (showReconcile) {
        const linkedItems = reconcileItems.filter(i => i.shopify && i.etsy);
        const singleItems = reconcileItems.filter(i => i.single);
        const hasChanges = reconcileItems.some(i =>
            i.shopifyStock !== i.originalShopifyStock || i.etsyStock !== i.originalEtsyStock
        );

        return (
            <>
                {/* Saving Overlay */}
                {savingOverlay && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white rounded-3xl p-12 flex flex-col items-center gap-6 shadow-2xl">
                            {savingOverlay === 'loading' ? (
                                <>
                                    <div className="w-20 h-20 rounded-full border-4 border-gray-200 border-t-green-500 animate-spin" />
                                    <p className="text-xl font-semibold text-gray-700">Syncing stocks...</p>
                                    <p className="text-sm text-gray-400">Please wait while we update your inventory</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
                                        <Check className="w-10 h-10 text-white" />
                                    </div>
                                    <p className="text-xl font-semibold text-gray-700">Sync Complete!</p>
                                    <p className="text-sm text-gray-400">Redirecting to products...</p>
                                </>
                            )}
                        </div>
                    </div>
                )}
                <div className="min-h-screen bg-gray-50" style={{ overscrollBehavior: 'none' }}>
                    {/* Header */}
                    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                        <div className="max-w-[1600px] mx-auto px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setShowReconcile(false)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
                                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                                    </button>
                                    <div>
                                        <h1 className="text-xl font-bold text-gray-900">Stock Reconciliation</h1>
                                        <p className="text-sm text-gray-500">Click on stock numbers to edit • Sync to equalize</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={resetAll}
                                        disabled={!hasChanges}
                                        className="h-10 px-4 text-gray-600 font-medium rounded-lg flex items-center gap-2 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Reset
                                    </button>
                                    <button
                                        onClick={syncAll}
                                        className="h-10 px-5 bg-indigo-600 text-white font-medium rounded-lg flex items-center gap-2 hover:bg-indigo-700"
                                    >
                                        <Link2 className="w-4 h-4" />
                                        Sync All
                                    </button>
                                    <button
                                        onClick={saveChanges}
                                        disabled={syncing}
                                        className="h-10 px-5 bg-green-600 text-white font-medium rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Stats */}
                    <div className="bg-white border-b border-gray-100">
                        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-6">
                            <p className="text-sm text-gray-600">
                                <span className="font-semibold text-green-600">{linkedItems.length}</span> linked pairs
                            </p>
                            <p className="text-sm text-gray-600">
                                <span className="font-semibold text-amber-600">{singleItems.length}</span> single marketplace
                            </p>
                            {hasChanges && (
                                <p className="text-sm text-indigo-600 font-medium">
                                    • Unsaved changes
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Items */}
                    <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-3">
                        {reconcileItems.map(item => {
                            const isLinked = item.shopify && item.etsy;
                            const excess = isLinked ? (
                                item.shopifyStock > item.etsyStock ? 'shopify' :
                                    item.etsyStock > item.shopifyStock ? 'etsy' : 'none'
                            ) : 'none';
                            const diff = isLinked ? Math.abs(item.shopifyStock - item.etsyStock) : 0;

                            return (
                                <div key={item.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                    <div className="p-5">
                                        <div className="flex items-center gap-6">
                                            {/* Shopify Side */}
                                            <div className="flex-1 flex items-center gap-4 min-w-0">
                                                {item.shopify ? (
                                                    <>
                                                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0 overflow-hidden">
                                                            {item.shopify.imageUrl ? (
                                                                <img src={item.shopify.imageUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-400" /></div>}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">{item.shopify.name}</p>
                                                            <p className="text-xs text-gray-500">{item.shopify.sku || 'NO-SKU'}</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex-1 flex items-center justify-center py-4">
                                                        <span className="text-gray-300 text-lg">—</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Stock Boxes */}
                                            <div className="flex items-center gap-4">
                                                {item.shopify ? (
                                                    <EditableStock
                                                        value={item.shopifyStock}
                                                        onChange={v => updateStock(item.id, 'shopify', v)}
                                                        isExcess={excess === 'shopify'}
                                                        platform="shopify"
                                                    />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-xl bg-gray-50 flex items-center justify-center">
                                                        <span className="text-gray-300">—</span>
                                                    </div>
                                                )}

                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isLinked ? 'bg-green-100' : 'bg-amber-100'
                                                    }`}>
                                                    <Link2 className={`w-5 h-5 ${isLinked ? 'text-green-600' : 'text-amber-600'}`} />
                                                </div>

                                                {item.etsy ? (
                                                    <EditableStock
                                                        value={item.etsyStock}
                                                        onChange={v => updateStock(item.id, 'etsy', v)}
                                                        isExcess={excess === 'etsy'}
                                                        platform="etsy"
                                                    />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-xl bg-gray-50 flex items-center justify-center">
                                                        <span className="text-gray-300">—</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Etsy Side */}
                                            <div className="flex-1 flex items-center gap-4 min-w-0 justify-end">
                                                {item.etsy ? (
                                                    <>
                                                        <div className="min-w-0 flex-1 text-right">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">{item.etsy.name}</p>
                                                            <p className="text-xs text-gray-500">{item.etsy.sku || 'NO-SKU'}</p>
                                                        </div>
                                                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 flex-shrink-0 overflow-hidden">
                                                            {item.etsy.imageUrl ? (
                                                                <img src={item.etsy.imageUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : <div className="w-full h-full flex items-center justify-center"><Store className="w-5 h-5 text-orange-400" /></div>}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex-1 flex items-center justify-center py-4">
                                                        <span className="text-gray-300 text-lg">—</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sync Button - Only for linked pairs with difference */}
                                    {isLinked && (
                                        <div className={`px-5 py-3 border-t flex items-center justify-center gap-3 ${diff > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                                            }`}>
                                            {diff > 0 && (
                                                <span className="text-sm text-red-600 font-medium">
                                                    {diff} excess on {excess === 'shopify' ? 'Shopify' : 'Etsy'}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => syncItem(item.id)}
                                                disabled={diff === 0}
                                                className={`px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${diff > 0
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                    }`}
                                            >
                                                <Link2 className="w-4 h-4" />
                                                {diff > 0 ? `Sync (→ ${Math.min(item.shopifyStock, item.etsyStock)})` : 'Already Synced'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Single marker */}
                                    {item.single && (
                                        <div className="px-5 py-2 border-t bg-amber-50 border-amber-100 flex items-center justify-center">
                                            <span className="text-xs text-amber-600 font-medium">
                                                {item.single === 'shopify' ? 'Shopify Only' : 'Etsy Only'} • No sync needed
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </>
        );
    }

    // === MATCHING VIEW ===
    return (
        <div className="min-h-screen bg-gray-50" style={{ overscrollBehavior: 'none' }}>
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-[1800px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard/products" className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Product Matching</h1>
                                <p className="text-sm text-gray-500">Link Shopify & Etsy products</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={aiMatch}
                                disabled={aiLoading}
                                className="h-10 px-5 rounded-lg font-medium text-white flex items-center gap-2 disabled:opacity-60 transition-transform active:scale-95"
                                style={{
                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                    boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
                                }}
                            >
                                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                AI Match
                                <Sparkles className="w-4 h-4" />
                            </button>
                            <button onClick={load} className="p-2.5 hover:bg-gray-100 rounded-lg">
                                <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-white border-b border-gray-100">
                <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                        <span className="font-semibold text-green-600">{linkedCount}</span> linked pairs •
                        <span className="font-semibold text-amber-600 ml-1">{singleCount}</span> single •
                        <span className="text-gray-400 ml-1">{unmatchedShopify.length + unmatchedEtsy.length} pending</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                            Cancel
                        </button>
                        <button
                            onClick={openReconciliation}
                            disabled={matches.length === 0}
                            className="h-9 px-4 bg-green-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                        >
                            <ArrowRight className="w-4 h-4" />
                            Continue
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1800px] mx-auto px-6 py-6">
                <div className="grid grid-cols-[380px_1fr_380px] gap-6 items-start">

                    {/* LEFT: Shopify */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden sticky top-32">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#95BF47]" />
                                <span className="font-bold text-gray-900 text-lg">Shopify</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-500">{unmatchedShopify.length}</span>
                        </div>
                        <div className="p-3 border-b border-gray-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={shopifySearch}
                                    onChange={e => setShopifySearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border-0 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                            </div>
                        </div>
                        <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-3 space-y-2">
                            {loading ? (
                                <div className="py-20 flex justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                                </div>
                            ) : unmatchedShopify.map(p => (
                                <div
                                    key={p.id}
                                    draggable
                                    onDragStart={() => handleDragStart(p, 'shopify')}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={e => { e.preventDefault(); if (draggedItem?.from === 'etsy') setDropTarget(p.id); }}
                                    onDragLeave={() => setDropTarget(null)}
                                    onDrop={() => { if (draggedItem?.from === 'etsy') handleDropOnProduct(p); }}
                                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${aiLoading
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'cursor-grab active:cursor-grabbing'
                                        } ${dropTarget === p.id
                                            ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-[1.02]'
                                            : 'bg-gray-50 hover:bg-gray-100'
                                        }`}
                                >
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0 overflow-hidden">
                                        {p.imageUrl ? (
                                            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ShoppingBag className="w-5 h-5 text-blue-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{p.name}</p>
                                        <p className="text-xs text-gray-500 mt-1">{p.sku || 'NO-SKU'} • {p.stockQuantity ?? 0} stk</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CENTER: Matches */}
                    <div
                        onDragOver={e => { e.preventDefault(); setCenterHover(true); }}
                        onDragLeave={() => setCenterHover(false)}
                        onDrop={() => handleDropOnCenter()}
                        className={`min-h-[500px] rounded-2xl border-2 border-dashed transition-all duration-300 ${centerHover
                            ? 'border-amber-400 bg-amber-50 scale-[1.02] shadow-lg'
                            : matches.length === 0
                                ? 'border-gray-200 bg-gray-50/50'
                                : 'border-transparent bg-transparent'
                            }`}
                    >
                        {matches.length === 0 ? (
                            <div className={`h-full flex flex-col items-center justify-center py-24 transition-all ${centerHover ? 'scale-105' : ''}`}>
                                <Link2 className={`w-14 h-14 mb-4 transition-colors ${centerHover ? 'text-amber-400' : 'text-gray-300'}`} />
                                <p className={`text-base font-medium transition-colors ${centerHover ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {centerHover ? 'Drop here for single marketplace' : 'Drag & Drop to match products'}
                                </p>
                                <p className={`text-sm mt-1 transition-colors ${centerHover ? 'text-amber-500' : 'text-gray-300'}`}>
                                    {centerHover ? 'Product only on one platform' : 'or use AI Match button'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 p-2">
                                {draggedItem && (
                                    <div className={`p-4 rounded-xl border-2 border-dashed text-center transition-all ${centerHover ? 'border-amber-400 bg-amber-100' : 'border-gray-300 bg-gray-100'
                                        }`}>
                                        <p className={`text-sm font-medium ${centerHover ? 'text-amber-700' : 'text-gray-500'}`}>
                                            {centerHover ? 'Drop for single marketplace' : 'Drop here if no match exists'}
                                        </p>
                                    </div>
                                )}

                                {matches.map(match => (
                                    <div
                                        key={match.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${match.single ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 shadow-sm'
                                            }`}
                                    >
                                        <div className="flex-1 flex items-center gap-3 min-w-0">
                                            {match.shopify ? (
                                                <>
                                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0 overflow-hidden">
                                                        {match.shopify.imageUrl ? (
                                                            <img src={match.shopify.imageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-blue-400" /></div>}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{match.shopify.name}</p>
                                                        <p className="text-xs text-gray-500">{match.shopify.stockQuantity ?? 0} stock</p>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex-1 text-center py-2"><span className="text-gray-300">—</span></div>
                                            )}
                                        </div>

                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${match.single ? 'bg-amber-200' : 'bg-green-100'
                                            }`}>
                                            <Link2 className={`w-4 h-4 ${match.single ? 'text-amber-600' : 'text-green-600'}`} />
                                        </div>

                                        <div className="flex-1 flex items-center gap-3 min-w-0">
                                            {match.etsy ? (
                                                <>
                                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 flex-shrink-0 overflow-hidden">
                                                        {match.etsy.imageUrl ? (
                                                            <img src={match.etsy.imageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : <div className="w-full h-full flex items-center justify-center"><Store className="w-4 h-4 text-orange-400" /></div>}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{match.etsy.name}</p>
                                                        <p className="text-xs text-gray-500">{match.etsy.stockQuantity ?? 0} stock</p>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex-1 text-center py-2"><span className="text-gray-300">—</span></div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => removeMatch(match.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Etsy */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden sticky top-32">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#F56400]" />
                                <span className="font-bold text-gray-900 text-lg">Etsy</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-500">{unmatchedEtsy.length}</span>
                        </div>
                        <div className="p-3 border-b border-gray-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={etsySearch}
                                    onChange={e => setEtsySearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border-0 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                            </div>
                        </div>
                        <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-3 space-y-2">
                            {loading ? (
                                <div className="py-20 flex justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                                </div>
                            ) : unmatchedEtsy.map(p => (
                                <div
                                    key={p.id}
                                    draggable
                                    onDragStart={() => handleDragStart(p, 'etsy')}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={e => { e.preventDefault(); if (draggedItem?.from === 'shopify') setDropTarget(p.id); }}
                                    onDragLeave={() => setDropTarget(null)}
                                    onDrop={() => { if (draggedItem?.from === 'shopify') handleDropOnProduct(p); }}
                                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${aiLoading
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'cursor-grab active:cursor-grabbing'
                                        } ${dropTarget === p.id
                                            ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-[1.02]'
                                            : 'bg-gray-50 hover:bg-gray-100'
                                        }`}
                                >
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 flex-shrink-0 overflow-hidden">
                                        {p.imageUrl ? (
                                            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Store className="w-5 h-5 text-orange-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{p.name}</p>
                                        <p className="text-xs text-gray-500 mt-1">{p.sku || 'NO-SKU'} • {p.stockQuantity ?? 0} stk</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
