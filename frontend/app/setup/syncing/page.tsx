'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
    CheckCircle2, Loader2, Package,
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

/** Trim variant suffix: "Cool T-Shirt - Large / Blue" → "Cool T-Shirt" */
function cleanName(name: string): string {
    return (name || '').split(' - ')[0].trim();
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

    // Group clone events by direction
    const toShopifyEvents = events.filter(e => e.type === 'product_clone' && e.direction === 'to_shopify') as ProductCloneEvent[];
    const toEtsyEvents = events.filter(e => e.type === 'product_clone' && e.direction === 'to_etsy') as ProductCloneEvent[];
    const logEvents = events.filter(e => e.type === 'log' || e.type === 'stock_sync');

    const renderProductItem = (event: ProductCloneEvent) => (
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
                <span className="text-sm text-gray-900 font-medium truncate block">{cleanName(event.product.name)}</span>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
                {event.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                {event.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                {event.status === 'cloning' && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" style={{ animationDuration: '1.2s' }} />}
            </div>
        </motion.div>
    );

    return (
        <div style={{ margin: 0, padding: 0, height: '100vh', overflow: 'hidden' }}
            className="bg-[#F6F6F7] flex flex-col items-center justify-start font-sans"
        >
            {/* Centered spinner / status icon */}
            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md px-4">
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
                        <motion.div key="spin" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="mb-5"
                        >
                            <Loader2 className="w-12 h-12 text-gray-800 animate-spin" style={{ animationDuration: '1.2s' }} />
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
            </div>

            {/* Log Stream — grouped by direction */}
            <div className="w-full max-w-md flex-1 min-h-0 px-4 pb-3">
                <div className="h-full overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-sm">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                            <Loader2 className="w-5 h-5 mb-2 animate-spin opacity-30" style={{ animationDuration: '2s' }} />
                            <p className="text-xs">Waiting for operations...</p>
                        </div>
                    ) : (
                        <div>
                            {/* To Shopify Section */}
                            {toShopifyEvents.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                        <Store className="w-4 h-4 text-[#95BF47]" />
                                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">To Shopify</span>
                                        <span className="ml-auto text-[11px] text-gray-400 tabular-nums">{toShopifyEvents.length}</span>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        <AnimatePresence>
                                            {toShopifyEvents.map(e => renderProductItem(e))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}

                            {/* To Etsy Section */}
                            {toEtsyEvents.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 border-t">
                                        <ShoppingBag className="w-4 h-4 text-[#F56400]" />
                                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">To Etsy</span>
                                        <span className="ml-auto text-[11px] text-gray-400 tabular-nums">{toEtsyEvents.length}</span>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        <AnimatePresence>
                                            {toEtsyEvents.map(e => renderProductItem(e))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}

                            {/* Log messages */}
                            {logEvents.length > 0 && (
                                <div className="divide-y divide-gray-50">
                                    <AnimatePresence>
                                        {logEvents.map((event, i) => {
                                            if (event.type === 'stock_sync') {
                                                return (
                                                    <motion.div key={`s-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                        className="flex items-center gap-3 px-4 py-2.5 text-xs text-gray-500"
                                                    >
                                                        <span className="flex-1 truncate">{cleanName(event.product.name)}</span>
                                                        <span className="tabular-nums text-gray-400">{event.product.old_stock} → {event.product.new_stock}</span>
                                                    </motion.div>
                                                );
                                            }
                                            return (
                                                <motion.div key={`l-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                    className={`px-4 py-2 text-xs ${i === logEvents.length - 1 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}
                                                >
                                                    <span className="text-gray-300 mr-1.5">›</span>{event.text}
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}

                            <div ref={feedEndRef} className="h-1 shrink-0" />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Button */}
            <AnimatePresence>
                {(isComplete || isFailed) && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md px-4 pb-6">
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
