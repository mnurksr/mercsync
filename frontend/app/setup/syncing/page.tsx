'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { CheckCircle2, RefreshCw, ArrowRight, Terminal, ShoppingBag, Store, Package, ArrowRightLeft, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface SyncJob {
    id: string;
    status: SyncStatus;
    current_step: number;
    total_steps: number;
    message: string;
}

// Event types from n8n
type LogEvent = {
    type: 'log';
    text: string;
    timestamp: string;
};

type ProductCloneEvent = {
    type: 'product_clone';
    direction: 'to_shopify' | 'to_etsy';
    product: {
        name: string;
        price: number;
        stock: number;
        image?: string;
        sku?: string;
    };
    status: 'cloning' | 'success' | 'failed';
    text: string;
    timestamp: string;
};

type StockSyncEvent = {
    type: 'stock_sync';
    platform: 'shopify' | 'etsy';
    product: {
        name: string;
        old_stock: number;
        new_stock: number;
        sku?: string;
    };
    text: string;
    timestamp: string;
};

type SyncEvent = LogEvent | ProductCloneEvent | StockSyncEvent;

function parseMessage(raw: string): SyncEvent {
    try {
        const parsed = JSON.parse(raw);
        if (parsed.type) return { ...parsed, timestamp: parsed.timestamp || new Date().toISOString() };
    } catch { }
    // Plain text fallback
    return { type: 'log', text: raw, timestamp: new Date().toISOString() };
}

// Direction badge component
function DirectionBadge({ direction }: { direction: 'to_shopify' | 'to_etsy' }) {
    if (direction === 'to_shopify') {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/20">
                <Store className="w-3 h-3" />
                <span>→ Shopify</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/20">
            <ShoppingBag className="w-3 h-3" />
            <span>→ Etsy</span>
        </div>
    );
}

// Product clone card component
function ProductCloneCard({ event }: { event: ProductCloneEvent }) {
    const isShopify = event.direction === 'to_shopify';
    const borderColor = isShopify ? 'border-green-500/30' : 'border-orange-500/30';
    const bgGlow = isShopify ? 'shadow-green-500/5' : 'shadow-orange-500/5';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`flex items-center gap-3 p-3 rounded-xl border ${borderColor} bg-white/[0.03] backdrop-blur-sm shadow-lg ${bgGlow}`}
        >
            {/* Product Image */}
            {event.product.image ? (
                <img
                    src={event.product.image}
                    alt={event.product.name}
                    className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                />
            ) : (
                <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-gray-500" />
                </div>
            )}

            {/* Product Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-semibold text-sm truncate">{event.product.name}</span>
                    {event.status === 'success' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="font-medium">${event.product.price}</span>
                    <span>•</span>
                    <span>Stok: {event.product.stock}</span>
                    {event.product.sku && event.product.sku !== 'NO-SKU' && (
                        <>
                            <span>•</span>
                            <span className="text-gray-500">{event.product.sku}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Direction Badge */}
            <DirectionBadge direction={event.direction} />
        </motion.div>
    );
}

// Stock sync event component
function StockSyncCard({ event }: { event: StockSyncEvent }) {
    const isShopify = event.platform === 'shopify';
    const color = isShopify ? 'text-green-400' : 'text-orange-400';

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]"
        >
            <ArrowRightLeft className={`w-4 h-4 ${color} shrink-0`} />
            <div className="flex-1 min-w-0">
                <span className="text-gray-300 text-sm">{event.product.name}</span>
                <span className="text-gray-500 text-xs ml-2">
                    {event.product.old_stock} → {event.product.new_stock}
                </span>
            </div>
            <span className={`text-[10px] font-bold uppercase ${color}`}>
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
        if (!jobId) {
            router.push('/setup');
            return;
        }

        const fetchInitialJob = async () => {
            const { data, error } = await supabase
                .from('sync_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (data) {
                setJob(data);
                if (data.message) {
                    setEvents([parseMessage(data.message)]);
                }
            }
        };

        fetchInitialJob();

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`job_${jobId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'sync_jobs',
                    filter: `id=eq.${jobId}`,
                },
                (payload: any) => {
                    const newJob = payload.new as SyncJob;
                    setJob(newJob);

                    if (newJob.message) {
                        const event = parseMessage(newJob.message);
                        setEvents((prev) => {
                            // Deduplicate by comparing last event text
                            const lastEvent = prev[prev.length - 1];
                            const newText = event.type === 'log' ? event.text :
                                event.type === 'product_clone' ? `${event.direction}-${event.product.name}` :
                                    `stock-${event.product.name}`;
                            const lastText = lastEvent?.type === 'log' ? lastEvent.text :
                                lastEvent?.type === 'product_clone' ? `${lastEvent.direction}-${lastEvent.product.name}` :
                                    lastEvent?.type === 'stock_sync' ? `stock-${lastEvent.product.name}` : '';

                            if (lastText === newText) return prev;
                            return [...prev, event];
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [jobId, router, supabase]);

    // Auto-scroll
    useEffect(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    const isComplete = job?.status === 'completed';
    const isFailed = job?.status === 'failed';
    const progress = (job?.total_steps && job?.current_step)
        ? Math.min(100, Math.round((job.current_step / job.total_steps) * 100))
        : 0;

    // Count cloned products
    const cloneEvents = events.filter(e => e.type === 'product_clone') as ProductCloneEvent[];
    const toShopifyCount = cloneEvents.filter(e => e.direction === 'to_shopify').length;
    const toEtsyCount = cloneEvents.filter(e => e.direction === 'to_etsy').length;

    // Determine phase
    const hasProductClones = cloneEvents.length > 0;
    const phaseLabel = isComplete ? 'Tamamlandı' :
        isFailed ? 'Hata' :
            hasProductClones ? 'Ürün Klonlama' : 'Stok Senkronizasyonu';

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 font-sans">
            <div className="max-w-2xl w-full bg-[#12121a] rounded-2xl shadow-2xl overflow-hidden border border-white/[0.06] flex flex-col" style={{ maxHeight: '85vh' }}>

                {/* Header */}
                <div className="relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />

                    <div className="relative px-8 py-8 text-center">
                        <AnimatePresence mode="wait">
                            {isComplete ? (
                                <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 ring-2 ring-white/10">
                                    <CheckCircle2 className="w-9 h-9 text-white" />
                                </motion.div>
                            ) : (
                                <motion.div key="spin" initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 ring-2 ring-white/10">
                                    <RefreshCw className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '2s' }} />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <h2 className="text-2xl font-bold text-white mb-1">
                            {isComplete ? 'Senkronizasyon Tamamlandı!' : isFailed ? 'Bir Hata Oluştu' : 'Senkronizasyon Odası'}
                        </h2>
                        <p className="text-indigo-100/80 text-sm">
                            {isComplete
                                ? 'Tüm işlemler başarıyla tamamlandı.'
                                : isFailed
                                    ? 'İşlem sırasında bir sorun oluştu.'
                                    : 'Lütfen bu ekranı kapatmayın, işlemler devam ediyor.'}
                        </p>

                        {/* Clone counters */}
                        {(toShopifyCount > 0 || toEtsyCount > 0) && (
                            <div className="flex items-center justify-center gap-4 mt-4">
                                {toShopifyCount > 0 && (
                                    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-xs text-white/90 font-medium">
                                        <Store className="w-3 h-3" />
                                        <span>{toShopifyCount} → Shopify</span>
                                    </div>
                                )}
                                {toEtsyCount > 0 && (
                                    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-xs text-white/90 font-medium">
                                        <ShoppingBag className="w-3 h-3" />
                                        <span>{toEtsyCount} → Etsy</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Section */}
                <div className="px-6 pt-5 pb-3 shrink-0 border-b border-white/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isComplete ? 'bg-emerald-400' : isFailed ? 'bg-red-400' : 'bg-indigo-400 animate-pulse'}`} />
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{phaseLabel}</span>
                        </div>
                        <span className="text-xl font-black text-white tabular-nums">{progress}%</span>
                    </div>
                    <div className="relative w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                            className={`absolute top-0 left-0 h-full rounded-full ${isComplete ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                                }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                    </div>
                    {!isComplete && job?.total_steps ? (
                        <div className="flex justify-between mt-1.5">
                            <span className="text-[10px] text-gray-500">
                                {job?.status === 'processing' ? 'İşleniyor...' : 'Bekleniyor...'}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold tabular-nums">
                                {job.current_step} / {job.total_steps}
                            </span>
                        </div>
                    ) : null}
                </div>

                {/* Event Feed */}
                <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: '200px' }}>
                    <div className="flex items-center gap-2 mb-3 px-2">
                        <Terminal className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">Canlı İşlemler</span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                    </div>

                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                            <Zap className="w-8 h-8 mb-3 opacity-30" />
                            <p className="text-sm">Webhook bekleniyor...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <AnimatePresence>
                                {events.map((event, i) => {
                                    if (event.type === 'product_clone') {
                                        return <ProductCloneCard key={`clone-${i}`} event={event} />;
                                    }
                                    if (event.type === 'stock_sync') {
                                        return <StockSyncCard key={`stock-${i}`} event={event} />;
                                    }
                                    // Log event
                                    return (
                                        <motion.div
                                            key={`log-${i}`}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`flex items-start gap-2 px-3 py-1.5 text-sm ${i === events.length - 1 ? 'text-indigo-300' : 'text-gray-500'
                                                }`}
                                        >
                                            <span className="text-gray-600 select-none shrink-0 font-mono">›</span>
                                            <span className="break-words leading-relaxed">{event.text}</span>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            <div ref={feedEndRef} className="h-2 shrink-0" />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <AnimatePresence>
                    {isComplete && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="px-6 py-4 border-t border-white/[0.06] shrink-0"
                        >
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="w-full px-6 py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                            >
                                Dashboard'a Git <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
