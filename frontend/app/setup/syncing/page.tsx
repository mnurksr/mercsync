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

// Event types
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

// ── Direction Badge ──
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

// ── Status Icon ──
function StatusIcon({ status }: { status: 'cloning' | 'success' | 'failed' }) {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
    return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" style={{ animationDuration: '1.5s' }} />;
}

// ── Product Clone Card ──
function ProductCloneCard({ event }: { event: ProductCloneEvent }) {
    const isShopify = event.direction === 'to_shopify';
    const ringColor = event.status === 'failed' ? 'border-red-200'
        : isShopify ? 'border-[#95BF47]/20' : 'border-[#F56400]/20';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
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
                    <span>Stok: {event.product.stock}</span>
                    {event.product.sku && event.product.sku !== 'NO-SKU' && (
                        <><span>·</span><span className="text-gray-400">{event.product.sku}</span></>
                    )}
                </div>
            </div>
            <DirectionBadge direction={event.direction} />
        </motion.div>
    );
}

// ── Stock Sync Row ──
function StockSyncRow({ event }: { event: StockSyncEvent }) {
    const isShopify = event.platform === 'shopify';
    return (
        <motion.div
            initial={{ opacity: 0, x: -6 }}
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

// ── Main Page ──
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
                        const key = (e: SyncEvent) =>
                            e.type === 'log' ? e.text :
                                e.type === 'product_clone' ? `${e.direction}-${e.product.name}-${e.status}` :
                                    `stock-${e.product.name}`;
                        const last = prev[prev.length - 1];
                        if (last && key(last) === key(event)) return prev;
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
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 font-sans">
            <div className="max-w-lg w-full flex flex-col" style={{ maxHeight: '90vh' }}>

                {/* Header Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
                    <div className="p-6 text-center">
                        <AnimatePresence mode="wait">
                            {isComplete ? (
                                <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                                </motion.div>
                            ) : isFailed ? (
                                <motion.div key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <AlertCircle className="w-7 h-7 text-red-500" />
                                </motion.div>
                            ) : (
                                <motion.div key="spin" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" style={{ animationDuration: '2s' }} />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <h2 className="text-xl font-bold text-gray-900 mb-1">
                            {isComplete ? 'Senkronizasyon Tamamlandı' : isFailed ? 'Bir Hata Oluştu' : 'Senkronizasyon Devam Ediyor'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {isComplete ? 'Tüm işlemler başarıyla tamamlandı.'
                                : isFailed ? 'İşlem sırasında bir hata oluştu.'
                                    : 'Lütfen bu sayfayı kapatmayın.'}
                        </p>

                        {/* Counters */}
                        {(toShopifyCount > 0 || toEtsyCount > 0) && (
                            <div className="flex items-center justify-center gap-3 mt-3">
                                {toShopifyCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#95BF47]/10 text-[#6d8e2e]">
                                        <Store className="w-3 h-3" />{toShopifyCount} → Shopify
                                    </span>
                                )}
                                {toEtsyCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F56400]/10 text-[#d45500]">
                                        <ShoppingBag className="w-3 h-3" />{toEtsyCount} → Etsy
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Animated dots indicator */}
                        {isProcessing && (
                            <div className="flex items-center justify-center gap-1 mt-3">
                                {[0, 1, 2].map(i => (
                                    <motion.div
                                        key={i}
                                        className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Event Feed */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 overflow-hidden flex flex-col" style={{ minHeight: '280px' }}>
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
                        <Zap className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Canlı İşlemler</span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3">
                        {events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400">
                                <RefreshCw className="w-6 h-6 mb-2 animate-spin opacity-40" style={{ animationDuration: '3s' }} />
                                <p className="text-sm">Bekleniyor...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <AnimatePresence>
                                    {events.map((event, i) => {
                                        if (event.type === 'product_clone') return <ProductCloneCard key={`c-${i}`} event={event} />;
                                        if (event.type === 'stock_sync') return <StockSyncRow key={`s-${i}`} event={event} />;
                                        return (
                                            <motion.div key={`l-${i}`}
                                                initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                                                className={`flex items-start gap-2 px-3 py-1.5 text-sm ${i === events.length - 1 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}
                                            >
                                                <span className="text-gray-300 select-none shrink-0">›</span>
                                                <span className="leading-relaxed">{event.text}</span>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <div ref={feedEndRef} className="h-1 shrink-0" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <AnimatePresence>
                    {(isComplete || isFailed) && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4"
                        >
                            <button
                                onClick={() => router.push('/setup')}
                                className="w-full px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                            >
                                <ArrowLeft className="w-4 h-4" /> Kuruluma Dön
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
