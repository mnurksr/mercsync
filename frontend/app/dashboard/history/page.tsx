'use client';

import { useState, useEffect } from 'react';
import { getSyncHistory, type HistoryItem } from '../../actions/history';
import {
    Check, X, RefreshCw, AlertTriangle,
    ArrowRight, Clock, History, SkipForward, ChevronDown, ChevronUp,
    Loader2, Zap, Package
} from 'lucide-react';
import { EtsyIcon, ShopifyIcon } from '@/components/PlatformIcons';

export default function HistoryPage() {
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterEventType, setFilterEventType] = useState<'all' | 'order' | 'price'>('all');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await getSyncHistory('all');
            setHistory(data);
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'success':
                return {
                    icon: <Check className="w-3.5 h-3.5" />,
                    bg: 'bg-emerald-500',
                    ring: 'ring-emerald-500/20',
                    label: 'Success',
                    labelColor: 'text-emerald-600 bg-emerald-50'
                };
            case 'failed':
                return {
                    icon: <X className="w-3.5 h-3.5" />,
                    bg: 'bg-red-500',
                    ring: 'ring-red-500/20',
                    label: 'Failed',
                    labelColor: 'text-red-600 bg-red-50'
                };
            case 'skipped':
                return {
                    icon: <SkipForward className="w-3.5 h-3.5" />,
                    bg: 'bg-gray-400',
                    ring: 'ring-gray-400/20',
                    label: 'Skipped',
                    labelColor: 'text-gray-500 bg-gray-100'
                };
            default:
                return {
                    icon: <Clock className="w-3.5 h-3.5" />,
                    bg: 'bg-gray-400',
                    ring: 'ring-gray-400/20',
                    label: status,
                    labelColor: 'text-gray-500 bg-gray-100'
                };
        }
    };

    const getDirectionIcons = (direction: string | null, source: string) => {
        if (direction === 'shopify_to_etsy') {
            return (
                <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-blue-50 rounded-md"><ShopifyIcon size={12} /></div>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <div className="p-1 bg-orange-50 rounded-md"><EtsyIcon size={12} /></div>
                </div>
            );
        }
        if (direction === 'etsy_to_shopify') {
            return (
                <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-orange-50 rounded-md"><EtsyIcon size={12} /></div>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <div className="p-1 bg-blue-50 rounded-md"><ShopifyIcon size={12} /></div>
                </div>
            );
        }
        // Fallback based on source
        if (source === 'shopify') return <div className="p-1 bg-blue-50 rounded-md"><ShopifyIcon size={12} /></div>;
        if (source === 'etsy') return <div className="p-1 bg-orange-50 rounded-md"><EtsyIcon size={12} /></div>;
        return <div className="p-1 bg-gray-50 rounded-md"><Zap className="w-3 h-3 text-gray-400" /></div>;
    };

    const filters = [
        { key: 'all', label: 'All Events' },
        { key: 'success', label: 'Success' },
        { key: 'failed', label: 'Failed' },
        { key: 'skipped', label: 'Skipped' }
    ];

    const eventFilters = [
        { key: 'all', label: 'All Types' },
        { key: 'order', label: 'Orders' },
        { key: 'price', label: 'Prices' }
    ] as const;

    // Stats calculated from ALL loaded items
    const successCount = history.filter(h => h.status === 'success').length;
    const failedCount = history.filter(h => h.status === 'failed').length;

    // Items to display based on selected filter
    const displayedHistory = history.filter(h => {
        const statusMatch = filterStatus === 'all' || h.status === filterStatus;
        const eventMatch = filterEventType === 'all'
            || (filterEventType === 'order' && (h.eventType === 'order' || h.eventType === 'order_cancel'))
            || (filterEventType === 'price' && h.eventType === 'price_update');

        return statusMatch && eventMatch;
    });

    const getPriceSummary = (item: HistoryItem) => {
        const oldPrice = item.metadata?.old_price;
        const newPrice = item.metadata?.new_price;
        if (typeof oldPrice === 'number' && typeof newPrice === 'number') {
            return `$${oldPrice.toFixed(2)} -> $${newPrice.toFixed(2)}`;
        }

        const oldPrices = item.metadata?.old_prices_base;
        const newPrices = item.metadata?.new_prices_calculated;
        if (oldPrices && newPrices) {
            const firstKey = Object.keys(newPrices)[0] || Object.keys(oldPrices)[0];
            if (firstKey) {
                const oldVal = Number(oldPrices[firstKey] || 0);
                const newVal = Number(newPrices[firstKey] || 0);
                return `$${oldVal.toFixed(2)} -> $${newVal.toFixed(2)}`;
            }
        }

        if (item.oldStock !== null && item.newStock !== null) {
            return `$${Number(item.oldStock).toFixed(2)} -> $${Number(item.newStock).toFixed(2)}`;
        }

        return null;
    };

    return (
        <div className="w-full pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Sync History</h1>
                    <p className="text-gray-500 font-medium">Monitor all background sync events in real-time.</p>
                </div>

                <button
                    onClick={loadData}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3.5 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-indigo-600" />}
                    Refresh
                </button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Events</p>
                    <p className="text-3xl font-black text-gray-900">{history.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Successful</p>
                    <p className="text-3xl font-black text-emerald-600">{successCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Failed</p>
                    <p className="text-3xl font-black text-red-600">{failedCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="space-y-3 mb-8">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-1.5 flex items-center gap-1">
                    {filters.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilterStatus(f.key)}
                            className={`px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
                                filterStatus === f.key
                                    ? 'bg-gray-900 text-white shadow-lg'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-1.5 flex items-center gap-1">
                    {eventFilters.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilterEventType(f.key)}
                            className={`px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
                                filterEventType === f.key
                                    ? 'bg-indigo-600 text-white shadow-lg'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="divide-y divide-gray-50">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="px-8 py-5 flex items-center gap-5 animate-pulse">
                                <div className="w-8 h-8 bg-gray-100 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-100 rounded-lg w-48" />
                                    <div className="h-3 bg-gray-50 rounded-lg w-32" />
                                </div>
                                <div className="h-3 bg-gray-100 rounded-lg w-16" />
                            </div>
                        ))}
                    </div>
                ) : displayedHistory.length === 0 ? (
                    <div className="px-8 py-24 text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <History className="w-10 h-10 text-gray-300" />
                        </div>
                        <p className="text-xl font-black text-gray-900">No events found</p>
                        <p className="text-sm font-medium text-gray-400 mt-2">Try changing your filter or sync a product.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {displayedHistory.map((item) => {
                            const statusConfig = getStatusConfig(item.status);
                            const isExpanded = expandedId === item.id;
                            const hasDetails = item.errorMessage || (item.metadata && Object.keys(item.metadata).length > 0);

                            return (
                                <div key={item.id} className="group">
                                    <div
                                        className={`px-8 py-5 flex items-center gap-5 hover:bg-gray-50/50 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                                        onClick={() => hasDetails && setExpandedId(isExpanded ? null : item.id)}
                                    >
                                        {/* Status Dot */}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ring-4 ${statusConfig.bg} ${statusConfig.ring}`}>
                                            {statusConfig.icon}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0 flex items-center gap-4">
                                            {/* Product Image */}
                                            {item.product && (
                                                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 shadow-sm overflow-hidden hidden sm:flex">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-4 h-4" />
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {item.product ? (
                                                        <>
                                                            <span className="text-sm font-black text-gray-900 truncate max-w-[250px] md:max-w-md">{item.product}</span>
                                                            <span className="text-xs font-medium text-gray-400 shrink-0">• {item.action}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-sm font-black text-gray-900">{item.action}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {getDirectionIcons(item.direction, item.source)}
                                                    {item.eventType !== 'price_update' && item.oldStock !== null && item.newStock !== null && (
                                                        <span className="text-xs font-bold text-gray-400">
                                                            {item.oldStock} → {item.newStock}
                                                        </span>
                                                    )}
                                                    {item.eventType === 'price_update' && getPriceSummary(item) && (
                                                        <span className="text-xs font-bold text-gray-400">
                                                            {getPriceSummary(item)}
                                                        </span>
                                                    )}
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusConfig.labelColor}`}>
                                                        {statusConfig.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Time + Expand */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs font-medium text-gray-300" title={item.rawTime}>{item.time}</span>
                                            {hasDetails && (
                                                isExpanded
                                                    ? <ChevronUp className="w-4 h-4 text-gray-300" />
                                                    : <ChevronDown className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                        <div className="px-8 pb-5 pt-0 ml-[52px]">
                                            <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono space-y-3">
                                                {item.errorMessage && (
                                                    <div className="flex items-start gap-2 text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100">
                                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                                        <div className="font-medium whitespace-pre-wrap break-words">{item.errorMessage}</div>
                                                    </div>
                                                )}
                                                {item.metadata && Object.keys(item.metadata).length > 0 && (
                                                    <div className="text-gray-600 space-y-2">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sync Details</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            {item.metadata.shopify_order_id && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Shopify Order</span>
                                                                    <p className="font-bold text-gray-900">#{item.metadata.shopify_order_id}</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.line_items !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Line Items</span>
                                                                    <p className="font-bold text-gray-900">{item.metadata.line_items}</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.unique_variants !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Unique Products</span>
                                                                    <p className="font-bold text-gray-900">{item.metadata.unique_variants}</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.synced_items !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Synced Items</span>
                                                                    <p className="font-bold text-gray-900">{item.metadata.synced_items}</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.shopify_total !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Shopify Total Stock</span>
                                                                    <p className="font-bold text-gray-900">{item.metadata.shopify_total}</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.low_stock_threshold !== undefined && item.metadata.low_stock_threshold > 0 && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Alert Threshold</span>
                                                                    <p className="font-bold text-amber-600">{item.metadata.low_stock_threshold} units</p>
                                                                </div>
                                                            )}
                                                            {item.metadata.etsy_push !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Etsy Sync</span>
                                                                    <p className={`font-bold ${item.metadata.etsy_push === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                        {item.metadata.etsy_push === 'success' ? '✓ Synced' : '✗ Failed'}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {item.metadata.webhook_available !== undefined && (
                                                                <div className="bg-white rounded-lg p-2 border border-gray-100">
                                                                    <span className="text-gray-400 font-medium">Webhook Stock</span>
                                                                    <p className="font-bold text-gray-900">{item.metadata.webhook_available}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {item.eventType === 'price_update' && getPriceSummary(item) && (
                                                            <div className="bg-white rounded-lg p-3 border border-gray-100 mt-1">
                                                                <span className="text-gray-400 font-medium text-[10px] uppercase">Price Change</span>
                                                                <p className="font-bold text-gray-900 mt-1">{getPriceSummary(item)}</p>
                                                            </div>
                                                        )}
                                                        {item.metadata.order_items && Array.isArray(item.metadata.order_items) && item.metadata.order_items.length > 0 && (
                                                            <div className="bg-white rounded-lg p-3 border border-gray-100 mt-1">
                                                                <span className="text-gray-400 font-medium text-[10px] uppercase">Order Items</span>
                                                                <div className="mt-2 space-y-2">
                                                                    {item.metadata.order_items.map((orderItem: any, idx: number) => (
                                                                        <div key={idx} className="flex items-center justify-between text-xs">
                                                                            <span className="font-medium text-gray-700">{orderItem.name || 'Unnamed Product'}</span>
                                                                            <span className="font-bold text-gray-900">x{orderItem.quantity}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {item.metadata.location_breakdown && Array.isArray(item.metadata.location_breakdown) && (
                                                            <div className="bg-white rounded-lg p-2 border border-gray-100 mt-1">
                                                                <span className="text-gray-400 font-medium text-[10px] uppercase">Location Breakdown</span>
                                                                <div className="flex flex-wrap gap-2 mt-1">
                                                                    {item.metadata.location_breakdown.map((loc: any, idx: number) => (
                                                                        <span key={idx} className="text-xs bg-gray-50 px-2 py-1 rounded font-medium">
                                                                            📍 {loc.location_id?.toString().slice(-4)}: <strong>{loc.stock}</strong>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
