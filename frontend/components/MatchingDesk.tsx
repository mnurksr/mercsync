'use client';

import { useState, useEffect } from 'react';
import {
    GripVertical, X, Save, Search, Loader2, Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

    // State Sync
    const [prevInitialData, setPrevInitialData] = useState(initialData);
    if (initialData !== prevInitialData) {
        setMatchedPairs(initialData.matched || []);
        setShopifyPool(initialData.unmatched_shopify || []);
        setEtsyPool(initialData.unmatched_etsy || []);
        setPrevInitialData(initialData);
    }

    // --- Actions ---
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

    // --- Drag & Drop ---
    const handleDragStart = (e: React.DragEvent, type: 'shopify' | 'etsy', item: Product) => {
        const data = JSON.stringify({ type, item });
        e.dataTransfer.setData('application/json', data);
        e.dataTransfer.effectAllowed = 'move';
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
        } catch (err) { console.error(err); }
    };

    // --- Components ---
    const SearchBar = ({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder: string }) => (
        <div className="relative group mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none placeholder:text-gray-400 font-medium shadow-sm"
            />
        </div>
    );

    // Animated Connector Line
    const AnimatedConnector = () => (
        <div className="flex flex-col items-center justify-center w-16 relative overflow-visible">
            <svg width="60" height="20" viewBox="0 0 60 20" className="absolute top-1/2 -translate-y-1/2 pointer-events-none">
                <motion.path
                    d="M 0 10 C 20 10, 40 10, 60 10"
                    fill="transparent"
                    stroke="url(#gradient-line)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: "5, 5", strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: -20 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />
                <defs>
                    <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#F97316" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="w-6 h-6 rounded-full bg-white border border-gray-200 z-10 flex items-center justify-center shadow-sm">
                <LinkIcon className="w-3 h-3 text-gray-400" />
            </div>
        </div>
    );

    const ProductCard = ({ product, type, isDraggable = true, index = 0 }: { product: Product, type: 'shopify' | 'etsy', isDraggable?: boolean, index?: number }) => {
        const isShopify = type === 'shopify';
        const accentColor = isShopify ? 'bg-emerald-500' : 'bg-orange-500';
        const glowColor = isShopify ? 'rgba(16, 185, 129, 0.4)' : 'rgba(249, 115, 22, 0.4)';
        const badgeBg = isShopify ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700';

        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                draggable={isDraggable}
                onDragStart={(e) => {
                    if (isDraggable) handleDragStart(e as any, type, product);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => isDraggable && handleDropOnProduct(e as any, product, type)}
                whileHover={{
                    scale: 1.02,
                    boxShadow: `0 4px 20px -5px ${glowColor}`,
                    borderColor: 'transparent'
                }}
                whileTap={{ scale: 0.98 }}
                className={`
                    group relative bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm h-20
                    ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}
                    flex items-center gap-3 overflow-hidden select-none will-change-transform z-0 hover:z-10
                `}
            >
                {isDraggable && (
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
                )}

                <div className="relative w-12 h-full rounded-lg bg-gray-50 shrink-0 overflow-hidden ring-1 ring-black/5">
                    {product.image ? (
                        <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center font-bold text-[10px] ${badgeBg}`}>
                            {isShopify ? 'SHP' : 'ETS'}
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                    <h4 className="text-xs font-semibold text-gray-900 truncate pr-4 leading-tight mb-1" title={product.title}>
                        {product.title || 'Unknown Product'}
                    </h4>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {product.sku || 'No SKU'}
                        </span>
                        <span className="text-[10px] font-bold text-gray-700">
                            ${product.price}
                        </span>
                    </div>
                </div>

                {isDraggable && (
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all" />
                )}
            </motion.div>
        );
    };

    return (
        <div className="flex flex-col gap-6 w-full font-sans max-h-screen overflow-hidden">

            {/* Page Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Matches Review</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        <span className="font-semibold text-blue-600">{matchedPairs.length}</span> linked pairs,
                        <span className="font-semibold text-orange-600 ml-1">{shopifyPool.length + etsyPool.length}</span> pending items.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-70"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save & Continue
                    </button>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-4 gap-8 items-start h-[calc(100vh-180px)]">

                {/* Left Sidebar: Shopify - Sticky */}
                <div className="col-span-1 h-full flex flex-col">
                    <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50 shadow-sm flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Shopify
                            </h3>
                            <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {shopifyPool.length}
                            </span>
                        </div>
                        <div className="shrink-0">
                            <SearchBar value={shopifyFilter} onChange={setShopifyFilter} placeholder="Search shopify..." />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar overscroll-contain">
                            <AnimatePresence>
                                {shopifyPool
                                    .filter(p => (p.title || '').toLowerCase().includes(shopifyFilter.toLowerCase()) || (p.sku || '').toLowerCase().includes(shopifyFilter.toLowerCase()))
                                    .map((product, i) => (
                                        <ProductCard key={product.id} product={product} type="shopify" index={i} />
                                    ))}
                            </AnimatePresence>
                            {shopifyPool.length === 0 && (
                                <div className="text-center py-10 text-xs text-gray-400">No items found</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center Column: Matches */}
                <div className="col-span-2 h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar overscroll-contain pb-10">
                        <AnimatePresence>
                            {matchedPairs.map((pair, i) => (
                                <motion.div
                                    key={pair.pair_id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    layout
                                    className="relative group bg-white p-2 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all flex items-center gap-2 z-0 hover:z-10"
                                >
                                    <div className="flex-1">
                                        <ProductCard product={pair.shopify} type="shopify" isDraggable={false} />
                                    </div>

                                    <AnimatedConnector />

                                    <div className="flex-1">
                                        <ProductCard product={pair.etsy} type="etsy" isDraggable={false} />
                                    </div>

                                    <button
                                        onClick={() => breakMatch(pair)}
                                        className="absolute -right-2 -top-2 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-200 rounded-full p-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-all z-20 hover:scale-110"
                                        title="Unlink"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {matchedPairs.length === 0 && (
                            <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center h-full flex flex-col items-center justify-center">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                    <LinkIcon className="w-8 h-8 text-blue-400" />
                                </div>
                                <h3 className="text-gray-900 font-bold mb-2">No Matches Created Yet</h3>
                                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                                    Drag items from the left (Shopify) and right (Etsy) panels here to link them together.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: Etsy */}
                <div className="col-span-1 h-full flex flex-col">
                    <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50 shadow-sm flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Etsy
                            </h3>
                            <span className="bg-orange-50 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {etsyPool.length}
                            </span>
                        </div>
                        <div className="shrink-0">
                            <SearchBar value={etsyFilter} onChange={setEtsyFilter} placeholder="Search etsy..." />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pl-1 custom-scrollbar overscroll-contain">
                            <AnimatePresence>
                                {etsyPool
                                    .filter(p => (p.title || '').toLowerCase().includes(etsyFilter.toLowerCase()) || (p.sku || '').toLowerCase().includes(etsyFilter.toLowerCase()))
                                    .map((product, i) => (
                                        <ProductCard key={product.id} product={product} type="etsy" index={i} />
                                    ))}
                            </AnimatePresence>
                            {etsyPool.length === 0 && (
                                <div className="text-center py-10 text-xs text-gray-400">No items found</div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
