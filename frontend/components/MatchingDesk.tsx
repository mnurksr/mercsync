'use client';

import { useState, useCallback } from 'react';
import { GripVertical, X, ArrowRight, Save, Link as LinkIcon, Search, Loader2 } from 'lucide-react';
import Image from 'next/image';

// Types based on User Request
interface Product {
    id: string | number;
    title: string;
    sku: string;
    price: string | number;
    image?: string;
}

interface MatchPair {
    pair_id: string;
    shopify: Product;
    etsy: Product;
}

interface MatchingDeskProps {
    initialData: {
        matched: MatchPair[];
        unmatched_shopify: Product[];
        unmatched_etsy: Product[];
    };
    onSave: (matches: { shopify_id: string | number; etsy_id: string | number }[]) => void;
    onBack: () => void;
}

export default function MatchingDesk({ initialData, onSave, onBack }: MatchingDeskProps) {
    const [matchedPairs, setMatchedPairs] = useState<MatchPair[]>(initialData.matched || []);
    const [shopifyPool, setShopifyPool] = useState<Product[]>(initialData.unmatched_shopify || []);
    const [etsyPool, setEtsyPool] = useState<Product[]>(initialData.unmatched_etsy || []);
    const [isSaving, setIsSaving] = useState(false);

    // Sync state if initialData changes (e.g. re-upload)
    const [prevInitialData, setPrevInitialData] = useState(initialData);
    if (initialData !== prevInitialData) {
        setMatchedPairs(initialData.matched || []);
        setShopifyPool(initialData.unmatched_shopify || []);
        setEtsyPool(initialData.unmatched_etsy || []);
        setPrevInitialData(initialData);
    }

    // Filter states
    const [shopifyFilter, setShopifyFilter] = useState('');
    const [etsyFilter, setEtsyFilter] = useState('');

    // --- Drag & Drop Logic ---

    // Data transfer format: JSON string of { type: 'shopify' | 'etsy' | 'pair', data: ... }
    const handleDragStart = (e: React.DragEvent, type: 'shopify' | 'etsy', item: Product) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type, item }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropOnMatchZone = (e: React.DragEvent) => {
        e.preventDefault();
        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        // Parsing might fail if dragged from outside, wrap in try/catch
        try {
            const { type, item } = JSON.parse(rawData);

            // Note: In this simple implementation, we only support dragging from pools to create new matches 
            // if we drop onto a specific "New Match" area or if we handle specific combine logic.
            // For now, let's implement: Drag Shopify to Etsy (or vice versa) in pools? 
            // Or Drag both to a "Draft Match" area? 

            // Better UX: Drag an item from one pool ONTO an item in the other pool to match them?
            // OR Drag both into a central "Drop Zone".
        } catch (err) {
            console.error(err);
        }
    };

    // simplified: The user drags an item from a pool onto a "Potential Match" slot or an existing item.
    // Let's implement:
    // 1. Drag Shopify Item -> Drop on Etsy Item in Etsy Pool -> Immediate Match
    // 2. Drag Etsy Item -> Drop on Shopify Item in Shopify Pool -> Immediate Match
    // 3. Matched items can be "broken" by clicking X.

    const handleDropOnProduct = (e: React.DragEvent, targetItem: Product, targetPlatform: 'shopify' | 'etsy') => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        try {
            const { type: draggedType, item: draggedItem } = JSON.parse(rawData);

            // Valid match: Dragged Shopify -> Dropped on Etsy, or Dragged Etsy -> Dropped on Shopify
            if (draggedType !== targetPlatform && draggedType !== 'pair') {
                createMatch(
                    draggedType === 'shopify' ? draggedItem : targetItem,
                    draggedType === 'etsy' ? draggedItem : targetItem
                );
            }
        } catch (err) {
            console.error('Drop error', err);
        }
    };

    const createMatch = (shopifyItem: Product, etsyItem: Product) => {
        // Remove from pools
        setShopifyPool(prev => prev.filter(p => p.id !== shopifyItem.id));
        setEtsyPool(prev => prev.filter(p => p.id !== etsyItem.id));

        // Add to matches
        const newPair: MatchPair = {
            pair_id: `temp-${Date.now()}`,
            shopify: shopifyItem,
            etsy: etsyItem
        };
        setMatchedPairs(prev => [newPair, ...prev]);
    };

    const breakMatch = (pair: MatchPair) => {
        // Remove from matches
        setMatchedPairs(prev => prev.filter(p => p.pair_id !== pair.pair_id));

        // Return to pools
        setShopifyPool(prev => [pair.shopify, ...prev]);
        setEtsyPool(prev => [pair.etsy, ...prev]);
    };

    const handleSaveClick = async () => {
        setIsSaving(true);
        // Transform to requested format
        const payload = matchedPairs.map(p => ({
            shopify_id: p.shopify.id,
            etsy_id: p.etsy.id
        }));

        // Simulate waiting / allow parent to handle async
        await onSave(payload);
        setIsSaving(false);
    };

    // --- Sub-components (Renderers) ---

    const ProductCard = ({ product, type, isDraggable = true }: { product: Product, type: 'shopify' | 'etsy', isDraggable?: boolean }) => (
        <div
            draggable={isDraggable}
            onDragStart={(e) => isDraggable && handleDragStart(e, type, product)}
            onDragOver={(e) => e.preventDefault()} // Allow dropping
            onDrop={(e) => isDraggable && handleDropOnProduct(e, product, type)}
            className={`
                relative p-3 rounded-xl border bg-white shadow-sm flex items-start gap-3 transition-all
                ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md' : ''}
                dark:bg-gray-800 dark:border-gray-700
            `}
        >
            {/* Image Placeholder or Actual Image */}
            <div className="w-12 h-12 bg-gray-100 rounded-lg shrink-0 overflow-hidden relative border border-gray-100 dark:bg-gray-700 dark:border-gray-600">
                {product.image ? (
                    <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 font-bold">
                        {type === 'shopify' ? 'S' : 'E'}
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 truncate dark:text-gray-100" title={product.title}>
                    {product.title}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono dark:bg-gray-700 dark:text-gray-400">
                        {product.sku}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        ${product.price}
                    </span>
                </div>
            </div>

            {isDraggable && <GripVertical className="w-4 h-4 text-gray-300 absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-800">

            {/* Toolbar */}
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-bold text-blue-600">{matchedPairs.length}</span> Matches
                    </div>
                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-bold text-orange-600">{shopifyPool.length + etsyPool.length}</span> Unmatched
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-300 dark:hover:bg-gray-800">
                        Back
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Matches
                    </button>
                </div>
            </div>

            {/* Content Area - 3 Columns */}
            <div className="flex-1 flex overflow-hidden">

                {/* 1. Shopify Pool */}
                <div className="flex-1 flex flex-col min-w-[300px] border-r border-gray-200 bg-gray-50/30 dark:border-gray-800 dark:bg-gray-900/50">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/90 backdrop-blur z-10 dark:bg-gray-900/90">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2 dark:text-gray-200">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Shopify Pool
                            </h3>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full dark:bg-gray-800">{shopifyPool.length}</span>
                        </div>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search Shopify..."
                                value={shopifyFilter}
                                onChange={(e) => setShopifyFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {shopifyPool
                            .filter(p => p.title.toLowerCase().includes(shopifyFilter.toLowerCase()) || p.sku.includes(shopifyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="shopify" />
                            ))}
                        {shopifyPool.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm italic">Pool empty</div>
                        )}
                    </div>
                </div>

                {/* 2. Matched Zone (Center) */}
                <div className="flex-[1.5] flex flex-col min-w-[400px] bg-white border-r border-gray-200 relative dark:bg-gray-900 dark:border-gray-800">
                    <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-white dark:bg-gray-900 dark:border-gray-800">
                        <h3 className="font-bold text-sm text-blue-600 flex items-center gap-2">
                            <LinkIcon className="w-4 h-4" />
                            Matched Pairs
                        </h3>
                        <span className="text-xs text-gray-400">Drag items here or onto each other</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {matchedPairs.map((pair) => (
                            <div key={pair.pair_id} className="flex items-center gap-2 p-2 rounded-xl border border-blue-100 bg-blue-50/30 group hover:border-blue-300 transition-all dark:border-blue-900/30 dark:bg-blue-900/10">
                                {/* Shopify Side */}
                                <div className="flex-1">
                                    <ProductCard product={pair.shopify} type="shopify" isDraggable={false} />
                                </div>

                                {/* Linker */}
                                <div className="text-blue-400 flex flex-col items-center gap-1">
                                    <div className="w-8 h-px bg-blue-200"></div>
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-900">
                                        <LinkIcon className="w-3 h-3 text-blue-600" />
                                    </div>
                                    <div className="w-8 h-px bg-blue-200"></div>
                                </div>

                                {/* Etsy Side */}
                                <div className="flex-1">
                                    <ProductCard product={pair.etsy} type="etsy" isDraggable={false} />
                                </div>

                                {/* Actions */}
                                <button
                                    onClick={() => breakMatch(pair)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/30"
                                    title="Unmatch"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}

                        {matchedPairs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 dark:bg-gray-800">
                                    <LinkIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                                </div>
                                <p>No matches yet.</p>
                                <p className="text-xs mt-1">Drag items from left/right pools to match them.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Etsy Pool */}
                <div className="flex-1 flex flex-col min-w-[300px] bg-gray-50/30 dark:bg-gray-900/50">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/90 backdrop-blur z-10 dark:bg-gray-900/90">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2 dark:text-gray-200">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Etsy Pool
                            </h3>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full dark:bg-gray-800">{etsyPool.length}</span>
                        </div>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search Etsy..."
                                value={etsyFilter}
                                onChange={(e) => setEtsyFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {etsyPool
                            .filter(p => p.title.toLowerCase().includes(etsyFilter.toLowerCase()) || p.sku.includes(etsyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="etsy" />
                            ))}
                        {etsyPool.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm italic">Pool empty</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
