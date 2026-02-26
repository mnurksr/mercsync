'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getStagingProducts, clearStagingTables, type StagingProduct } from '@/app/actions/staging';
import { getShopifyLocations } from '@/app/actions/shop';
import {
    ArrowLeft, ShoppingBag, Store, RefreshCw, Search,
    Check, X, Loader2, Link2, Sparkles, Wand2, ArrowRight, RotateCcw, Copy,
    ChevronDown, ChevronRight, AlertTriangle, Layers, Package, GitBranch, ArrowDownUp, Plus, Info, Pencil, Trash2
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

type ProductGroup = {
    id: string; // shopifyProductlId or etsyListingId
    title: string;
    imageUrl: string;
    platform: 'shopify' | 'etsy';
    variants: StagingProduct[];
};

type VariantMatch = {
    shopify: StagingProduct;
    etsy: StagingProduct | null;
};

type MatchedGroup = {
    id: string;
    shopify: ProductGroup | null;
    etsy: ProductGroup | null;
    variantMatches: VariantMatch[];
    unmatchedShopifyVariants: StagingProduct[];
    unmatchedEtsyVariants: StagingProduct[];
    single?: 'shopify' | 'etsy';
    type?: 'MATCHED' | 'SHOPIFY_ONLY' | 'ETSY_ONLY';
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

type ReconcileGroup = {
    id: string;
    title: string;
    shopify: ProductGroup | null;
    etsy: ProductGroup | null;
    items: ReconcileItem[];
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


// Helper to clean parent title (Shopify: keep as is, Etsy: remove variant suffixes)
const cleanParentTitle = (title: string, platform: 'shopify' | 'etsy') => {
    // User requested to clean Shopify titles too (remove variant suffixes like " - $100")
    return title.split(' - ')[0];
};

// Helper to match variants
const matchVariants = (shopify: ProductGroup | null, etsy: ProductGroup | null) => {
    const matches: VariantMatch[] = [];
    const unmatchedShopify: StagingProduct[] = [];
    const unmatchedEtsy: StagingProduct[] = [];

    if (!shopify && !etsy) return { matches, unmatchedShopify, unmatchedEtsy };

    if (!shopify && etsy) {
        return { matches, unmatchedShopify, unmatchedEtsy: [...etsy.variants] };
    }
    if (shopify && !etsy) {
        return { matches, unmatchedShopify: [...shopify.variants], unmatchedEtsy };
    }

    // Both exist
    const sVars = [...(shopify!.variants || [])];
    const eVars = [...(etsy!.variants || [])];

    // 1. Match by SKU
    for (let i = 0; i < sVars.length; i++) {
        const s = sVars[i];
        if (s.sku) {
            const eIndex = eVars.findIndex(e => e.sku === s.sku);
            if (eIndex !== -1) {
                matches.push({ shopify: s, etsy: eVars[eIndex] });
                sVars.splice(i, 1);
                i--;
                eVars.splice(eIndex, 1);
            }
        }
    }

    return {
        matches,
        unmatchedShopify: sVars,
        unmatchedEtsy: eVars
    };
};

function DraggableProductCard({ group, side, onDragStart, onDrop, onDragOver, onDragEnd, isSelected, onClick }: {
    group: ProductGroup,
    side: 'shopify' | 'etsy',
    onDragStart: (e: React.DragEvent, group: ProductGroup, from: 'shopify' | 'etsy') => void,
    onDragEnd: () => void,
    onDrop?: (e: React.DragEvent, target: ProductGroup) => void,
    onDragOver?: (e: React.DragEvent) => void,
    isSelected?: boolean,
    onClick?: () => void
}) {
    const [isOver, setIsOver] = useState(false);

    return (
        <div
            draggable
            onClick={onClick}
            onDragStart={(e) => {
                e.dataTransfer.setData('group_data', JSON.stringify({ group, side }));
                onDragStart(e, group, side);
            }}
            onDragEnd={onDragEnd}
            onDrop={(e) => {
                setIsOver(false);
                onDrop && onDrop(e, group);
            }}
            onDragEnter={() => onDrop && setIsOver(true)}
            onDragLeave={() => setIsOver(false)}
            onDragOver={(e) => {
                if (onDragOver) {
                    onDragOver(e);
                } else if (onDrop) {
                    e.preventDefault();
                    if (!isOver) setIsOver(true);
                }
            }}
            className={`p-3 bg-white rounded-lg border shadow-sm cursor-grab active:cursor-grabbing transition-all relative
                ${side === 'shopify' ? 'border-l-4 border-l-[#95BF47]' : 'border-r-4 border-r-[#F56400]'}
                ${isOver ? 'ring-2 ring-blue-400 bg-blue-50 scale-[1.02]' : 'hover:shadow-md'}
                ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
            `}
        >
            {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                    {group.imageUrl ? (
                        <img src={group.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                            {side === 'shopify' ? <ShoppingBag size={16} /> : <Store size={16} />}
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate" title={group.title}>
                        {cleanParentTitle(group.title, side)}
                    </p>
                    <p className="text-xs text-gray-500">
                        {group.variants.length} variants
                    </p>
                </div>
            </div>
        </div>
    );
}

function MatchedParentCard({ match, onRemove, onUpdate }: { match: MatchedGroup, onRemove: (id: string) => void, onUpdate: (m: MatchedGroup) => void }) {
    const [expanded, setExpanded] = useState(true);

    const sGroup = match.shopify;
    const eGroup = match.etsy;

    // Determine titles (Cleaned)
    const sTitle = sGroup ? cleanParentTitle(sGroup.title, 'shopify') : '';
    const eTitle = eGroup ? cleanParentTitle(eGroup.title, 'etsy') : '';

    const isLinked = match.type === 'MATCHED' || (!match.type && sGroup && eGroup);

    // --- D&D Logic ---
    const handleVariantDragStart = (e: React.DragEvent, variant: StagingProduct, source: 'shopify' | 'etsy') => {
        e.dataTransfer.setData('variant_data', JSON.stringify({
            id: variant.platformId,
            source,
            variant
        }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleLink = (s: StagingProduct, e: StagingProduct) => {
        const newUnmatchedShopify = match.unmatchedShopifyVariants.filter(v => v.platformId !== s.platformId);
        const newUnmatchedEtsy = match.unmatchedEtsyVariants.filter(v => v.platformId !== e.platformId);

        onUpdate({
            ...match,
            variantMatches: [...match.variantMatches, { shopify: s, etsy: e }],
            unmatchedShopifyVariants: newUnmatchedShopify,
            unmatchedEtsyVariants: newUnmatchedEtsy
        });
    };

    const handleUnlink = (pairIndex: number) => {
        const pair = match.variantMatches[pairIndex];
        const newMatches = match.variantMatches.filter((_, i) => i !== pairIndex);

        onUpdate({
            ...match,
            variantMatches: newMatches,
            unmatchedShopifyVariants: [...match.unmatchedShopifyVariants, pair.shopify],
            unmatchedEtsyVariants: pair.etsy ? [...match.unmatchedEtsyVariants, pair.etsy] : match.unmatchedEtsyVariants
        });
    };

    const handleDropOnMatch = (e: React.DragEvent, targetSide: 'shopify' | 'etsy', targetVariant: StagingProduct) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const raw = e.dataTransfer.getData('variant_data');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data.variant || !data.source) return;

            // Only allow linking if sources are different
            if (data.source === targetSide) return;

            const movingVariant = data.variant as StagingProduct;
            const s = targetSide === 'shopify' ? targetVariant : movingVariant;
            const eVariant = targetSide === 'etsy' ? targetVariant : movingVariant;

            handleLink(s, eVariant);
        } catch (err) { console.error(err); }
    };

    // --- Group Drop Logic ---
    const handleGroupDrop = (e: React.DragEvent, targetSide: 'shopify' | 'etsy') => {
        e.preventDefault();
        try {
            const raw = e.dataTransfer.getData('group_data');
            if (!raw) return;
            const data = JSON.parse(raw);

            // STRICT PLATFORM MATCHING
            if (data.side !== targetSide) return;

            const newS = targetSide === 'shopify' ? data.group : match.shopify;
            const newE = targetSide === 'etsy' ? data.group : match.etsy;
            const { matches: vm, unmatchedShopify, unmatchedEtsy } = matchVariants(newS, newE);

            onUpdate({
                ...match,
                shopify: newS,
                etsy: newE,
                variantMatches: vm,
                unmatchedShopifyVariants: unmatchedShopify,
                unmatchedEtsyVariants: unmatchedEtsy,
                type: 'MATCHED'
            });
        } catch (err) { console.error(err); }
    };

    // --- Click-to-Match Logic for Variants ---
    const [selectedVariant, setSelectedVariant] = useState<{ id: string, side: 'shopify' | 'etsy' } | null>(null);

    const handleVariantClick = (variant: StagingProduct, side: 'shopify' | 'etsy') => {
        if (!variant.platformId) return;

        if (!selectedVariant) {
            setSelectedVariant({ id: variant.platformId, side });
            return;
        }

        if (selectedVariant.id === variant.platformId) {
            setSelectedVariant(null); // Deselect
            return;
        }

        if (selectedVariant.side === side) {
            setSelectedVariant({ id: variant.platformId, side }); // Switch selection
            return;
        }

        // Match
        const s = selectedVariant.side === 'shopify'
            ? match.unmatchedShopifyVariants.find(v => v.platformId === selectedVariant.id)
            : variant;

        const e = selectedVariant.side === 'etsy'
            ? match.unmatchedEtsyVariants.find(v => v.platformId === selectedVariant.id)
            : variant;

        if (s && e) {
            handleLink(s, e);
        }
        setSelectedVariant(null);
    };

    // Variant Card Component
    const VariantCard = ({ variant, side }: { variant: StagingProduct, side: 'shopify' | 'etsy' }) => {
        // Safe display logic
        const displayTitle = variant.variantTitle && variant.variantTitle !== 'Default Title'
            ? variant.variantTitle
            : (variant.name || 'Base Variant');

        const displaySku = variant.sku && variant.sku !== 'NO-SKU' ? variant.sku : null;

        return (
            <div
                draggable
                onClick={(e) => { e.stopPropagation(); handleVariantClick(variant, side); }}
                onDragStart={(e) => handleVariantDragStart(e, variant, side)}
                onDrop={(e) => handleDropOnMatch(e, side, variant)}
                onDragOver={(e) => e.preventDefault()}
                className={`p-2 rounded border bg-white flex items-center justify-between text-xs cursor-pointer active:cursor-grabbing group hover:shadow-sm transition-all relative
                    ${side === 'shopify' ? 'hover:border-green-300' : 'hover:border-orange-300'}
                    ${selectedVariant?.id === variant.platformId ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-500 z-10' : ''}
                `}
            >
                {selectedVariant?.id === variant.platformId && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border border-white" />
                )}
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-700 truncate" title={displayTitle}>{displayTitle}</p>
                </div>
                {displaySku && (
                    <div className="ml-2 flex-shrink-0">
                        <span className="text-[10px] text-gray-500 font-mono bg-gray-100 px-1 rounded">{displaySku}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden mb-4 transition-all w-full min-w-0 ${isLinked ? 'border-green-200' : 'border-gray-200'}`}>
            {/* Header - Parent Info */}
            <div
                className={`p-3 border-b flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors
                    ${isLinked ? 'bg-green-50/40 border-green-100' : 'bg-gray-50 border-gray-100'}
                `}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 flex-1 items-center min-w-0 mr-4">
                    {/* Shopify Parent */}
                    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                        {sGroup ? (
                            <>
                                <div className="w-10 h-10 rounded-lg bg-white p-0.5 shadow-sm border border-gray-200 flex-shrink-0 overflow-hidden">
                                    {sGroup.imageUrl ? <img src={sGroup.imageUrl} alt="" className="w-full h-full object-cover rounded-md" /> : <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-md"><ShoppingBag className="w-5 h-5 text-gray-400" /></div>}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 truncate" title={sTitle}>{sTitle}</p>
                                    <p className="text-xs text-gray-500 font-medium truncate">{match.variantMatches.length} matches • {match.unmatchedShopifyVariants.length} unmatched</p>
                                </div>
                            </>
                        ) : (
                            <div
                                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500 font-medium hover:border-[#95BF47] hover:text-[#95BF47] hover:bg-green-50 transition-all bg-white"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-green-100', 'border-green-400', 'scale-[1.02]'); }}
                                onDragLeave={(e) => { e.currentTarget.classList.remove('bg-green-100', 'border-green-400', 'scale-[1.02]'); }}
                                onDrop={(e) => { e.stopPropagation(); handleGroupDrop(e, 'shopify'); }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Drop Shopify Product
                            </div>
                        )}
                    </div>

                    {/* Link Icon */}
                    <div className="flex-shrink-0 w-8 flex justify-center">
                        {isLinked ? (
                            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shadow-sm border border-green-200">
                                <Link2 className="w-4 h-4 text-green-700" />
                            </div>
                        ) : (
                            <div className="w-7 h-7 flex items-center justify-center">
                                <span className="text-gray-300 text-xl">•</span>
                            </div>
                        )}
                    </div>

                    {/* Etsy Parent */}
                    <div className="flex items-center gap-3 min-w-0 justify-end text-right overflow-hidden">
                        {eGroup ? (
                            <>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 truncate" title={eTitle}>{eTitle}</p>
                                    <p className="text-xs text-gray-500 font-medium truncate">{match.variantMatches.length} matches • {match.unmatchedEtsyVariants.length} unmatched</p>
                                </div>
                                <div className="w-10 h-10 rounded-lg bg-white p-0.5 shadow-sm border border-gray-200 flex-shrink-0 overflow-hidden">
                                    {eGroup.imageUrl ? <img src={eGroup.imageUrl} alt="" className="w-full h-full object-cover rounded-md" /> : <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-md"><Store className="w-5 h-5 text-gray-400" /></div>}
                                </div>
                            </>
                        ) : (
                            <div
                                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500 font-medium hover:border-[#F56400] hover:text-[#F56400] hover:bg-orange-50 transition-all bg-white"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-orange-100', 'border-orange-400', 'scale-[1.02]'); }}
                                onDragLeave={(e) => { e.currentTarget.classList.remove('bg-orange-100', 'border-orange-400', 'scale-[1.02]'); }}
                                onDrop={(e) => { e.stopPropagation(); handleGroupDrop(e, 'etsy'); }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Drop Etsy Product
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 pl-4 border-l border-gray-200 flex-shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(match.id); }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-10 relative"
                        title={isLinked ? "Unlink Parent Match" : "Remove Card"}
                    >
                        <X className="w-5 h-5 hover:scale-110 transition-transform" />
                    </button>
                    {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
            </div>

            {/* Body */}
            {expanded && (
                <div className="bg-gray-50/30 p-4 space-y-4">
                    {/* Linked Pairs */}
                    {match.variantMatches.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex justify-between px-2">
                                <span>Matched Variants</span>
                                <span>{match.variantMatches.length} pairs</span>
                            </div>
                            {match.variantMatches.map((vm, idx) => (
                                <div key={idx} className="flex items-center gap-2 group">
                                    {/* Shopify Matched Item */}
                                    <div className="flex-1 min-w-0">
                                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-900 flex items-center justify-between">
                                            <span className="truncate font-medium">{vm.shopify.variantTitle && vm.shopify.variantTitle !== 'Default Title' ? vm.shopify.variantTitle : vm.shopify.name}</span>
                                            {vm.shopify.sku && <span className="text-[10px] text-green-700 opacity-70 ml-2 font-mono bg-green-100 px-1 rounded">{vm.shopify.sku}</span>}
                                        </div>
                                    </div>

                                    {/* Unlink Action */}
                                    <button
                                        onClick={() => handleUnlink(idx)}
                                        className="p-1 rounded-full bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Link2 className="w-3 h-3" />
                                    </button>

                                    {/* Etsy Matched Item - Now mirrored style to be consistent with Shopify box */}
                                    <div className="flex-1 min-w-0">
                                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-900 flex items-center justify-between">
                                            {/* Title Left, SKU Right (Just like Shopify) */}
                                            {vm.etsy ? (
                                                <>
                                                    <span className="truncate font-medium">{vm.etsy.variantTitle && vm.etsy.variantTitle !== 'Default Title' ? vm.etsy.variantTitle : vm.etsy.name}</span>
                                                    {vm.etsy.sku && <span className="text-[10px] text-green-700 opacity-70 ml-2 font-mono bg-green-100 px-1 rounded">{vm.etsy.sku}</span>}
                                                </>
                                            ) : (
                                                <span className="text-gray-400 italic">No Match</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Unmatched Lists */}
                    {(match.unmatchedShopifyVariants.length > 0 || match.unmatchedEtsyVariants.length > 0) && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                            {/* Shopify Unmatched */}
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                                    Unmatched Shopify
                                </div>
                                {match.unmatchedShopifyVariants.map(s => (
                                    <VariantCard key={s.platformId} variant={s} side="shopify" />
                                ))}
                                {match.unmatchedShopifyVariants.length === 0 && <div className="text-gray-300 text-xs italic p-2">None</div>}
                            </div>

                            {/* Etsy Unmatched */}
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right px-1">
                                    Unmatched Etsy
                                </div>
                                {match.unmatchedEtsyVariants.map(e => (
                                    <VariantCard key={e.platformId} variant={e} side="etsy" />
                                ))}
                                {match.unmatchedEtsyVariants.length === 0 && <div className="text-gray-300 text-xs italic p-2 text-right">None</div>}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// (AccordionRow and getGroupType removed — replaced by wizard step components below)

// (AccordionRow body removed — wizard components handle rendering)

// Cache
const getCache = (): any => {
    return null;
};

type CrossListingVariant = {
    source_variant_id: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    selected?: boolean;
};

type CrossListingItem = {
    source_id: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    description?: string;
    image?: string;
    variants?: CrossListingVariant[];
};

type CloneModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: CrossListingItem) => void;
    sourceGroup: ReconcileGroup | null;
    targetPlatform: 'shopify' | 'etsy';
    initialData?: CrossListingItem;
};

function CloneModal({ isOpen, onClose, onConfirm, sourceGroup, targetPlatform, initialData }: CloneModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        sku: '',
        price: 0,
        stock: 0,
        description: '',
        image: '',
        variants: [] as CrossListingVariant[]
    });

    useEffect(() => {
        if (isOpen && sourceGroup) {
            const platform = sourceGroup.single || sourceGroup.items.find(i => i.single)?.single;
            const srcItem = platform === 'shopify' ? sourceGroup.items[0]?.shopify : sourceGroup.items[0]?.etsy;
            const missingItems = sourceGroup.items.filter(i => i.single === platform);

            if (initialData) {
                const initialVariants = missingItems.map(item => {
                    const v = platform === 'shopify' ? item.shopify : item.etsy;
                    const existingData = initialData.variants?.find(iv => iv.source_variant_id === v?.platformId);
                    if (existingData) {
                        return { ...existingData, selected: true };
                    }
                    return {
                        source_variant_id: v?.platformId || '',
                        title: v?.variantTitle || v?.name || '',
                        sku: v?.sku || '',
                        price: v?.price ?? 0,
                        stock: v?.stockQuantity ?? 0,
                        selected: false
                    };
                });

                setFormData({
                    title: initialData.title,
                    sku: initialData.sku || '',
                    price: initialData.price,
                    stock: initialData.stock,
                    description: initialData.description || '',
                    image: initialData.image || '',
                    variants: initialVariants
                });
            } else {
                const initialVariants = missingItems.map(item => {
                    const v = platform === 'shopify' ? item.shopify : item.etsy;
                    return {
                        source_variant_id: v?.platformId || '',
                        title: v?.variantTitle || v?.name || '',
                        sku: v?.sku || '',
                        price: v?.price ?? 0,
                        stock: v?.stockQuantity ?? 0,
                        selected: true
                    };
                });

                setFormData({
                    title: sourceGroup.title || '',
                    sku: srcItem?.sku || '',
                    price: srcItem?.price || 0,
                    stock: srcItem?.stockQuantity || 0,
                    description: '',
                    image: srcItem?.imageUrl || '',
                    variants: initialVariants
                });
            }
        }
    }, [isOpen, initialData, sourceGroup]);

    const handleInputChange = (field: keyof typeof formData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleVariantChange = (index: number, field: keyof CrossListingVariant, value: string | number) => {
        setFormData(prev => {
            const newVariants = [...prev.variants];
            newVariants[index] = { ...newVariants[index], [field]: value };
            return { ...prev, variants: newVariants };
        });
    };

    const handleVariantToggle = (index: number) => {
        setFormData(prev => {
            const newVariants = [...prev.variants];
            newVariants[index] = { ...newVariants[index], selected: !newVariants[index].selected };
            return { ...prev, variants: newVariants };
        });
    };

    if (!isOpen || !sourceGroup) return null;

    const sourcePlatform = sourceGroup.single || sourceGroup.items.find(i => i.single)?.single || 'shopify';
    const SourceIcon = sourcePlatform === 'shopify' ? ShoppingBag : Store;
    const TargetIcon = targetPlatform === 'shopify' ? ShoppingBag : Store;
    const isEditing = !!initialData;

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg">{isEditing ? 'Edit Clone' : 'Clone Product'}</h3>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold capitalize">
                            <SourceIcon className="w-4 h-4" />
                            {sourcePlatform}
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/60" />
                        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold capitalize">
                            <TargetIcon className="w-4 h-4" />
                            {targetPlatform}
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    {/* Image Preview + Title */}
                    <div className="flex gap-4 items-start">
                        <div className="w-20 h-20 rounded-xl bg-gray-100/80 flex-shrink-0 overflow-hidden border-2 border-gray-200 shadow-sm">
                            {formData.image ? (
                                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <Package className="w-8 h-8" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Product Title</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={e => handleInputChange('title', e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                    </div>

                    {/* Image Info Note */}
                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700 leading-relaxed">
                            This is just a preview thumbnail. <span className="font-semibold">All images</span> from the source listing will be included in the clone automatically.
                        </p>
                    </div>

                    {/* Grid: Price, Stock, SKU */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Base Price</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">$</span>
                                <input
                                    type="number"
                                    value={formData.price}
                                    onChange={e => handleInputChange('price', parseFloat(e.target.value) || 0)}
                                    className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Stock</label>
                            <input
                                type="number"
                                value={formData.stock}
                                onChange={e => handleInputChange('stock', parseInt(e.target.value) || 0)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Base SKU</label>
                            <input
                                type="text"
                                value={formData.sku}
                                onChange={e => handleInputChange('sku', e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                    </div>

                    {/* Variant Editor (If multiple) */}
                    {formData.variants.length > 1 && (
                        <div className="mt-4 border-t border-gray-100 pt-5">
                            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                Variants ({formData.variants.length})
                            </h4>
                            <div className="space-y-3">
                                {formData.variants.map((v, i) => (
                                    <div key={i} className={`grid grid-cols-12 gap-3 items-center p-3 rounded-xl border transition-all ${v.selected === false ? 'bg-gray-50/50 border-gray-100 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="col-span-12 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Variant Name</label>
                                            <input
                                                type="text"
                                                value={v.title}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'title', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">SKU</label>
                                            <input
                                                type="text"
                                                value={v.sku}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'sku', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Price</label>
                                            <input
                                                type="number"
                                                value={v.price}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'price', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Stock</label>
                                            <input
                                                type="number"
                                                value={v.stock}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'stock', parseInt(e.target.value) || 0)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-12 md:col-span-1 flex items-end justify-center pb-1">
                                            <button
                                                type="button"
                                                onClick={() => handleVariantToggle(i)}
                                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${v.selected !== false
                                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                                    : 'bg-white border text-gray-400 hover:text-indigo-600 hover:border-indigo-200'
                                                    }`}
                                                title={v.selected !== false ? "Include Variant" : "Exclude Variant"}
                                            >
                                                {v.selected !== false && <Check className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
                        <textarea
                            rows={2}
                            value={formData.description}
                            onChange={e => handleInputChange('description', e.target.value)}
                            placeholder="Optional product description..."
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            const platform = sourceGroup.single || sourceGroup.items.find(i => i.single)?.single;
                            const srcItem = platform === 'shopify' ? sourceGroup.items[0]?.shopify : sourceGroup.items[0]?.etsy;
                            const sourceId = platform === 'shopify' ? srcItem?.shopifyProductId : srcItem?.etsyListingId;
                            if (!sourceId) return;

                            const selectedVariants = formData.variants.filter(v => v.selected !== false);

                            onConfirm({
                                source_id: sourceId,
                                title: formData.title,
                                sku: formData.sku,
                                price: formData.price,
                                stock: formData.stock,
                                description: formData.description,
                                image: formData.image,
                                variants: selectedVariants
                            });
                        }}
                        className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-200 text-sm flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        {isEditing ? 'Update' : 'Add to Queue'}
                    </button>
                </div>
            </div>
        </div>
    );
}


interface StagingInterfaceProps {
    isSetupMode?: boolean;
    onComplete?: () => void;
    onBack?: () => void;
    userId?: string;
}

export default function StagingInterface({ isSetupMode = false, onComplete, onBack, userId: propUserId }: StagingInterfaceProps) {
    const { user: authUser } = useAuth();
    const router = useRouter();
    const cache = getCache();

    // Use prop userId if available, otherwise fall back to auth user
    const currentUserId = propUserId || authUser?.id;

    // Grouping Helper
    const groupProducts = (products: StagingProduct[], platform: 'shopify' | 'etsy'): ProductGroup[] => {
        const groups: { [key: string]: ProductGroup } = {};

        products.forEach(p => {
            const groupId = platform === 'shopify'
                ? (p.shopifyProductId || p.id)
                : (p.etsyListingId || p.id);

            if (!groups[groupId]) {
                groups[groupId] = {
                    id: groupId,
                    title: p.name, // Parent title usually matches first variant or is explicit
                    imageUrl: p.imageUrl || '',
                    platform,
                    variants: []
                };
            }
            groups[groupId].variants.push(p);
        });

        return Object.values(groups);
    };

    const [shopifyProducts, setShopifyProducts] = useState<StagingProduct[]>(cache?.shopify || []);
    const [etsyProducts, setEtsyProducts] = useState<StagingProduct[]>(cache?.etsy || []);

    // Derived Groups
    const shopifyGroups = useMemo(() => groupProducts(shopifyProducts, 'shopify'), [shopifyProducts]);
    const etsyGroups = useMemo(() => groupProducts(etsyProducts, 'etsy'), [etsyProducts]);

    const [loading, setLoading] = useState(!cache);
    const [matches, setMatches] = useState<MatchedGroup[]>([]);
    const [shopifySearch, setShopifySearch] = useState('');
    const [etsySearch, setEtsySearch] = useState('');
    const [catalogFilter, setCatalogFilter] = useState<'all' | 'shopify' | 'etsy'>('all');

    const [draggedGroup, setDraggedGroup] = useState<{ group: ProductGroup, from: 'shopify' | 'etsy' } | null>(null);
    const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
    const [centerHover, setCenterHover] = useState(false);

    // Location Modal State
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [submittingLocation, setSubmittingLocation] = useState(false);

    const handleGoBack = async () => {
        if (!confirm('Staging verileri temizlenecek ve geri dönülecek. Onaylıyor musunuz?')) return;
        setLoading(true);
        try {
            await clearStagingTables(currentUserId);
            localStorage.removeItem('ms_staging_shopify');
            localStorage.removeItem('ms_staging_etsy');
            setShopifyProducts([]);
            setEtsyProducts([]);
            setMatches([]);
            if (onBack) onBack();
            else router.back();
        } catch (error) {
            console.error('Failed to clear staging tables:', error);
            alert('Staging verileri temizlenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const handleContinueClick = async () => {
        setShowLocationModal(true);
        setLoadingLocations(true);
        try {
            const res = await getShopifyLocations();
            if (res.success && res.data) {
                setLocations(res.data);
                if (res.data.length > 0) {
                    setSelectedLocation(res.data[0].id.toString());
                }
            } else {
                alert(res.message || 'Lokasyonlar yüklenemedi.');
            }
        } catch (error) {
            console.error('Error loading locations:', error);
            alert('Lokasyonlar yüklenirken bir hata oluştu.');
        } finally {
            setLoadingLocations(false);
        }
    };

    const submitLocationAndContinue = async () => {
        if (!selectedLocation) {
            alert('Lütfen bir lokasyon seçin.');
            return;
        }

        setSubmittingLocation(true);
        try {
            const payload = {
                owner_id: currentUserId,
                shopify_location_id: selectedLocation
            };

            const req = await fetch('https://api.mercsync.com/webhook/location-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (req.ok) {
                // Wait for N8N webhook to update the Supabase stock values
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Fetch fresh staging products (since n8n might have updated stockQuantity to matching location)
                const [s, e] = await Promise.all([
                    getStagingProducts('shopify', currentUserId),
                    getStagingProducts('etsy', currentUserId)
                ]);

                setShopifyProducts(s);
                setEtsyProducts(e);

                // Update current matches with fresh stock quantities
                const refreshedMatches = matches.map(m => {
                    const updateGrp = (grp: any, dbList: any[]) => {
                        if (!grp) return null;
                        return {
                            ...grp,
                            variants: grp.variants.map((v: any) => {
                                const fresh = dbList.find(db => db.id === v.id);
                                return fresh ? { ...v, stockQuantity: fresh.stockQuantity } : v;
                            })
                        };
                    };

                    const newSh = updateGrp(m.shopify, s);
                    const newEt = updateGrp(m.etsy, e);

                    return {
                        ...m,
                        shopify: newSh,
                        etsy: newEt,
                        variantMatches: m.variantMatches.map(vm => ({
                            shopify: newSh?.variants.find((v: any) => v.id === vm.shopify.id) || vm.shopify,
                            etsy: newEt?.variants.find((v: any) => v.id === vm.etsy?.id) || vm.etsy
                        })),
                        unmatchedShopifyVariants: m.unmatchedShopifyVariants.map(v => newSh?.variants.find((nv: any) => nv.id === v.id) || v),
                        unmatchedEtsyVariants: m.unmatchedEtsyVariants.map(v => newEt?.variants.find((nv: any) => nv.id === v.id) || v)
                    };
                });

                setMatches(refreshedMatches);
                setShowLocationModal(false);
                openReconciliation(refreshedMatches);
            } else {
                alert('Webhook isteği başarısız oldu. Lütfen tekrar deneyin.');
            }
        } catch (error) {
            console.error('Webhook error:', error);
            alert('Webhook gönderilirken bir hata oluştu.');
        } finally {
            setSubmittingLocation(false);
        }
    };

    const [aiLoading, setAiLoading] = useState(false);

    const [showReconcile, setShowReconcile] = useState(false);
    const [reconcileGroups, setReconcileGroups] = useState<ReconcileGroup[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [savingOverlay, setSavingOverlay] = useState<'loading' | 'success' | null>(null);
    const [activeTab, setActiveTab] = useState<'equalize' | 'catalog'>('equalize');



    // Cross Listing State
    const [crossListing, setCrossListing] = useState<{ to_shopify: CrossListingItem[], to_etsy: CrossListingItem[] }>({ to_shopify: [], to_etsy: [] });
    const [cloneModal, setCloneModal] = useState<{ isOpen: boolean; sourceGroup: ReconcileGroup | null; targetPlatform: 'shopify' | 'etsy'; initialData?: CrossListingItem }>({
        isOpen: false,
        sourceGroup: null,
        targetPlatform: 'shopify'
    });

    const handleCloneClick = (group: ReconcileGroup) => {
        const platform = group.single || group.items.find(i => i.single)?.single;
        if (!platform) return;

        const target = platform === 'shopify' ? 'etsy' : 'shopify';
        const listKey = target === 'shopify' ? 'to_shopify' : 'to_etsy';
        const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;

        const existing = sourceId ? crossListing[listKey].find(i => i.source_id === sourceId) : undefined;

        setCloneModal({
            isOpen: true,
            sourceGroup: group,
            targetPlatform: target,
            initialData: existing
        });
    };

    const handleCloneConfirm = (data: CrossListingItem) => {
        const target = cloneModal.targetPlatform;
        const listKey = target === 'shopify' ? 'to_shopify' : 'to_etsy';

        setCrossListing(prev => {
            const list = prev[listKey];
            const index = list.findIndex(i => i.source_id === data.source_id);

            if (index >= 0) {
                // Update existing
                const newList = [...list];
                newList[index] = data;
                return { ...prev, [listKey]: newList };
            } else {
                // Add new
                return { ...prev, [listKey]: [...list, data] };
            }
        });
        setCloneModal(prev => ({ ...prev, isOpen: false }));
    };

    useEffect(() => { if (currentUserId) load(); }, [currentUserId]);

    const load = async () => {
        try {
            console.log('[StagingInterface] load() called with currentUserId:', currentUserId);
            const [s, e] = await Promise.all([
                getStagingProducts('shopify', currentUserId),
                getStagingProducts('etsy', currentUserId)
            ]);
            console.log('[StagingInterface] loaded products:', { shopify: s.length, etsy: e.length });
            setShopifyProducts(s);
            setEtsyProducts(e);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const unmatchedShopifyGroups = useMemo(() => {
        const matchedIds = new Set(matches.filter(m => m.shopify).map(m => m.shopify!.id));
        let list = shopifyGroups.filter(g => !matchedIds.has(g.id));
        if (shopifySearch) {
            const q = shopifySearch.toLowerCase();
            list = list.filter(g => g.title.toLowerCase().includes(q));
        }
        return list;
    }, [shopifyGroups, matches, shopifySearch]);

    const unmatchedEtsyGroups = useMemo(() => {
        const matchedIds = new Set(matches.filter(m => m.etsy).map(m => m.etsy!.id));
        let list = etsyGroups.filter(g => !matchedIds.has(g.id));
        if (etsySearch) {
            const q = etsySearch.toLowerCase();
            list = list.filter(g => g.title.toLowerCase().includes(q));
        }
        return list;
    }, [etsyGroups, matches, etsySearch]);

    const [selectedGroup, setSelectedGroup] = useState<{ id: string, side: 'shopify' | 'etsy' } | null>(null);

    const handleProductClick = (group: ProductGroup, side: 'shopify' | 'etsy') => {
        if (!selectedGroup) {
            setSelectedGroup({ id: group.id, side });
            return;
        }

        if (selectedGroup.id === group.id) {
            setSelectedGroup(null); // Deselect
            return;
        }

        if (selectedGroup.side === side) {
            setSelectedGroup({ id: group.id, side }); // Switch selection
            return;
        }

        // Match Cross-Platform
        const sourceGroup = selectedGroup.side === 'shopify'
            ? shopifyGroups.find(g => g.id === selectedGroup.id)
            : etsyGroups.find(g => g.id === selectedGroup.id);

        if (!sourceGroup) {
            setSelectedGroup(null);
            return;
        }

        const s = selectedGroup.side === 'shopify' ? sourceGroup : group;
        const e = selectedGroup.side === 'etsy' ? sourceGroup : group;

        // Perform Match - USER REQUEST: Do NOT auto-match variants. All start as unmatched.
        // const { matches: vm, unmatchedShopify, unmatchedEtsy } = matchVariants(s, e);

        const newMatch: MatchedGroup = {
            id: `match-${Date.now()}`,
            shopify: s,
            etsy: e,
            variantMatches: [], // Start empty
            unmatchedShopifyVariants: [...s.variants],
            unmatchedEtsyVariants: [...e.variants],
        };
        setMatches(prev => [...prev, newMatch]);
        setSelectedGroup(null);
    };

    const handleDragStart = (e: React.DragEvent, group: ProductGroup, from: 'shopify' | 'etsy') => {
        if (aiLoading) {
            e.preventDefault();
            return;
        }
        setDraggedGroup({ group, from });
    };

    const handleDragEnd = () => {
        setDraggedGroup(null);
        setDropTargetGroup(null);
        setCenterHover(false);
    };

    const handleDropOnGroup = (target: ProductGroup) => {
        if (!draggedGroup) return;

        // Prevent Same-Platform Matching
        if (draggedGroup.from === target.platform) {
            // Optional: Show error toast here
            return;
        }

        const s = draggedGroup.from === 'shopify' ? draggedGroup.group : target;
        const e = draggedGroup.from === 'etsy' ? draggedGroup.group : target;

        // USER REQUEST: Do NOT auto-match variants. All start as unmatched.
        // const { matches: vm, unmatchedShopify, unmatchedEtsy } = matchVariants(s, e);

        const newMatch: MatchedGroup = {
            id: `match-${Date.now()}`,
            shopify: s,
            etsy: e,
            variantMatches: [], // Start empty
            unmatchedShopifyVariants: [...s.variants],
            unmatchedEtsyVariants: [...e.variants]
        };
        setMatches(prev => [...prev, newMatch]);
        handleDragEnd();
    };

    const handleDropOnCenter = () => {
        if (!draggedGroup) return;

        // Single group has no matches
        const s = draggedGroup.from === 'shopify' ? draggedGroup.group : null;
        const e = draggedGroup.from === 'etsy' ? draggedGroup.group : null;

        const newMatch: MatchedGroup = {
            id: `single-${Date.now()}`,
            shopify: s,
            etsy: e,
            variantMatches: [],
            unmatchedShopifyVariants: s ? [...s.variants] : [],
            unmatchedEtsyVariants: e ? [...e.variants] : [],
            single: draggedGroup.from
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

    const findEtsyGroupByName = (searchName: string, usedIds: Set<string>): ProductGroup | null => {
        const normalized = normalizeName(searchName);
        const searchWords = normalized.split(' ').filter(w => w.length >= 3);
        let bestMatch: ProductGroup | null = null;
        let bestScore = 0;

        for (const g of etsyGroups) {
            if (usedIds.has(g.id)) continue;
            const pNormalized = normalizeName(g.title);
            if (pNormalized === normalized) return g;

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
                bestMatch = g;
            }
        }
        return bestMatch;
    };

    // AI Match
    const aiMatch = async () => {
        if (!currentUserId) {
            console.log('No user ID');
            return;
        }

        console.log('Starting AI Match for user:', currentUserId);
        setAiLoading(true);

        try {
            const res = await fetch('https://api.mercsync.com/webhook/auto-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUserId })
            });

            console.log('AI Response status:', res.status);

            if (res.ok) {
                const json = await res.json();
                const data = Array.isArray(json) ? json[0] : json;
                console.log('AI Response data:', data);

                const newMatches: MatchedGroup[] = [];
                const processedShopifyIds = new Set<string>();
                const processedEtsyIds = new Set<string>();

                // 1. Process LINKED Products (Center Column) with Variants
                if (data.linked_products && Array.isArray(data.linked_products)) {
                    data.linked_products.forEach((group: any) => {
                        const sId = group.s_product_id; // Changed from shopify_product_id per user JSON
                        const eId = group.e_listing_id; // Changed from etsy_listing_id per user JSON

                        // Find full group objects
                        const sGroup = shopifyGroups.find(p => p.id === sId);
                        const eGroup = etsyGroups.find(p => p.id === eId);

                        if (sGroup && eGroup) {
                            const variantMatches: VariantMatch[] = [];
                            const usedShopifyVarIds = new Set<string>();
                            const usedEtsyVarIds = new Set<string>();

                            // Process AI-provided variant matches
                            if (group.variants && Array.isArray(group.variants)) {
                                group.variants.forEach((vMatch: any) => {
                                    if (vMatch.type === 'MATCHED') {
                                        const sVar = sGroup.variants.find(v => v.platformId === vMatch.s_variant_id);
                                        const eVar = eGroup.variants.find(v => v.platformId === vMatch.e_variant_id);

                                        if (sVar && eVar) {
                                            variantMatches.push({
                                                shopify: sVar,
                                                etsy: eVar
                                            });
                                            usedShopifyVarIds.add(sVar.platformId!);
                                            usedEtsyVarIds.add(eVar.platformId!);
                                        }
                                    }
                                });
                            }

                            // Determine unmatched variants
                            const unmatchedShopify = sGroup.variants.filter(v => !v.platformId || !usedShopifyVarIds.has(v.platformId));
                            const unmatchedEtsy = eGroup.variants.filter(v => !v.platformId || !usedEtsyVarIds.has(v.platformId));

                            newMatches.push({
                                id: `linked-${sGroup.id}-${eGroup.id}`,
                                shopify: sGroup,
                                etsy: eGroup,
                                variantMatches,
                                unmatchedShopifyVariants: unmatchedShopify,
                                unmatchedEtsyVariants: unmatchedEtsy,
                                type: 'MATCHED'
                            });
                            processedShopifyIds.add(sGroup.id);
                            processedEtsyIds.add(eGroup.id);
                        }
                    });
                }

                // 2. Process Shopify Only Products (Move to Center)
                if (data.shopify_only_products && Array.isArray(data.shopify_only_products)) {
                    data.shopify_only_products.forEach((item: any) => {
                        // Try finding group by ID directly (if s_id is group id)
                        let sGroup = shopifyGroups.find(p => p.id === item.s_id);

                        // If not found, try finding group containing this variant
                        if (!sGroup) {
                            sGroup = shopifyGroups.find(g => g.variants.some(v => v.platformId === item.s_id));
                        }

                        if (sGroup && !processedShopifyIds.has(sGroup.id)) {
                            newMatches.push({
                                id: `single-s-${sGroup.id}`,
                                shopify: sGroup,
                                etsy: null,
                                variantMatches: [],
                                unmatchedShopifyVariants: [...sGroup.variants],
                                unmatchedEtsyVariants: [],
                                single: 'shopify'
                            });
                            processedShopifyIds.add(sGroup.id);
                        }
                    });
                }

                // 3. Process Etsy Only Products (Move to Center)
                if (data.etsy_only_products && Array.isArray(data.etsy_only_products)) {
                    data.etsy_only_products.forEach((item: any) => {
                        // IDs in etsy_only_products seem to be variant IDs in user example (etsy_var_606_1)
                        // But we need the Group ID. 
                        // However, if the user JSON implies listing_id, we search groups.
                        // Let's assume item.e_id might be a listing_id OR we search by variant ID if needed.
                        // But typically top level is listing.
                        // User example keys: "e_id", "name".
                        // e_id = "etsy_var_606_1". This looks like a variant ID.
                        // We need to find the PARENT group that contains this variant.

                        // Try finding group by ID directly (if e_id is listing_id)
                        let eGroup = etsyGroups.find(p => p.id === item.e_id);

                        // If not found, try finding group containing this variant
                        if (!eGroup) {
                            eGroup = etsyGroups.find(g => g.variants.some(v => v.platformId === item.e_id));
                        }

                        if (eGroup && !processedEtsyIds.has(eGroup.id)) {
                            newMatches.push({
                                id: `single-e-${eGroup.id}`,
                                shopify: null,
                                etsy: eGroup,
                                variantMatches: [],
                                unmatchedShopifyVariants: [],
                                unmatchedEtsyVariants: [...eGroup.variants],
                                single: 'etsy'
                            });
                            processedEtsyIds.add(eGroup.id);
                        }
                    });
                }

                if (newMatches.length > 0) {
                    setMatches(newMatches);
                    // Filter out processed groups from the side columns?
                    // The main UI renders `shopifyGroups.filter(g => !matches.some(m => m.shopify?.id === g.id))`
                    // So we just need to ensure matches state is updated.
                }
            }
        } catch (err) {
            console.error('AI Match error:', err);
        } finally {
            setAiLoading(false);
        }
    };

    // Open Reconciliation
    const openReconciliation = (latestMatches: MatchedGroup[] = matches) => {
        const groups: ReconcileGroup[] = latestMatches.map(m => {
            const items: ReconcileItem[] = [];

            if (m.single) {
                m.unmatchedShopifyVariants.forEach(s => {
                    const stock = s.stockQuantity ?? 0;
                    items.push({
                        id: `item-${s.id}`,
                        shopify: s,
                        etsy: null,
                        shopifyStock: stock,
                        etsyStock: 0,
                        originalShopifyStock: stock,
                        originalEtsyStock: 0,
                        single: 'shopify'
                    });
                });

                m.unmatchedEtsyVariants.forEach(e => {
                    const stock = e.stockQuantity ?? 0;
                    items.push({
                        id: `item-${e.id}`,
                        shopify: null,
                        etsy: e,
                        shopifyStock: 0,
                        etsyStock: stock,
                        originalShopifyStock: 0,
                        originalEtsyStock: stock,
                        single: 'etsy'
                    });
                });
            } else {
                // Linked Group
                // 1. Matched Pairs
                m.variantMatches.forEach(vm => {
                    const s = vm.shopify;
                    const e = vm.etsy;

                    if (s && e) {
                        const sStock = s.stockQuantity ?? 0;
                        const eStock = e.stockQuantity ?? 0;
                        items.push({
                            id: `pair-${s.id}-${e.id}`,
                            shopify: s,
                            etsy: e,
                            shopifyStock: sStock,
                            etsyStock: eStock,
                            originalShopifyStock: sStock,
                            originalEtsyStock: eStock
                        });
                    }
                });

                // 2. Unmatched Shopify
                m.unmatchedShopifyVariants.forEach(s => {
                    const stock = s.stockQuantity ?? 0;
                    items.push({
                        id: `s-${s.id}`,
                        shopify: s,
                        etsy: null,
                        shopifyStock: stock,
                        etsyStock: 0,
                        originalShopifyStock: stock,
                        originalEtsyStock: 0,
                        single: 'shopify'
                    });
                });

                // 3. Unmatched Etsy
                m.unmatchedEtsyVariants.forEach(e => {
                    const stock = e.stockQuantity ?? 0;
                    items.push({
                        id: `e-${e.id}`,
                        shopify: null,
                        etsy: e,
                        shopifyStock: 0,
                        etsyStock: stock,
                        originalShopifyStock: 0,
                        originalEtsyStock: stock,
                        single: 'etsy'
                    });
                });
            }

            return {
                id: m.id,
                title: m.shopify?.title || m.etsy?.title || 'Unknown Group',
                shopify: m.shopify,
                etsy: m.etsy,
                items,
                single: m.single
            };
        }).filter(g => g.items.length > 0);

        setReconcileGroups(groups);
        setShowReconcile(true);
        setSavingOverlay(null);
    };

    // Update stock for an item
    const updateStock = (itemId: string, platform: 'shopify' | 'etsy', value: number) => {
        setReconcileGroups(prev => prev.map(g => ({
            ...g,
            items: g.items.map(i => {
                if (i.id !== itemId) return i;
                return platform === 'shopify'
                    ? { ...i, shopifyStock: value }
                    : { ...i, etsyStock: value };
            })
        })));
    };

    // Sync single item
    const syncItem = (itemId: string) => {
        setReconcileGroups(prev => prev.map(g => ({
            ...g,
            items: g.items.map(i => {
                if (i.id !== itemId) return i;
                const min = Math.min(i.shopifyStock, i.etsyStock);
                return { ...i, shopifyStock: min, etsyStock: min };
            })
        })));
    };

    // Sync ALL items
    const syncAll = () => {
        setReconcileGroups(prev => prev.map(g => ({
            ...g,
            items: g.items.map(i => {
                if (i.single) return i;
                const min = Math.min(i.shopifyStock, i.etsyStock);
                return { ...i, shopifyStock: min, etsyStock: min };
            })
        })));
    };

    // Reset scope depending on activeTab
    const resetAll = () => {
        if (activeTab === 'equalize') {
            setReconcileGroups(prev => prev.map(g => ({
                ...g,
                items: g.items.map(i => ({
                    ...i,
                    shopifyStock: i.originalShopifyStock,
                    etsyStock: i.originalEtsyStock
                }))
            })));
        } else if (activeTab === 'catalog') {
            setCrossListing({ to_shopify: [], to_etsy: [] });
        }
    };

    // Save changes
    const saveChanges = async () => {
        if (!currentUserId) return;
        setSyncing(true);

        try {
            // Flatten items from all groups safely
            const allItems = showReconcile
                ? (reconcileGroups.flatMap(g => g.items) as ReconcileItem[])
                : (matches.map(m => ({
                    id: m.id,
                    shopify: m.shopify,
                    etsy: m.etsy,
                    shopifyStock: (m.shopify as any)?.stockQuantity ?? (m.shopify as any)?.variants?.[0]?.stockQuantity ?? 0,
                    etsyStock: (m.etsy as any)?.stockQuantity ?? (m.etsy as any)?.variants?.[0]?.stockQuantity ?? 0,
                    originalShopifyStock: (m.shopify as any)?.stockQuantity ?? (m.shopify as any)?.variants?.[0]?.stockQuantity ?? 0,
                    originalEtsyStock: (m.etsy as any)?.stockQuantity ?? (m.etsy as any)?.variants?.[0]?.stockQuantity ?? 0,
                    single: null
                })) as unknown as ReconcileItem[]);

            // 1. Gelen ilk sayfadaki ham veriler (kullanıcı değiştirmeden önceki ilk hali)
            const initial_state = {
                // Stock Equalization sekmesindeki eşleşenlerin ilk hali
                matched_inventory: allItems
                    .filter(i => i.shopify && i.etsy)
                    .map(i => ({
                        shopify_id: i.shopify?.shopifyProductId,
                        etsy_id: i.etsy?.etsyListingId,
                        shopify_variant_id: i.shopify?.platformId,
                        etsy_variant_id: i.etsy?.platformId,
                        shopify_stock: i.originalShopifyStock,
                        etsy_stock: i.originalEtsyStock,
                        title: i.shopify?.variantTitle || i.shopify?.name || i.etsy?.variantTitle || i.etsy?.name,
                        sku: i.shopify?.sku || i.etsy?.sku
                    })),

                // Complete Catalog kısmındaki dışarda kalanların ilk hali
                unmatched_inventory: reconcileGroups.flatMap(g =>
                    g.items.filter(i => i.single).map((i: ReconcileItem) => ({
                        platform: i.single,
                        id: i.single === 'shopify' ? i.shopify?.shopifyProductId : i.etsy?.etsyListingId,
                        variant_id: i.single === 'shopify' ? i.shopify?.platformId : i.etsy?.platformId,
                        stock: i.single === 'shopify' ? i.originalShopifyStock : i.originalEtsyStock,
                        title: i.single === 'shopify' ? (i.shopify?.variantTitle || i.shopify?.name) : (i.etsy?.variantTitle || i.etsy?.name),
                        sku: i.single === 'shopify' ? i.shopify?.sku : i.etsy?.sku
                    }))
                )
            };

            // 2. Kullanıcının müdahale ettiği ve clone attığı verilerin son hali
            const final_state = {
                matched_inventory: allItems
                    .filter(i => i.shopify && i.etsy)
                    .map(i => ({
                        shopify_id: i.shopify?.shopifyProductId,
                        etsy_id: i.etsy?.etsyListingId,
                        shopify_variant_id: i.shopify?.platformId,
                        etsy_variant_id: i.etsy?.platformId,
                        shopify_stock: i.shopifyStock,
                        etsy_stock: i.etsyStock,
                        title: i.shopify?.variantTitle || i.shopify?.name || i.etsy?.variantTitle || i.etsy?.name,
                        sku: i.shopify?.sku || i.etsy?.sku
                    })),
                queued_clones: {
                    to_shopify: crossListing.to_shopify,
                    to_etsy: crossListing.to_etsy
                }
            };

            const job_id = crypto.randomUUID();

            const payload = {
                user_id: currentUserId,
                job_id,
                initial_state,
                final_state,
                timestamp: new Date().toISOString()
            };

            console.log('Sending webhook:', payload);
            setSavingOverlay('loading');

            const res = await fetch('https://api.mercsync.com/webhook/sync-stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error('Failed to start sync process');
            }

            // Successfully triggered webhook, redirect to realtime progress dashboard
            router.push(`/setup/syncing?job_id=${job_id}`);

        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setSyncing(false);
        }
    };

    const linkedCount = matches.filter(m => m.shopify && m.etsy).length;
    const singleCount = matches.filter(m => m.single).length;

    // === RECONCILIATION VIEW (2 TABS) ===
    if (showReconcile) {
        const allItems = reconcileGroups.flatMap(g => g.items);
        const matchedItems = allItems.filter(i => i.shopify && i.etsy);
        const mismatchItems = matchedItems.filter(i => i.shopifyStock !== i.etsyStock);
        const hasChanges = allItems.some(i => i.shopifyStock !== i.originalShopifyStock || i.etsyStock !== i.originalEtsyStock);
        const queuedClones = crossListing.to_shopify.length + crossListing.to_etsy.length;

        // Build product-level catalog: products with ANY missing variants
        const catalogGroups = reconcileGroups.filter(g =>
            g.single || g.items.some(i => i.single)
        );
        const totalMissingCount = catalogGroups.reduce((sum, g) => {
            if (g.single) return sum + g.items.length;
            return sum + g.items.filter(i => i.single).length;
        }, 0);

        const isGroupQueued = (group: ReconcileGroup) => {
            const platform = group.single || group.items.find(i => i.single)?.single;
            if (!platform) return false;
            const target = platform === 'shopify' ? 'to_etsy' : 'to_shopify';
            const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;
            if (!sourceId) return false;
            return crossListing[target].some(c => c.source_id === sourceId);
        };

        const unqueueGroup = (group: ReconcileGroup) => {
            const platform = group.single || group.items.find(i => i.single)?.single;
            if (!platform) return;
            const target = platform === 'shopify' ? 'to_etsy' : 'to_shopify';
            const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;
            if (!sourceId) return;
            setCrossListing(prev => ({
                ...prev,
                [target]: prev[target].filter(c => c.source_id !== sourceId)
            }));
        };

        const queueGroup = (group: ReconcileGroup) => {
            const platform = group.single || group.items.find(i => i.single)?.single;
            if (!platform) return;
            const target = platform === 'shopify' ? 'to_etsy' : 'to_shopify';
            const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;
            const firstVariant = platform === 'shopify' ? group.items[0]?.shopify : group.items[0]?.etsy;

            if (sourceId && firstVariant) {
                const variantsToQueue = group.items.filter(i => i.single === platform).map(item => {
                    const v = platform === 'shopify' ? item.shopify : item.etsy;
                    return {
                        source_variant_id: v?.platformId || '',
                        title: v?.variantTitle || v?.name || '',
                        sku: v?.sku || '',
                        price: v?.price ?? 0,
                        stock: v?.stockQuantity ?? 0,
                        selected: true
                    };
                });

                setCrossListing(prev => ({
                    ...prev,
                    [target]: [...prev[target].filter(c => c.source_id !== sourceId), {
                        source_id: sourceId,
                        title: group.title,
                        sku: firstVariant?.sku || '',
                        price: firstVariant?.price || 0,
                        stock: firstVariant?.stockQuantity || 0,
                        image: firstVariant?.imageUrl || group.items[0]?.shopify?.imageUrl || group.items[0]?.etsy?.imageUrl || '',
                        variants: variantsToQueue
                    }]
                }));
            }
        };

        const queueAllMissing = () => {
            catalogGroups.forEach(group => {
                if (!isGroupQueued(group)) queueGroup(group);
            });
        };

        const tabs = [
            { key: 'equalize' as const, label: 'Stock Equalization', icon: ArrowDownUp, count: mismatchItems.length, color: 'red' },
            { key: 'catalog' as const, label: 'Complete Catalog', icon: Copy, count: totalMissingCount, color: 'amber' },
        ];

        return (
            <>
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
                                    <p className="text-sm text-gray-400">Redirecting...</p>
                                </>
                            )}
                        </div>
                    </div>
                )}
                <div className="min-h-screen bg-gray-50" style={{ overscrollBehavior: 'none' }}>
                    {/* Header */}
                    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                        <div className="max-w-[1200px] mx-auto px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setShowReconcile(false)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
                                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                                    </button>
                                    <div>
                                        <h1 className="text-xl font-bold text-gray-900">Stock Reconciliation</h1>
                                        <p className="text-sm text-gray-500">Review and fix inventory differences across platforms</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={resetAll}
                                        disabled={activeTab === 'equalize' ? !hasChanges : queuedClones === 0}
                                        className="h-9 px-4 text-gray-600 font-medium text-sm rounded-lg flex items-center gap-2 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                                    >
                                        <RotateCcw className="w-4 h-4" /> Reset
                                    </button>
                                    <button
                                        onClick={saveChanges}
                                        disabled={syncing || (!hasChanges && queuedClones === 0)}
                                        className="h-9 px-5 bg-green-600 text-white font-semibold text-sm rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                                    >
                                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Tab Bar */}
                    <div className="bg-white border-b border-gray-100">
                        <div className="max-w-[1200px] mx-auto px-6">
                            <div className="flex items-center gap-1">
                                {tabs.map(tab => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.key;
                                    const allClear = tab.count === 0;
                                    return (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${isActive
                                                ? 'border-indigo-600 text-indigo-700'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {tab.label}
                                            {allClear ? (
                                                <span className="ml-1 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-green-600" />
                                                </span>
                                            ) : (
                                                <span className={`ml-1 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${isActive
                                                    ? 'bg-red-100 text-red-600'
                                                    : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="max-w-[1200px] mx-auto px-6 py-6">

                        {/* ──── TAB 1: STOCK EQUALIZATION ──── */}
                        {activeTab === 'equalize' && (
                            <div>
                                <div className="mb-5">
                                    <h2 className="text-lg font-bold text-gray-900 mb-1">Stock Equalization</h2>
                                    <p className="text-sm text-gray-500">Fix stock mismatches between platforms to prevent overselling.</p>
                                </div>
                                {matchedItems.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                                        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                            <Package className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">No matched products!</h3>
                                        <p className="text-sm text-gray-500">First match products across platforms to equalize their stock.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`text-sm font-medium ${mismatchItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {mismatchItems.length > 0
                                                    ? `${mismatchItems.length} variant${mismatchItems.length > 1 ? 's' : ''} with mismatched stock`
                                                    : 'All variant stocks are perfectly in sync'}
                                            </span>
                                            {mismatchItems.length > 0 && (
                                                <button
                                                    onClick={syncAll}
                                                    className="h-9 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors"
                                                >
                                                    <ArrowDownUp className="w-4 h-4" /> Equalize All
                                                </button>
                                            )}
                                        </div>

                                        {(() => {
                                            // Group matched items by their parent reconcile group
                                            const matchedGroups = new Map<string, { group: ReconcileGroup, items: ReconcileItem[], hasMismatch: boolean }>();
                                            matchedItems.forEach(item => {
                                                const parentGroup = reconcileGroups.find(g => g.items.some(i => i.id === item.id));
                                                if (!parentGroup) return;
                                                if (!matchedGroups.has(parentGroup.id)) {
                                                    matchedGroups.set(parentGroup.id, { group: parentGroup, items: [], hasMismatch: false });
                                                }
                                                const g = matchedGroups.get(parentGroup.id)!;
                                                g.items.push(item);
                                                if (item.shopifyStock !== item.etsyStock) g.hasMismatch = true;
                                            });

                                            return Array.from(matchedGroups.values())
                                                .sort((a, b) => (a.hasMismatch === b.hasMismatch ? 0 : a.hasMismatch ? -1 : 1)) // Mismatches at the top
                                                .map(({ group, items, hasMismatch }) => {
                                                    const img = (group.items[0]?.shopify || group.items[0]?.etsy)?.imageUrl;

                                                    return (
                                                        <div key={group.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${hasMismatch ? 'border-red-200' : 'border-gray-200 opacity-80'}`}>
                                                            {/* Product Header */}
                                                            <div className={`p-4 flex items-center gap-4 border-b ${hasMismatch ? 'bg-red-50/50 border-red-100' : 'bg-gray-50/50 border-gray-100'}`}>
                                                                <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden shrink-0">
                                                                    {img ?
                                                                        <img src={img} className="w-full h-full object-cover" alt="" /> :
                                                                        <div className="w-full h-full bg-gray-50 flex items-center justify-center"><Package className="w-6 h-6 text-gray-300" /></div>
                                                                    }
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="font-bold text-gray-900 truncate">{group.title}</h3>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        {hasMismatch ? (
                                                                            <span className="text-xs text-red-600 font-medium">{items.filter(i => i.shopifyStock !== i.etsyStock).length} mismatched variant(s)</span>
                                                                        ) : (
                                                                            <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-500" /> Synced</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Variant Rows */}
                                                            <div className="divide-y divide-gray-100 pb-2">
                                                                {items.map(item => {
                                                                    const isMismatch = item.shopifyStock !== item.etsyStock;
                                                                    const diff = Math.abs(item.shopifyStock - item.etsyStock);
                                                                    return (
                                                                        <div key={item.id} className={`px-5 py-4 flex items-center gap-4 transition-colors ${isMismatch ? 'bg-white hover:bg-red-50/30' : 'bg-gray-50/50'}`}>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-sm font-semibold text-gray-900 truncate">{item.shopify?.variantTitle || item.shopify?.name || 'Default'}</p>
                                                                                <p className="text-xs text-gray-400 mt-0.5">{item.shopify?.sku || 'NO-SKU'}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-4 shrink-0">
                                                                                <div className="text-center">
                                                                                    <div className="flex items-center justify-center gap-1.5 mb-1.5 opacity-70">
                                                                                        <ShoppingBag className="w-3 h-3 text-gray-500" />
                                                                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Shopify</p>
                                                                                    </div>
                                                                                    <EditableStock value={item.shopifyStock} onChange={v => updateStock(item.id, 'shopify', v)} isExcess={item.shopifyStock > item.etsyStock} platform="shopify" />
                                                                                </div>
                                                                                <div className="flex flex-col items-center">
                                                                                    {isMismatch ? (
                                                                                        <>
                                                                                            <span className="text-xs font-bold text-red-500 mb-1">Δ {diff}</span>
                                                                                            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center ring-4 ring-white shadow-sm z-10 transition-transform hover:scale-110">
                                                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                                                                            </div>
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <span className="text-xs font-medium text-gray-400 mb-1 opacity-0">Δ 0</span>
                                                                                            <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center ring-4 ring-white shadow-sm z-10">
                                                                                                <Check className="w-3.5 h-3.5 text-green-500" />
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                                <div className="text-center">
                                                                                    <div className="flex items-center justify-center gap-1.5 mb-1.5 opacity-70">
                                                                                        <Store className="w-3 h-3 text-gray-500" />
                                                                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Etsy</p>
                                                                                    </div>
                                                                                    <EditableStock value={item.etsyStock} onChange={v => updateStock(item.id, 'etsy', v)} isExcess={item.etsyStock > item.shopifyStock} platform="etsy" />
                                                                                </div>

                                                                                {isMismatch ? (
                                                                                    <>
                                                                                        <div className="w-px h-10 bg-gray-200 mx-2 hidden sm:block"></div>
                                                                                        <button
                                                                                            onClick={() => syncItem(item.id)}
                                                                                            className="h-9 w-[100px] text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                                                                        >
                                                                                            <ArrowDownUp className="w-3.5 h-3.5" /> Eq to {Math.min(item.shopifyStock, item.etsyStock)}
                                                                                        </button>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <div className="w-px h-10 bg-gray-200 mx-2 hidden sm:block opacity-0"></div>
                                                                                        <div className="h-9 w-[100px] flex items-center justify-center text-xs font-medium text-green-600 bg-transparent">
                                                                                            Synced
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ──── TAB 2: COMPLETE YOUR CATALOG ──── */}
                        {activeTab === 'catalog' && (
                            <div>
                                <div className="mb-5 flex items-start justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 mb-1">Complete Your Catalog</h2>
                                        <p className="text-sm text-gray-500">Products with missing variants or not yet listed on both platforms. Clone them to fill the gaps.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center p-1 bg-gray-100/80 rounded-xl border border-gray-200/60 shadow-inner mt-1">
                                            <button
                                                onClick={() => setCatalogFilter('all')}
                                                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${catalogFilter === 'all' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                All Changes
                                            </button>
                                            <button
                                                onClick={() => setCatalogFilter('etsy')}
                                                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${catalogFilter === 'etsy' ? 'bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-900/5' : 'text-gray-500 hover:text-orange-600'}`}
                                            >
                                                <Store className="w-3.5 h-3.5" /> Clone to Etsy
                                            </button>
                                            <button
                                                onClick={() => setCatalogFilter('shopify')}
                                                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${catalogFilter === 'shopify' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-900/5' : 'text-gray-500 hover:text-blue-600'}`}
                                            >
                                                <ShoppingBag className="w-3.5 h-3.5" /> Clone to Shopify
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {catalogGroups.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                                        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                                            <Check className="w-8 h-8 text-green-600" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Catalog is complete!</h3>
                                        <p className="text-sm text-gray-500">All products and variants exist on both platforms.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`text-sm font-medium ${!catalogGroups.every(g => isGroupQueued(g)) ? 'text-amber-600' : 'text-green-600'}`}>
                                                {!catalogGroups.every(g => isGroupQueued(g))
                                                    ? `${catalogGroups.length} product${catalogGroups.length > 1 ? 's' : ''} need attention`
                                                    : 'All missing variants are successfully queued for cloning'}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                {queuedClones > 0 && (
                                                    <span className="text-sm font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all">
                                                        <Check className="w-4 h-4" />
                                                        {queuedClones} Queued
                                                    </span>
                                                )}
                                                {!catalogGroups.every(g => isGroupQueued(g)) && (
                                                    <button
                                                        onClick={queueAllMissing}
                                                        className="h-9 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors"
                                                    >
                                                        <Copy className="w-4 h-4" /> Clone All Missing
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {catalogGroups.map(group => {
                                            // Apply filtering
                                            if (catalogFilter === 'etsy') {
                                                // Only show if at least one missing item needs to go to Etsy (source is shopify)
                                                const hasToEtsy = group.items.some(i => i.single === 'shopify');
                                                if (!hasToEtsy) return null;
                                            }
                                            if (catalogFilter === 'shopify') {
                                                // Only show if at least one missing item needs to go to Shopify (source is etsy)
                                                const hasToShopify = group.items.some(i => i.single === 'etsy');
                                                if (!hasToShopify) return null;
                                            }

                                            const isUnmatched = !!group.single;
                                            const firstItem = group.items[0];
                                            const img = (firstItem?.shopify || firstItem?.etsy)?.imageUrl;
                                            const missingCount = isUnmatched ? group.items.length : group.items.filter(i => i.single).length;
                                            const isQueued = isGroupQueued(group);
                                            const groupSourcePlatform = isUnmatched ? group.single! : null;
                                            const itemPlatformInfo = group.single || group.items.find(i => i.single)?.single;
                                            const cloneTarget = itemPlatformInfo === 'shopify' ? 'Etsy' : 'Shopify';

                                            // Determine how many variants are queued out of missing
                                            let queuedVariantsCount = 0;
                                            if (isQueued) {
                                                const platform = group.single || group.items.find(i => i.single)?.single;
                                                const targetQueue = platform === 'shopify' ? 'to_etsy' : 'to_shopify';
                                                const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;
                                                const queuedGroup = crossListing[targetQueue].find(c => c.source_id === sourceId);
                                                if (queuedGroup && queuedGroup.variants) {
                                                    queuedVariantsCount = queuedGroup.variants.length;
                                                } else if (queuedGroup) {
                                                    queuedVariantsCount = missingCount; // legacy fallback
                                                }
                                            }

                                            return (
                                                <div key={group.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                                    {/* Product Header */}
                                                    <div className="p-4 flex items-center gap-4 bg-gray-50/50 border-b border-gray-100">
                                                        <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden shrink-0">
                                                            {img ?
                                                                <img src={img} className="w-full h-full object-cover" alt="" /> :
                                                                <div className="w-full h-full bg-gray-50 flex items-center justify-center"><Package className="w-6 h-6 text-gray-300" /></div>
                                                            }
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-gray-900 truncate">{group.title}</h3>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-gray-500">{group.items.length} variant{group.items.length > 1 ? 's' : ''}</span>
                                                                {isUnmatched ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
                                                                        Unmatched Product
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 uppercase tracking-wide">
                                                                        {missingCount} Missing Variant{missingCount > 1 ? 's' : ''}
                                                                    </span>
                                                                )}
                                                                {isQueued && queuedVariantsCount > 0 && (
                                                                    queuedVariantsCount === missingCount ? (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 uppercase tracking-wide">
                                                                            <Check className="w-3 h-3" /> All Queued
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 uppercase tracking-wide">
                                                                            <Check className="w-3 h-3" /> {queuedVariantsCount}/{missingCount} Queued
                                                                        </span>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                        {isUnmatched && groupSourcePlatform && (
                                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${groupSourcePlatform === 'shopify' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                                                                }`}>
                                                                {groupSourcePlatform === 'shopify' ? <ShoppingBag className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                                                                Only on {groupSourcePlatform === 'shopify' ? 'Shopify' : 'Etsy'}
                                                            </div>
                                                        )}
                                                        {/* Per-product Clone Actions */}
                                                        {isGroupQueued(group) ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold ring-1 ring-green-600/10">
                                                                    <Check className="w-3.5 h-3.5" />
                                                                    Queued
                                                                </span>
                                                                <button
                                                                    onClick={() => handleCloneClick(group)}
                                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                    title="Edit clone details"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => unqueueGroup(group)}
                                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Remove from queue"
                                                                >
                                                                    <RotateCcw className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleCloneClick(group)}
                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${cloneTarget === 'Etsy'
                                                                    ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 ring-1 ring-orange-900/5'
                                                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-900/5'
                                                                    }`}
                                                            >
                                                                {cloneTarget === 'Etsy' ? <Store className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                                                                Clone to {cloneTarget}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Variant Rows */}
                                                    <div className="divide-y divide-gray-100">
                                                        {group.items.map(item => {
                                                            const src = item.shopify || item.etsy;
                                                            const isMissing = !!item.single;
                                                            const targetPlatformName = item.single === 'shopify' ? 'Etsy' : 'Shopify';
                                                            const TargetIcon = item.single === 'shopify' ? Store : ShoppingBag;

                                                            let queued = false;
                                                            if (isMissing && isGroupQueued(group)) {
                                                                const platform = group.single || group.items.find(i => i.single)?.single;
                                                                const targetQueue = platform === 'shopify' ? 'to_etsy' : 'to_shopify';
                                                                const sourceId = platform === 'shopify' ? group.items[0]?.shopify?.shopifyProductId : group.items[0]?.etsy?.etsyListingId;

                                                                const queuedGroup = crossListing[targetQueue].find(c => c.source_id === sourceId);
                                                                if (queuedGroup) {
                                                                    // If variants array exists, check if this variant is selected
                                                                    if (queuedGroup.variants && queuedGroup.variants.length > 0) {
                                                                        queued = queuedGroup.variants.some(v => v.source_variant_id === src?.platformId);
                                                                    } else {
                                                                        queued = true; // Backward compatibility or single variant
                                                                    }
                                                                }
                                                            }

                                                            return (
                                                                <div key={item.id} className={`px-4 py-3 flex items-center gap-3 transition-colors ${queued ? 'bg-green-50/30' : isMissing ? 'bg-gray-50/50 hover:bg-gray-100/50' : 'bg-white'}`}>
                                                                    {/* Variant info */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-medium text-gray-900 truncate">
                                                                                {src?.variantTitle || src?.name || 'Default'}
                                                                            </span>
                                                                            {!isMissing && (
                                                                                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Matched on both platforms" />
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <span className="text-xs text-gray-400">{src?.sku || 'NO-SKU'}</span>
                                                                            <span className="text-xs text-gray-400">•</span>
                                                                            <span className="text-xs text-gray-500">{src?.stockQuantity ?? 0} in stock</span>
                                                                            {src?.price != null && (
                                                                                <>
                                                                                    <span className="text-xs text-gray-400">•</span>
                                                                                    <span className="text-xs font-medium text-gray-600">${src.price.toFixed(2)}</span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Action */}
                                                                    {isMissing && (
                                                                        <div className="shrink-0 flex items-center">
                                                                            {queued ? (
                                                                                <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center ring-1 ring-green-600/10 hover:bg-green-100 transition-colors" title="Will be cloned automatically">
                                                                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-[11px] font-semibold text-gray-500 px-2.5 py-1 bg-gray-100/80 rounded-lg border border-gray-200/50">
                                                                                    {isUnmatched || group.items.length === 1 ? 'Not Listed' : 'Unmatched'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div >
                <CloneModal
                    isOpen={cloneModal.isOpen}
                    onClose={() => setCloneModal(prev => ({ ...prev, isOpen: false }))}
                    onConfirm={handleCloneConfirm}
                    sourceGroup={cloneModal.sourceGroup}
                    targetPlatform={cloneModal.targetPlatform}
                    initialData={cloneModal.initialData}
                />
            </>
        );
    }




    const updateMatch = (updatedGroup: MatchedGroup) => {
        setMatches(prev => prev.map(m => m.id === updatedGroup.id ? updatedGroup : m));
    };

    // === MATCHING VIEW ===
    return (
        <div className="min-h-screen bg-gray-50" style={{ overscrollBehavior: 'none' }}>
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-[1800px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={handleGoBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg text-gray-600 flex items-center gap-1 group">
                                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            </button>
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
                        <span className="text-gray-400 ml-1">{unmatchedShopifyGroups.length + unmatchedEtsyGroups.length} pending</span>
                    </p>
                    <div className="flex items-center gap-2">
                        {!isSetupMode && (
                            <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                                Cancel
                            </button>
                        )}
                        <button
                            onClick={handleContinueClick}
                            disabled={matches.length === 0}
                            className="h-9 px-4 bg-green-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
                        >
                            <ArrowRight className="w-4 h-4" />
                            Continue
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1920px] mx-auto px-6 py-6 h-[calc(100vh-80px)] overflow-hidden">
                <div className="grid grid-cols-12 gap-6 h-full">

                    {/* LEFT COLUMN: SHOPIFY UNMATCHED (Source) */}
                    <div className="col-span-3 flex flex-col h-full bg-gray-50/50 rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-3 bg-white border-b flex items-center justify-between">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
                                Shopify Products
                            </h3>
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{unmatchedShopifyGroups.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {unmatchedShopifyGroups.map(g => (
                                <DraggableProductCard
                                    key={g.id}
                                    group={g}
                                    side="shopify"
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => handleDropOnGroup(g)}
                                    onDragOver={(e) => e.preventDefault()}
                                    isSelected={selectedGroup?.id === g.id}
                                    onClick={() => handleProductClick(g, 'shopify')}
                                />
                            ))}
                            {unmatchedShopifyGroups.length === 0 && (
                                <div className="text-center py-10 text-gray-400 text-sm">No unmatched items</div>
                            )}
                        </div>
                    </div>

                    {/* CENTER COLUMN: MATCHED (Target) */}
                    <div className="col-span-6 flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm min-w-0 w-full">
                        <div className="p-3 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-green-600" />
                                Matched Pairs
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500 bg-white border px-2 py-0.5 rounded-full">{matches.length} matches</span>
                            </div>
                        </div>

                        {/* Drop Zone & List */}
                        <div
                            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30"
                            onDragOver={e => { e.preventDefault(); setCenterHover(true); }}
                            onDragLeave={() => setCenterHover(false)}
                            onDrop={(e) => { e.preventDefault(); handleDropOnCenter(); }}
                        >
                            {/* Drop Area Overlay or Indicator */}
                            {draggedGroup && (
                                <div className={`p-4 border-2 border-dashed rounded-xl flex items-center justify-center text-sm font-medium transition-colors mb-4 ${centerHover ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-400'
                                    }`}>
                                    Drop here to link match
                                </div>
                            )}

                            {matches.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-64 text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                        <Wand2 className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-gray-900 font-medium mb-1">No Matches Yet</h3>
                                    <p className="text-gray-500 text-sm max-w-xs mb-4">
                                        Drag products from the sides to link them, or use AI Match to auto-detect pairs.
                                    </p>
                                    <button
                                        onClick={aiMatch}
                                        disabled={aiLoading}
                                        className="h-9 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                                    >
                                        {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        Run AI Match
                                    </button>
                                </div>
                            )}

                            {matches.slice().sort((a, b) => {
                                // Priority: MATCHED > SHOPIFY_ONLY > ETSY_ONLY (or mixed)
                                // We can define 'MATCHED' as having (links > 0) OR (shopify && etsy)
                                const isMatchedA = a.variantMatches.length > 0 || (a.shopify && a.etsy);
                                const isMatchedB = b.variantMatches.length > 0 || (b.shopify && b.etsy);

                                if (isMatchedA && !isMatchedB) return -1;
                                if (!isMatchedA && isMatchedB) return 1;
                                // Secondary sort by title if needed? or just stable
                                return 0;
                            }).map(match => (
                                <MatchedParentCard
                                    key={match.id}
                                    match={match}
                                    onRemove={removeMatch}
                                    onUpdate={updateMatch}
                                />
                            ))}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: ETSY UNMATCHED (Source) */}
                    <div className="col-span-3 flex flex-col h-full bg-gray-50/50 rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-3 bg-white border-b flex items-center justify-between">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <Store className="w-4 h-4 text-[#F56400]" />
                                Etsy Listings
                            </h3>
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{unmatchedEtsyGroups.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {unmatchedEtsyGroups.map(g => (
                                <DraggableProductCard
                                    key={g.id}
                                    group={g}
                                    side="etsy"
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e, target) => handleDropOnGroup(target)}
                                    onDragOver={(e) => e.preventDefault()}
                                    isSelected={selectedGroup?.id === g.id}
                                    onClick={() => handleProductClick(g, 'etsy')}
                                />
                            ))}
                            {unmatchedEtsyGroups.length === 0 && (
                                <div className="text-center py-10 text-gray-400 text-sm">No unmatched items</div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Location Selection Modal */}
            {showLocationModal && (
                <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Ana Shopify Lokasyonu</h3>
                            <button onClick={() => setShowLocationModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-500 mb-6">
                            Lütfen envanter senkronizasyonu için ana Shopify lokasyonunuzu seçin.
                        </p>

                        {loadingLocations ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Lokasyon</label>
                                    <select
                                        value={selectedLocation}
                                        onChange={(e) => setSelectedLocation(e.target.value)}
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="" disabled>Lokasyon seçin...</option>
                                        {locations.map((loc) => (
                                            <option key={loc.id} value={loc.id.toString()}>
                                                {loc.name} {loc.address1 ? `(${loc.address1})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    onClick={submitLocationAndContinue}
                                    disabled={submittingLocation || !selectedLocation}
                                    className="w-full h-11 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                                >
                                    {submittingLocation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    Onayla ve Devam Et
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
