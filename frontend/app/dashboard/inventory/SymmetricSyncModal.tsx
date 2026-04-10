import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Store, Zap, Check, X, Database, SlidersHorizontal, History } from 'lucide-react';

interface SymmetricSyncModalProps {
    isOpen: boolean;
    item: any | null;
    shopLocations: any[];
    onClose: () => void;
    onConfirm: (stock: number, platformsToSync: Array<'shopify' | 'etsy'>, breakdown?: { locationId: string, allocation: number }[]) => Promise<void>;
    onSaveConfig: (selectedLocations: string[], primaryLocId?: string) => Promise<void>;
}

export function SymmetricSyncModal({ isOpen, item, shopLocations, onClose, onConfirm, onSaveConfig }: SymmetricSyncModalProps) {
    const [syncSource, setSyncSource] = useState<'shopify' | 'etsy' | 'latest' | 'manual' | null>(null);
    const [manualStock, setManualStock] = useState<number | ''>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [primaryLocationId, setPrimaryLocationId] = useState<string | null>(null);

    // Distribution Modal State
    const [showDistribution, setShowDistribution] = useState(false);
    const [distribution, setDistribution] = useState<Record<string, number>>({});

    useEffect(() => {
        if (isOpen && item) {
            setSyncSource(null);
            setManualStock(item.master_stock || 0);

            // Fetch stored location preferences
            const storedLocs = item.selected_location_ids || [];
            if (storedLocs.length > 0) {
                setSelectedLocations(storedLocs);
                setPrimaryLocationId(storedLocs[0]);
            } else {
                const mainLocId = shopLocations.find(l => l.active)?.id || shopLocations[0]?.id;
                setSelectedLocations(mainLocId ? [mainLocId] : []);
                setPrimaryLocationId(mainLocId || null);
            }
            setShowDistribution(false);
        }
    }, [isOpen, item, shopLocations]);

    // Format map
    const parsedMap = useMemo(() => {
        if (!item?.location_inventory_map) return {};
        const map = item.location_inventory_map;
        const res: Record<string, number> = {};
        if (Array.isArray(map)) {
            map.forEach(l => { res[l.location_id?.toString()] = parseInt(l.stock, 10) || 0; });
        } else if (typeof map === 'object') {
            for (const [k, v] of Object.entries(map)) res[k] = parseInt(v as any, 10) || 0;
        }
        return res;
    }, [item]);

    const liveShopifyStock = useMemo(() => {
        if (selectedLocations.length === 0) return 0;
        return selectedLocations.reduce((sum, locId) => sum + (parsedMap[locId] || 0), 0);
    }, [parsedMap, selectedLocations]);

    const isLatestShopify = useMemo(() => {
        if (!item) return true;
        const sTime = item.shopify_updated_at ? new Date(item.shopify_updated_at).getTime() : 0;
        const eTime = item.etsy_updated_at ? new Date(item.etsy_updated_at).getTime() : 0;
        if (sTime === 0 && eTime === 0) return true;
        return sTime >= eTime;
    }, [item]);

    const liveEtsyStock = item?.etsy_stock_snapshot || 0;

    const finalStockToApply = syncSource === 'shopify' ? liveShopifyStock
        : syncSource === 'etsy' ? liveEtsyStock
        : syncSource === 'latest' ? (isLatestShopify ? liveShopifyStock : liveEtsyStock)
        : (typeof manualStock === 'number' ? manualStock : 0);

    // Reset distribution when stock changes
    useEffect(() => {
        if (showDistribution) {
            const locCount = selectedLocations.length;
            if (locCount === 0) return;
            const newDist: Record<string, number> = {};
            const base = Math.floor(finalStockToApply / locCount);
            let rem = finalStockToApply % locCount;
            selectedLocations.forEach((id, i) => {
                newDist[id] = base + (i === 0 ? rem : 0);
            });
            setDistribution(newDist);
        }
    }, [showDistribution, finalStockToApply, selectedLocations]);

    const handleConfirm = async () => {
        if (!syncSource) return;

        // Save location config silently without UI loading specifically for it
        await onSaveConfig(selectedLocations, primaryLocationId || undefined);

        // If Shopify is source, only push to Etsy
        if (syncSource === 'shopify') {
            setIsSubmitting(true);
            try {
                await onConfirm(finalStockToApply, ['etsy']);
                onClose();
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // If Etsy/Manual is source, we MUST push to Shopify.
        // If > 1 tracked locations, ask user how to distribute
        if (selectedLocations.length > 1 && !showDistribution) {
            setShowDistribution(true);
            return; // Pause confirm wait for distribution
        }

        // Apply final
        setIsSubmitting(true);
        try {
            const breakdown = showDistribution 
                ? Object.entries(distribution).map(([id, val]) => ({ locationId: id, allocation: val }))
                : [{ locationId: selectedLocations[0], allocation: finalStockToApply }];
            
            await onConfirm(finalStockToApply, ['shopify', 'etsy'], breakdown);
            setShowDistribution(false);
            onClose();
        } finally {
            setIsSubmitting(false);
            setSyncSource('manual');
        }
    };

    if (!isOpen || !item) return null;

    if (showDistribution) {
        const totalAllocated = Object.values(distribution).reduce((a, b) => a + (b || 0), 0);
        const diff = finalStockToApply - totalAllocated;
        const exactMatch = diff === 0;

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 leading-none">Distribute Stock</h3>
                            <p className="text-gray-400 font-bold text-[10px] mt-1.5 uppercase tracking-widest">
                                Allocate {finalStockToApply} units across locations
                            </p>
                        </div>
                        <button onClick={() => setShowDistribution(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        <div className={`p-4 rounded-2xl flex items-center justify-between border-2 transition-colors ${exactMatch ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <span className="text-xs font-black uppercase text-gray-500">Left to Assign</span>
                            <span className={`text-xl font-black ${exactMatch ? 'text-green-600' : 'text-red-500'}`}>
                                {exactMatch ? 'Perfect ✓' : (diff > 0 ? `${diff} unallocated` : `${Math.abs(diff)} over-allocated`)}
                            </span>
                        </div>

                        <div className="space-y-4">
                            {selectedLocations.map(locId => {
                                const locObj = shopLocations.find(l => l.id === locId);
                                const currentParsed = parsedMap[locId] || 0;
                                return (
                                    <div key={locId} className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-700">{locObj?.name || 'Unknown'}</span>
                                            <span className="text-[10px] font-bold text-gray-400">Current: {currentParsed}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="0"
                                                max={finalStockToApply + (distribution[locId] || 0)}
                                                value={distribution[locId] || 0}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setDistribution(prev => ({ ...prev, [locId]: val }));
                                                }}
                                                className="flex-1 accent-indigo-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                value={distribution[locId] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                    setDistribution(prev => ({ ...prev, [locId]: val }));
                                                }}
                                                className="w-16 p-2 rounded-xl border border-gray-200 text-center text-sm font-black text-gray-900 bg-gray-50 outline-none focus:border-indigo-500 transition-colors"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-100 flex gap-3">
                        <button onClick={() => setShowDistribution(false)} className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm w-full transition-colors">Back</button>
                        <button 
                            onClick={handleConfirm}
                            disabled={!exactMatch || isSubmitting}
                            className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-bold text-sm w-full flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-600/20 active:scale-95"
                        >
                            {isSubmitting ? <span className="animate-pulse">Saving...</span> : <>Confirm Distribution</>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">
                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 leading-none">Resolve Discrepancy</h3>
                        <p className="text-gray-400 font-bold text-xs mt-2 uppercase tracking-widest">Symmetric Stock Synchronization</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-gray-100 rounded-2xl transition-all active:scale-90 opacity-50 hover:opacity-100">
                        <X className="w-6 h-6 text-gray-900" />
                    </button>
                </div>

                <div className="px-8 py-8 overflow-y-auto flex-1 flex flex-col md:flex-row items-center justify-center relative custom-scrollbar">
                    
                    {/* CENTER MASTER STOCK ABSOLUTE */}
                    <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex-col items-center justify-center">
                        <div className="w-24 h-24 rounded-full bg-white shadow-2xl border flex items-center justify-center flex-col shadow-indigo-500/10 border-indigo-100 relative">
                            <div className="text-3xl font-black text-indigo-600 leading-none">
                                {finalStockToApply}
                            </div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Master</span>
                        </div>
                    </div>

                    {/* Master Stock Mobile (Hidden on md) */}
                    <div className="md:hidden w-full flex justify-center mb-6">
                         <div className="w-24 h-24 rounded-full bg-white shadow-lg border flex items-center justify-center flex-col shadow-indigo-500/10 border-indigo-100">
                            <div className="text-3xl font-black text-indigo-600 leading-none">
                                {finalStockToApply}
                            </div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Master</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 grid-rows-2 gap-8 w-full max-w-3xl relative z-10">
                        
                        {/* Top Left: Shopify Card */}
                        <div
                            className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-start relative overflow-hidden group ${syncSource === 'shopify' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 bg-white hover:border-blue-200'}`}
                            onClick={() => setSyncSource('shopify')}
                        >
                            {syncSource === 'shopify' && <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-100 rounded-xl text-blue-600 relative z-10">
                                        <ShoppingBag className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-black text-blue-600 uppercase tracking-tighter">Shopify Sum</span>
                                </div>
                                {isLatestShopify && (
                                    <span className="px-2 py-0.5 bg-blue-600 text-[8px] text-white font-black rounded-full uppercase shadow-sm">Latest</span>
                                )}
                            </div>
                            <div className="mt-2 text-center">
                                <div className="text-[3.5rem] font-black text-gray-900 leading-none tracking-tight mb-2 drop-shadow-sm">{liveShopifyStock}</div>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Tracked Total</p>
                            </div>
                        </div>

                        {/* Top Right: Etsy Card */}
                        <div
                            className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-start relative overflow-hidden group ${syncSource === 'etsy' ? 'border-orange-500 bg-orange-50/50' : 'border-gray-100 bg-white hover:border-orange-200'}`}
                            onClick={() => setSyncSource('etsy')}
                        >
                            {syncSource === 'etsy' && <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-orange-100 rounded-xl text-orange-600 relative z-10">
                                        <Store className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-black text-orange-600 uppercase tracking-tighter">Etsy</span>
                                </div>
                                {!isLatestShopify && (
                                    <span className="px-2 py-0.5 bg-orange-600 text-[8px] text-white font-black rounded-full uppercase shadow-sm">Latest</span>
                                )}
                            </div>
                            <div className="mt-2 text-center">
                                <div className="text-[3.5rem] font-black text-gray-900 leading-none tracking-tight mb-2 drop-shadow-sm">{liveEtsyStock}</div>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Platform Record</p>
                            </div>
                        </div>

                        {/* Bottom Left: Tracked Locations Configuration */}
                        <div className="p-6 rounded-[2rem] border-2 border-gray-100 bg-gray-50 flex flex-col relative overflow-hidden h-full">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 min-w-[24px] bg-slate-200 rounded-lg text-slate-500 flex justify-center">
                                        <Zap className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Tracked Locations</span>
                                </div>
                                <span className="text-[8px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">SOURCES</span>
                            </div>
                            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[140px]">
                                {shopLocations.map(loc => {
                                    const isSelected = selectedLocations.includes(loc.id);
                                    const locStock = parsedMap[loc.id] || 0;
                                    return (
                                        <div key={loc.id} className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${isSelected ? 'border-blue-200 bg-white shadow-sm' : 'border-transparent hover:border-gray-200'}`} onClick={() => {
                                            setSelectedLocations(prev => prev.includes(loc.id) ? prev.filter(id => id !== loc.id) : [...prev, loc.id]);
                                            setSyncSource('shopify');
                                        }}>
                                            <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                                                <div className={`w-4 h-4 rounded-[4px] border flex flex-shrink-0 items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-gray-100'}`}>
                                                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                                </div>
                                                <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{loc.name}</span>
                                            </div>
                                            <div className="text-[11px] font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md flex-shrink-0 min-w-[2rem] text-center">
                                                {locStock}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom Right: Manual Input */}
                        <div
                            className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-start relative overflow-hidden group h-full ${syncSource === 'manual' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-100 bg-white hover:border-emerald-200'}`}
                            onClick={() => { if (syncSource !== 'manual') setSyncSource('manual'); }}
                        >
                            {syncSource === 'manual' && <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600 relative z-10">
                                        <Database className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-black text-emerald-600 uppercase tracking-tighter">Enter Value</span>
                                </div>
                            </div>
                            <div className="mt-2 text-center px-4 flex flex-col h-full justify-center">
                                <input
                                    type="number"
                                    min="0"
                                    value={manualStock}
                                    onChange={(e) => {
                                        const v = e.target.value === '' ? '' : parseInt(e.target.value);
                                        setManualStock(v);
                                        setSyncSource('manual');
                                    }}
                                    onClick={(e) => { e.stopPropagation(); setSyncSource('manual'); }}
                                    className={`w-full text-center text-[3.5rem] font-black leading-none tracking-tight drop-shadow-sm outline-none bg-transparent mb-2 ${syncSource === 'manual' ? 'text-emerald-700 placeholder:text-emerald-300' : 'text-gray-400 placeholder:text-gray-200'}`}
                                    placeholder="0"
                                />
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] relative z-10 block mb-3">Custom Stock</p>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="px-8 py-6 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-0 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-200 transition-all active:scale-95 w-full md:w-auto"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleConfirm}
                        disabled={!syncSource || isSubmitting}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 w-full md:w-auto min-w-[200px]"
                    >
                        {isSubmitting ? (
                            <span className="animate-pulse flex items-center gap-2"><Zap className="w-4 h-4" /> Saving...</span>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                {syncSource === 'shopify' 
                                    ? `Push ${finalStockToApply} strictly to Etsy`
                                    : (syncSource && selectedLocations.length > 1 ? `Distribute ${finalStockToApply} to Shopify` : `Push ${finalStockToApply} Sync`)}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
