'use client';

import { useState, useRef, useEffect } from 'react';
import { GripVertical, X, ArrowRight, Save, Link as LinkIcon, Search, Loader2, Sparkles, Filter } from 'lucide-react';

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

    // Sync state if initialData changes
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

    const handleDragStart = (e: React.DragEvent, type: 'shopify' | 'etsy', item: Product) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type, item }));
        e.dataTransfer.effectAllowed = 'move';
        // Add a ghost image or styling here if needed
    };

    const handleDropOnProduct = (e: React.DragEvent, targetItem: Product, targetPlatform: 'shopify' | 'etsy') => {
        e.preventDefault();
        e.stopPropagation();

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        try {
            const { type: draggedType, item: draggedItem } = JSON.parse(rawData);

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
        setShopifyPool(prev => prev.filter(p => p.id !== shopifyItem.id));
        setEtsyPool(prev => prev.filter(p => p.id !== etsyItem.id));

        const newPair: MatchPair = {
            pair_id: `temp-${Date.now()}`,
            shopify: shopifyItem,
            etsy: etsyItem
        };
        setMatchedPairs(prev => [newPair, ...prev]);
    };

    const breakMatch = (pair: MatchPair) => {
        setMatchedPairs(prev => prev.filter(p => p.pair_id !== pair.pair_id));
        setShopifyPool(prev => [pair.shopify, ...prev]);
        setEtsyPool(prev => [pair.etsy, ...prev]);
    };

    const handleSaveClick = async () => {
        setIsSaving(true);
        const payload = matchedPairs.map(p => ({
            shopify_id: p.shopify.id,
            etsy_id: p.etsy.id
        }));
        await onSave(payload);
        setIsSaving(false);
    };

    // --- Sub-components ---

    const EmptyState = ({ message }: { message: string }) => (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
                <Search className="w-5 h-5 opacity-50" />
            </div>
            <p className="text-sm font-medium">{message}</p>
        </div>
    );

    const ProductCard = ({ product, type, isDraggable = true }: { product: Product, type: 'shopify' | 'etsy', isDraggable?: boolean }) => (
        <div
            draggable={isDraggable}
            onDragStart={(e) => isDraggable && handleDragStart(e, type, product)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => isDraggable && handleDropOnProduct(e, product, type)}
            className={`
                group relative p-3 rounded-xl border bg-white flex items-center gap-3 transition-all duration-200
                ${isDraggable
                    ? 'cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5'
                    : 'border-transparent bg-transparent p-0'
                }
                ${isDraggable ? 'border-gray-200 shadow-sm' : ''}
            `}
        >
            {/* Platform indicator strip for draggable items */}
            {isDraggable && (
                <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${type === 'shopify' ? 'bg-green-500' : 'bg-orange-500'} opacity-0 group-hover:opacity-100 transition-opacity`} />
            )}

            {/* Icon / Image */}
            <div className={`
                w-10 h-10 rounded-lg flex shrink-0 items-center justify-center text-xs font-bold ring-1 ring-inset
                ${type === 'shopify' ? 'bg-green-50 text-green-700 ring-green-600/10' : 'bg-orange-50 text-orange-700 ring-orange-600/10'}
            `}>
                {product.image ? (
                    <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                    type === 'shopify' ? 'S' : 'E'
                )}
            </div>

            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                    {product.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 rounded">
                        {product.sku}
                    </span>
                    <span className="text-xs font-medium text-gray-600">
                        ${product.price}
                    </span>
                </div>
            </div>

            {isDraggable && <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden">

            {/* Toolbar */}
            <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center ring-2 ring-white text-[10px] font-bold text-green-700">S</div>
                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center ring-2 ring-white text-[10px] font-bold text-orange-700">E</div>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">Matching Desk</h2>
                    </div>

                    <div className="h-6 w-px bg-gray-200 mx-2"></div>

                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Matches</span>
                            <span className="font-bold text-gray-900">{matchedPairs.length}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Pending</span>
                            <span className="font-bold text-gray-900">{shopifyPool.length + etsyPool.length}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all">
                        Back
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-gray-900 hover:bg-black rounded-xl flex items-center gap-2 shadow-lg shadow-gray-200 hover:shadow-xl transition-all disabled:opacity-70 disabled:shadow-none transform active:scale-95"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden bg-gray-50/50">

                {/* 1. Shopify Pool */}
                <div className="flex-1 flex flex-col min-w-[320px] max-w-sm border-r border-gray-100 bg-white">
                    <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Shopify Inventory
                            </h3>
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                                {shopifyPool.length} items
                            </span>
                        </div>
                        <div className="relative group">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by name or SKU..."
                                value={shopifyFilter}
                                onChange={(e) => setShopifyFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-gray-400"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
                        {shopifyPool
                            .filter(p => p.title.toLowerCase().includes(shopifyFilter.toLowerCase()) || p.sku.includes(shopifyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="shopify" />
                            ))}
                        {shopifyPool.length === 0 && <EmptyState message="No Shopify items left" />}
                    </div>
                </div>

                {/* 2. Matched Zone (Center) */}
                <div className="flex-[1.5] flex flex-col min-w-[420px] bg-gray-50/30 relative">
                    <div className="p-4 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                            <LinkIcon className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold text-blue-900">Matched Pairs</span>
                        </div>
                        <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3" />
                            Drag items to match or unmatch
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {matchedPairs.map((pair) => (
                            <div key={pair.pair_id} className="flex items-stretch bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group overflow-hidden">
                                {/* Shopify Side */}
                                <div className="flex-1 p-3 bg-green-50/10 border-r border-dashed border-gray-200 flex flex-col justify-center">
                                    <ProductCard product={pair.shopify} type="shopify" isDraggable={false} />
                                </div>

                                {/* Linker */}
                                <div className="w-12 bg-gray-50 flex flex-col items-center justify-center border-r border-dashed border-gray-200 relative">
                                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center z-10 shadow-sm">
                                        <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                                    </div>
                                    <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200 -z-0"></div>
                                </div>

                                {/* Etsy Side */}
                                <div className="flex-1 p-3 bg-orange-50/10 border-r border-gray-100 flex flex-col justify-center">
                                    <ProductCard product={pair.etsy} type="etsy" isDraggable={false} />
                                </div>

                                {/* Actions */}
                                <button
                                    onClick={() => breakMatch(pair)}
                                    className="w-12 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all border-l border-transparent hover:border-red-100 bg-gray-50/50"
                                    title="Unmatch"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}

                        {matchedPairs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-[60%] text-gray-400 text-center px-8">
                                <div className="w-20 h-20 rounded-3xl bg-white border-2 border-dashed border-gray-200 flex items-center justify-center mb-6 shadow-sm rotate-3">
                                    <LinkIcon className="w-8 h-8 text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-bold text-lg mb-2">Ready to Match</h3>
                                <p className="text-sm max-w-xs leading-relaxed">
                                    Drag items from the Shopify or Etsy pools and drop them here to create a new synced pair.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Etsy Pool */}
                <div className="flex-1 flex flex-col min-w-[320px] max-w-sm border-l border-gray-100 bg-white">
                    <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Etsy Inventory
                            </h3>
                            <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
                                {etsyPool.length} items
                            </span>
                        </div>
                        <div className="relative group">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by name or SKU..."
                                value={etsyFilter}
                                onChange={(e) => setEtsyFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all placeholder:text-gray-400"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
                        {etsyPool
                            .filter(p => p.title.toLowerCase().includes(etsyFilter.toLowerCase()) || p.sku.includes(etsyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="etsy" />
                            ))}
                        {etsyPool.length === 0 && <EmptyState message="No Etsy items left" />}
                    </div>
                </div>

            </div>
        </div>
    );
}
