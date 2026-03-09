'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { CheckCircle2, Loader2, Package, ShoppingBag, Store, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface SyncJob {
    id: string;
    status: SyncStatus;
    current_step: number;
    total_steps: number;
    message: string;
    updated_at: string;
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

interface SyncProgressModalProps {
    isOpen: boolean;
    jobId: string | null;
    onClose: () => void;
}

function parseEvent(raw: string): SyncEvent {
    try {
        const parsed = JSON.parse(raw);
        if (parsed.type) return parsed;
    } catch { }
    return { type: 'log', text: raw };
}

function parseAllEvents(message: string): SyncEvent[] {
    if (!message) return [];
    try {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed)) {
            return parsed.map((item: string) => parseEvent(item));
        }
        if (parsed.type) return [parsed as SyncEvent];
    } catch { }
    return [{ type: 'log', text: message }];
}

function cleanName(name: string): string {
    return (name || '').split(' - ')[0].trim();
}

function dedupeCloneEvents(events: SyncEvent[]): SyncEvent[] {
    const result: SyncEvent[] = [];
    const cloneMap = new Map<string, number>();

    for (const event of events) {
        if (event.type === 'product_clone') {
            const key = `${event.direction}-${event.product.name}`;
            const existingIdx = cloneMap.get(key);
            if (existingIdx !== undefined) {
                result[existingIdx] = event;
                continue;
            }
            cloneMap.set(key, result.length);
        }
        result.push(event);
    }
    return result;
}

export default function SyncProgressModal({ isOpen, jobId, onClose }: SyncProgressModalProps) {
    const supabase = useMemo(() => createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ), []);

    const [job, setJob] = useState<SyncJob | null>(null);
    const [events, setEvents] = useState<SyncEvent[]>([]);
    const feedEndRef = useRef<HTMLDivElement>(null);
    const lastMessageHash = useRef<string>('');
    const isDone = useRef(false);

    const processJobUpdate = useCallback((newJob: SyncJob) => {
        const hash = `${newJob.status}:${newJob.message?.length || 0}:${newJob.updated_at}`;
        if (hash === lastMessageHash.current) return;
        lastMessageHash.current = hash;

        setJob(newJob);

        if (newJob.status === 'completed' || newJob.status === 'failed') {
            isDone.current = true;
        }

        if (newJob.message) {
            const allEvents = parseAllEvents(newJob.message).filter(e => e.type !== 'stock_sync');
            const deduped = dedupeCloneEvents(allEvents);
            setEvents(deduped);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || !jobId) {
            setJob(null);
            setEvents([]);
            isDone.current = false;
            lastMessageHash.current = '';
            return;
        }

        const fetchJob = async () => {
            const { data } = await supabase.from('sync_jobs').select('*').eq('id', jobId).single();
            if (data) processJobUpdate(data);
        };
        fetchJob();

        const channel = supabase
            .channel(`job_${jobId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'sync_jobs', filter: `id=eq.${jobId}`
            }, (payload: any) => {
                processJobUpdate(payload.new as SyncJob);
            })
            .subscribe();

        const pollInterval = setInterval(async () => {
            if (isDone.current) { clearInterval(pollInterval); return; }
            const { data } = await supabase.from('sync_jobs').select('*').eq('id', jobId).single();
            if (data) processJobUpdate(data);
        }, 2000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [jobId, isOpen, supabase, processJobUpdate]);

    useEffect(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    if (!isOpen) return null;

    const isComplete = job?.status === 'completed';
    const isFailed = job?.status === 'failed';
    const toShopifyEvents = events.filter(e => e.type === 'product_clone' && e.direction === 'to_shopify') as ProductCloneEvent[];
    const toEtsyEvents = events.filter(e => e.type === 'product_clone' && e.direction === 'to_etsy') as ProductCloneEvent[];

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
                {event.status === 'cloning' && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
            </div>
        </motion.div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#F6F6F7] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
            >
                {/* Header */}
                <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isComplete ? (
                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            </div>
                        ) : isFailed ? (
                            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">
                                {isComplete ? 'Sync Complete' : isFailed ? 'Sync Failed' : 'Syncing in Progress'}
                            </h2>
                            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">
                                {isComplete ? 'All products cloned successfully' : isFailed ? 'Some operations failed' : 'Please wait for completion'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="w-5 h-5 mb-2 animate-spin opacity-30" />
                                <p className="text-xs">Preparing sync job...</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {/* To Shopify Section */}
                                {toShopifyEvents.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                            <Store className="w-4 h-4 text-[#95BF47]" />
                                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">To Shopify</span>
                                        </div>
                                        <div className="divide-y divide-gray-50">
                                            {toShopifyEvents.map(e => renderProductItem(e))}
                                        </div>
                                    </div>
                                )}

                                {/* To Etsy Section */}
                                {toEtsyEvents.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 border-t">
                                            <ShoppingBag className="w-4 h-4 text-[#F56400]" />
                                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">To Etsy</span>
                                        </div>
                                        <div className="divide-y divide-gray-50">
                                            {toEtsyEvents.map(e => renderProductItem(e))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div ref={feedEndRef} />
                    </div>
                </div>

                {/* Footer */}
                {(isComplete || isFailed) && (
                    <div className="p-4 bg-white border-t border-gray-200">
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-sm transition-all active:scale-95"
                        >
                            Close Catalog
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
