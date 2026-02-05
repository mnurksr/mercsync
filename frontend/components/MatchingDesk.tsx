'use client';

import { useState, useRef, useEffect } from 'react';
import {
    GripVertical, X, ArrowRight, Save, Link as LinkIcon, Search,
    Loader2, Sparkles, Filter, Layers, Unlink
} from 'lucide-react';

// --- Types ---
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
    // --- State ---
    const [matchedPairs, setMatchedPairs] = useState<MatchPair[]>(initialData.matched || []);
    const [shopifyPool, setShopifyPool] = useState<Product[]>(initialData.unmatched_shopify || []);
    const [etsyPool, setEtsyPool] = useState<Product[]>(initialData.unmatched_etsy || []);
    const [isSaving, setIsSaving] = useState(false);

    // Filter State
    const [shopifyFilter, setShopifyFilter] = useState('');
    const [etsyFilter, setEtsyFilter] = useState('');

    // Sync Props
    const [prevInitialData, setPrevInitialData] = useState(initialData);
    if (initialData !== prevInitialData) {
        setMatchedPairs(initialData.matched || []);
        setShopifyPool(initialData.unmatched_shopify || []);
        setEtsyPool(initialData.unmatched_etsy || []);
        setPrevInitialData(initialData);
    }

    // --- Actions ---

    const createMatch = (shopifyItem: Product, etsyItem: Product) => {
        // Optimistic UI update with transition delay simulation could go here
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

    // --- Drag & Drop Handlers ---

    // We store the dragged item type in dataTransfer to validate drop zones
    const handleDragStart = (e: React.DragEvent, type: 'shopify' | 'etsy', item: Product) => {
        const data = JSON.stringify({ type, item });
        e.dataTransfer.setData('application/json', data);
        e.dataTransfer.effectAllowed = 'move';

        // Optional: Custom drag image could be set here
    };

    const handleDropOnProduct = (e: React.DragEvent, targetItem: Product, targetPlatform: 'shopify' | 'etsy') => {
        e.preventDefault();
        e.stopPropagation();

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        try {
            const { type: draggedType, item: draggedItem } = JSON.parse(rawData);
            // Allow match only if platforms are different
            if (draggedType !== targetPlatform && draggedType !== 'pair') {
                createMatch(
                    draggedType === 'shopify' ? draggedItem : targetItem,
                    draggedType === 'etsy' ? draggedItem : targetItem
                );
            }
        } catch (err) { console.error(err); }
    };

    // Allow dropping on the main "Matched" zone to auto-match? 
    // For now, dropping on a specific item is safer/clearer logic.
    // But dropping ANY item into the center zone could maybe just "park" it? 
    // Current requirement: Match Pairs. So user must drop S onto E or E onto S.

    // --- Sub-Components ---

    const SearchBar = ({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder: string }) => (
        <div className="relative group mb-4">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl transition-all duration-200 outline-none placeholder:text-gray-400 font-medium"
            />
        </div>
    );

    const ProductCard = ({ product, type, isDraggable = true }: { product: Product, type: 'shopify' | 'etsy', isDraggable?: boolean }) => {
        const isShopify = type === 'shopify';
        const accentColor = isShopify ? 'bg-emerald-500' : 'bg-orange-500';
        const ringColor = isShopify ? 'ring-emerald-500/20' : 'ring-orange-500/20';
        const badgeBg = isShopify ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700';

        return (
            <div
                draggable={isDraggable}
                onDragStart={(e) => isDraggable && handleDragStart(e, type, product)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => isDraggable && handleDropOnProduct(e, product, type)}
                className={`
                    relative group bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition-all duration-300
                    ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-md hover:border-gray-200' : ''}
                    flex items-center gap-3 overflow-hidden
                `}
            >
                {/* Drag Handle Indicator */}
                {isDraggable && (
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
                )}

                {/* Image / Icon */}
                <div className="relative w-12 h-12 rounded-lg bg-gray-50 shrink-0 overflow-hidden ring-1 ring-black/5">
                    {product.image ? (
                        <img
                            src={product.image}
                            alt={product.title}
                            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                        />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center font-bold text-xs ${badgeBg}`}>
                            {isShopify ? 'SHP' : 'ETS'}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate pr-4" title={product.title}>
                        {product.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
                            {product.sku}
                        </span>
                        <span className="text-xs font-bold text-gray-700 tabular-nums">
                            ${product.price}
                        </span>
                    </div>
                </div>

                {/* Hover Drag Icon */}
                {isDraggable && (
                    <GripVertical className="w-4 h-4 text-gray-300 absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0" />
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-180px)] min-h-[700px] bg-[#FAFAFA] rounded-3xl border border-gray-200 overflow-hidden font-sans">

            {/* Header / Stats Bar */}
            <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-8">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-blue-600" />
                        Matching Desk
                    </h2>

                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Synced</span>
                            <span className="text-lg font-bold text-gray-900 leading-none">{matchedPairs.length}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-100"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Pending</span>
                            <span className="text-lg font-bold text-orange-600 leading-none">{shopifyPool.length + etsyPool.length}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all">
                        Back
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-xl shadow-lg shadow-gray-200 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-70 disabled:shadow-none"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Matches
                    </button>
                </div>
            </div>

            {/* Main Workspace - 3 Column Grid */}
            <div className="flex-1 grid grid-cols-4 gap-0 overflow-hidden divide-x divide-gray-100">

                {/* 1. Left Pool: Shopify (25%) */}
                <div className="col-span-1 bg-white flex flex-col min-w-0">
                    <div className="p-5 pb-0">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Shopify Store
                            </h3>
                            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-md">
                                {shopifyPool.length}
                            </span>
                        </div>
                        <SearchBar value={shopifyFilter} onChange={setShopifyFilter} placeholder="Filter items..." />
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 custom-scrollbar">
                        {shopifyPool
                            .filter(p => p.title.toLowerCase().includes(shopifyFilter.toLowerCase()) || p.sku.includes(shopifyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="shopify" />
                            ))}
                    </div>
                </div>

                {/* 2. Middle Zone: Matched (50%) */}
                <div className="col-span-2 bg-gray-50/50 flex flex-col min-w-0 relative shadow-[inset_0_0_20px_rgba(0,0,0,0.01)]">
                    <div className="p-4 flex items-center justify-center shrink-0">
                        <div className="bg-white px-4 py-1.5 rounded-full border border-gray-200 shadow-sm flex items-center gap-2">
                            <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs font-bold text-gray-600">Active Matches</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 custom-scrollbar">
                        {matchedPairs.map((pair) => (
                            <div key={pair.pair_id} className="relative group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 flex items-stretch overflow-hidden">
                                {/* Left Part */}
                                <div className="flex-1 p-3 flex flex-col justify-center border-r border-dashed border-gray-100 bg-gradient-to-r from-emerald-50/30 to-transparent">
                                    <ProductCard product={pair.shopify} type="shopify" isDraggable={false} />
                                </div>

                                {/* Connector */}
                                <div className="w-12 flex flex-col items-center justify-center relative">
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-full h-0.5 bg-gray-100"></div>
                                    </div>
                                    <div className="z-10 w-8 h-8 rounded-full bg-white border border-blue-100 shadow-sm flex items-center justify-center group-hover:border-red-200 transition-colors">
                                        <LinkIcon className="w-3.5 h-3.5 text-blue-400 group-hover:hidden" />
                                        <Unlink className="w-3.5 h-3.5 text-red-500 hidden group-hover:block" />
                                    </div>
                                </div>

                                {/* Right Part */}
                                <div className="flex-1 p-3 flex flex-col justify-center border-l border-dashed border-gray-100 bg-gradient-to-l from-orange-50/30 to-transparent">
                                    <ProductCard product={pair.etsy} type="etsy" isDraggable={false} />
                                </div>

                                {/* Overlay Action Button */}
                                <button
                                    onClick={() => breakMatch(pair)}
                                    className="absolute inset-0 w-full h-full cursor-pointer z-20 opacity-0 bg-transparent flex items-center justify-center"
                                    title="Click to unmatch"
                                >
                                    <span className="sr-only">Unmatch</span>
                                </button>
                            </div>
                        ))}

                        {matchedPairs.length === 0 && (
                            <div className="flex flex-col items-center justify-center mt-20 opacity-40 select-none">
                                <img
                                    src="https://cdn-icons-png.flaticon.com/512/7486/7486744.png"
                                    className="w-24 h-24 mb-4 grayscale opacity-50"
                                    alt="Empty"
                                />
                                <p className="text-sm font-semibold text-gray-400">Workspace Empty</p>
                                <p className="text-xs text-gray-300">Drag items to pair them up</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Right Pool: Etsy (25%) */}
                <div className="col-span-1 bg-white flex flex-col min-w-0">
                    <div className="p-5 pb-0">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Etsy Store
                            </h3>
                            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-md">
                                {etsyPool.length}
                            </span>
                        </div>
                        <SearchBar value={etsyFilter} onChange={setEtsyFilter} placeholder="Filter items..." />
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 custom-scrollbar">
                        {etsyPool
                            .filter(p => p.title.toLowerCase().includes(etsyFilter.toLowerCase()) || p.sku.includes(etsyFilter))
                            .map(product => (
                                <ProductCard key={product.id} product={product} type="etsy" />
                            ))}
                    </div>
                </div>

            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(0,0,0,0.05);
                    border-radius: 20px;
                }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(0,0,0,0.1);
                }
            `}</style>
        </div>
    );
}
