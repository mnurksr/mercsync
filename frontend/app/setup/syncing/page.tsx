'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
    CheckCircle2, RefreshCw, ArrowRight, Package,
    ShoppingBag, Store, ArrowRightLeft, Zap, AlertCircle, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface SyncJob {
    id: string;
    status: SyncStatus;
    current_step: number;
    total_steps: number;
    message: string;
}

type LogEvent = { type: 'log'; text: string };
type ProductCloneEvent = {
    type: 'product_clone';
    direction: 'to_shopify' | 'to_etsy';
    product: { name: string; price: number; stock: number; image?: string; sku?: string };
    status: 'cloning' | 'success' | 'failed';
    text: string;
};
type StockSyncEvent = {
    type: 'stock_sync';
    platform: 'shopify' | 'etsy';
    product: { name: string; old_stock: number; new_stock: number; sku?: string };
    text: string;
};
type SyncEvent = LogEvent | ProductCloneEvent | StockSyncEvent;

function parseMessage(raw: string): SyncEvent {
    try {
        const parsed = JSON.parse(raw);
        if (parsed.type) return parsed;
    } catch { }
    return { type: 'log', text: raw };
}

function DirectionBadge({ direction }: { direction: 'to_shopify' | 'to_etsy' }) {
    if (direction === 'to_shopify') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#95BF47]/10 text-[#6d8e2e] border border-[#95BF47]/20">
                <Store className="w-3 h-3" /> Shopify
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#F56400]/10 text-[#d45500] border border-[#F56400]/20">
            <ShoppingBag className="w-3 h-3" /> Etsy
        </span>
    );
}

function StatusIcon({ status }: { status: 'cloning' | 'success' | 'failed' }) {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
    return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" style={{ animationDuration: '1.5s' }} />;
}

function ProductCloneCard({ event }: { event: ProductCloneEvent }) {
    const isShopify = event.direction === 'to_shopify';
    const ringColor = event.status === 'failed' ? 'border-red-200'
        : isShopify ? 'border-[#95BF47]/20' : 'border-[#F56400]/20';

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-3 p-3 bg-white rounded-xl border ${ringColor} shadow-sm`}
        >
            {event.product.image ? (
                <img src={event.product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
            ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-gray-400" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-gray-900 font-semibold text-sm truncate">{event.product.name}</span>
                    <StatusIcon status={event.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>${event.product.price}</span>
                    <span>·</span>
                    <span>Stock: {event.product.stock}</span>
                    {event.product.sku && event.product.sku !== 'NO-SKU' && (
                        <><span>·</span><span className="text-gray-400">{event.product.sku}</span></>
                    )}
                </div>
            </div>
            <DirectionBadge direction={event.direction} />
        </motion.div>
    );
}

function StockSyncRow({ event }: { event: StockSyncEvent }) {
    const isShopify = event.platform === 'shopify';
    return (
        <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 px-3 py-2 bg-white rounded-lg border border-gray-100"
        >
            <ArrowRightLeft className={`w-3.5 h-3.5 shrink-0 ${isShopify ? 'text-[#95BF47]' : 'text-[#F56400]'}`} />
            <span className="text-sm text-gray-700 truncate flex-1">{event.product.name}</span>
            <span className="text-xs text-gray-400 tabular-nums shrink-0">
                {event.product.old_stock} → {event.product.new_stock}
            </span>
            <span className={`text-[10px] font-bold uppercase ${isShopify ? 'text-[#95BF47]' : 'text-[#F56400]'}`}>
                {isShopify ? 'Shopify' : 'Etsy'}
            </span>
        </motion.div>
    );
}

export default function SyncingDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const jobId = searchParams.get('job_id');

    const supabase = useMemo(() => createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ), []);

    const [job, setJob] = useState<SyncJob | null>(null);
    const [events, setEvents] = useState<SyncEvent[]>([]);
    const feedEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!jobId) { router.push('/setup'); return; }

        const fetchInitialJob = async () => {
            const { data } = await supabase.from('sync_jobs').select('*').eq('id', jobId).single();
            if (data) {
                setJob(data);
                if (data.message) setEvents([parseMessage(data.message)]);
            }
        };

        fetchInitialJob();

        const channel = supabase
            .channel(`job_${jobId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'sync_jobs', filter: `id=eq.${jobId}`
            }, (payload: any) => {
                const newJob = payload.new as SyncJob;
                setJob(newJob);
                if (newJob.message) {
                    const event = parseMessage(newJob.message);
                    setEvents(prev => {
                        // For product_clone events: UPDATE existing entry instead of adding duplicate
                        if (event.type === 'product_clone') {
                            const productKey = `${event.direction}-${event.product.name}`;
                            const existingIdx = prev.findIndex(e =>
                                e.type === 'product_clone' &&
                                `${e.direction}-${e.product.name}` === productKey
                            );
                            if (existingIdx !== -1) {
                                // Replace existing with updated status
                                const updated = [...prev];
                                updated[existingIdx] = event;
                                return updated;
                            }
                        }

                        // For other events: deduplicate by text
                        const lastText = (e: SyncEvent) =>
                            e.type === 'log' ? e.text :
                                e.type === 'stock_sync' ? `stock-${e.product.name}` :
                                    `clone-${(e as ProductCloneEvent).product.name}`;
                        const last = prev[prev.length - 1];
                        if (last && lastText(last) === lastText(event)) return prev;

                        return [...prev, event];
                    });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [jobId, router, supabase]);

    useEffect(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    const isComplete = job?.status === 'completed';
    const isFailed = job?.status === 'failed';
    const isProcessing = job?.status === 'processing';

    const cloneEvents = events.filter(e => e.type === 'product_clone') as ProductCloneEvent[];
    const toShopifyCount = cloneEvents.filter(e => e.direction === 'to_shopify').length;
    const toEtsyCount = cloneEvents.filter(e => e.direction === 'to_etsy').length;

    return (
        <div className="h-screen bg-[#F9FAFB] flex flex-col p-4 font-sans overflow-hidden">
            {/* Header — fixed height */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm shrink-0 mb-3">
                <div className="px-5 py-4 flex items-center gap-4">
                    <AnimatePresence mode="wait">
                        {isComplete ? (
                            <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                            </motion.div>
                        ) : isFailed ? (
                            <motion.div key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                            </motion.div>
                        ) : (
                            <motion.div key="spin" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" style={{ animationDuration: '2s' }} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-gray-900">
                            {isComplete ? 'Sync Complete' : isFailed ? 'Sync Failed' : 'Syncing in Progress'}
                        </h2>
                        <p className="text-xs text-gray-500">
                            {isComplete ? 'All operations completed successfully.'
                                : isFailed ? 'An error occurred during the process.'
                                    : 'Please don\'t close this page.'}
                        </p>
                    </div>

                    {/* Counters */}
                    {(toShopifyCount > 0 || toEtsyCount > 0) && (
                        <div className="flex items-center gap-2 shrink-0">
                            {toShopifyCount > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#95BF47]/10 text-[#6d8e2e]">
                                    <Store className="w-3 h-3" />{toShopifyCount}
                                </span>
                            )}
                            {toEtsyCount > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F56400]/10 text-[#d45500]">
                                    <ShoppingBag className="w-3 h-3" />{toEtsyCount}
                                </span>
                            )}
                        </div>
                    )}

                    {isProcessing && (
                        <div className="flex items-center gap-1 shrink-0">
                            {[0, 1, 2].map(i => (
                                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Event Feed — fills remaining space, inner scroll */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
                    <Zap className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Live Operations</span>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <RefreshCw className="w-5 h-5 mb-2 animate-spin opacity-30" style={{ animationDuration: '3s' }} />
                            <p className="text-xs">Waiting for operations...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <AnimatePresence>
                                {events.map((event, i) => {
                                    if (event.type === 'product_clone') return <ProductCloneCard key={`c-${event.product.name}-${event.direction}`} event={event} />;
                                    if (event.type === 'stock_sync') return <StockSyncRow key={`s-${i}`} event={event} />;
                                    return (
                                        <motion.div key={`l-${i}`}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            className={`flex items-start gap-2 px-2 py-1 text-xs ${i === events.length - 1 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}
                                        >
                                            <span className="text-gray-300 select-none shrink-0">›</span>
                                            <span>{event.text}</span>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            <div ref={feedEndRef} className="h-1 shrink-0" />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer button — fixed at bottom */}
            <AnimatePresence>
                {(isComplete || isFailed) && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 shrink-0">
                        <button
                            onClick={() => router.push('/setup')}
                            className="w-full px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Setup
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
