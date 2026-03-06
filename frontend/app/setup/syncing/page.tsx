'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
    CheckCircle2, RefreshCw, Package,
    ShoppingBag, Store, AlertCircle, ArrowRight
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
                        if (event.type === 'product_clone') {
                            const productKey = `${event.direction}-${event.product.name}`;
                            const existingIdx = prev.findIndex(e =>
                                e.type === 'product_clone' &&
                                `${e.direction}-${e.product.name}` === productKey
                            );
                            if (existingIdx !== -1) {
                                const updated = [...prev];
                                updated[existingIdx] = event;
                                return updated;
                            }
                        }
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
    const progress = job ? Math.min(100, Math.max(0, Math.round((job.current_step / Math.max(1, job.total_steps)) * 100))) : 0;

    const cloneEvents = events.filter(e => e.type === 'product_clone') as ProductCloneEvent[];
    const toShopifyCount = cloneEvents.filter(e => e.direction === 'to_shopify').length;
    const toEtsyCount = cloneEvents.filter(e => e.direction === 'to_etsy').length;

    return (
        <div className="h-screen bg-[#F6F6F7] flex flex-col items-center justify-start font-sans overflow-hidden px-4 pt-12">

            {/* Status Icon */}
            <AnimatePresence mode="wait">
                {isComplete ? (
                    <motion.div key="done" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5"
                    >
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </motion.div>
                ) : isFailed ? (
                    <motion.div key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-5"
                    >
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </motion.div>
                ) : (
                    <motion.div key="spin" initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="w-16 h-16 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mb-5 shadow-sm"
                    >
                        <RefreshCw className="w-7 h-7 text-gray-800 animate-spin" style={{ animationDuration: '2s' }} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Title */}
            <h1 className="text-xl font-bold text-gray-900 mb-1">
                {isComplete ? 'Sync Complete' : isFailed ? 'Sync Failed' : 'Syncing in Progress'}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
                {isComplete ? 'All operations completed successfully.'
                    : isFailed ? 'An error occurred during the process.'
                        : 'Please don\'t close this page.'}
            </p>

            {/* Counters */}
            {(toShopifyCount > 0 || toEtsyCount > 0) && (
                <div className="flex items-center gap-3 mb-6">
                    {toShopifyCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700">
                            <Store className="w-3.5 h-3.5 text-[#95BF47]" />{toShopifyCount} to Shopify
                        </span>
                    )}
                    {toEtsyCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700">
                            <ShoppingBag className="w-3.5 h-3.5 text-[#F56400]" />{toEtsyCount} to Etsy
                        </span>
                    )}
                </div>
            )}

            {/* Progress Bar */}
            <div className="w-full max-w-md mb-2">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : isFailed ? 'bg-red-400' : 'bg-gray-900'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${isComplete ? 100 : progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
                <div className="flex justify-between mt-1.5">
                    <span className="text-[11px] text-gray-400 font-medium">
                        {isComplete ? 'Done' : isFailed ? 'Error' : 'Processing...'}
                    </span>
                    <span className="text-[11px] text-gray-500 font-semibold tabular-nums">
                        {isComplete ? '100' : progress}%
                    </span>
                </div>
            </div>

            {/* Log Stream */}
            <div className="w-full max-w-md flex-1 min-h-0 mt-4 mb-3">
                <div className="h-full overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-sm">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                            <RefreshCw className="w-5 h-5 mb-2 animate-spin opacity-30" style={{ animationDuration: '3s' }} />
                            <p className="text-xs">Waiting for operations...</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            <AnimatePresence>
                                {events.map((event, i) => {
                                    if (event.type === 'product_clone') {
                                        const isShopify = event.direction === 'to_shopify';
                                        return (
                                            <motion.div
                                                key={`c-${event.product.name}-${event.direction}`}
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="flex items-center gap-3 px-4 py-3"
                                            >
                                                {event.product.image ? (
                                                    <img src={event.product.image} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                                        <Package className="w-3.5 h-3.5 text-gray-400" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm text-gray-900 font-medium truncate block">{event.product.name}</span>
                                                    <span className="text-[11px] text-gray-400">${event.product.price} · {event.product.stock} in stock</span>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-1.5">
                                                    {event.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                    {event.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                                    {event.status === 'cloning' && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" style={{ animationDuration: '1.5s' }} />}
                                                    {isShopify
                                                        ? <Store className="w-3.5 h-3.5 text-[#95BF47]" />
                                                        : <ShoppingBag className="w-3.5 h-3.5 text-[#F56400]" />
                                                    }
                                                </div>
                                            </motion.div>
                                        );
                                    }
                                    if (event.type === 'stock_sync') {
                                        return (
                                            <motion.div
                                                key={`s-${i}`}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex items-center gap-3 px-4 py-2.5 text-xs text-gray-500"
                                            >
                                                <span className="flex-1 truncate">{event.product.name}</span>
                                                <span className="tabular-nums text-gray-400">{event.product.old_stock} → {event.product.new_stock}</span>
                                            </motion.div>
                                        );
                                    }
                                    return (
                                        <motion.div
                                            key={`l-${i}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={`px-4 py-2 text-xs ${i === events.length - 1 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}
                                        >
                                            <span className="text-gray-300 mr-1.5">›</span>{event.text}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            <div ref={feedEndRef} className="h-1 shrink-0" />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Button */}
            <AnimatePresence>
                {(isComplete || isFailed) && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md pb-6">
                        <button
                            onClick={() => router.push(isComplete ? '/setup/plans' : '/setup')}
                            className="w-full px-5 py-3.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
                        >
                            {isComplete ? (
                                <><ArrowRight className="w-4 h-4" /> Choose a Plan</>
                            ) : (
                                <><ArrowRight className="w-4 h-4" /> Back to Setup</>
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
