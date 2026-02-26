'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2, CheckCircle2, RefreshCw, ArrowRight, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface SyncJob {
    id: string;
    status: SyncStatus;
    current_step: number;
    total_steps: number;
    message: string;
}

export default function SyncingDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const jobId = searchParams.get('job_id');

    // Create a dedicated Supabase client (works without auth session)
    const supabase = useMemo(() => createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ), []);

    const [job, setJob] = useState<SyncJob | null>(null);
    const [messages, setMessages] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
                    setMessages([data.message]);
                }
            } else if (error) {
                console.error("Error fetching job:", error);
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
                        setMessages((prev) => {
                            // Sadece farklı bir mesajsa ekle
                            if (prev[prev.length - 1] !== newJob.message) {
                                return [...prev, newJob.message];
                            }
                            return prev;
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [jobId, router, supabase]);

    // Otomatik aşağı kaydırma
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const isComplete = job?.status === 'completed';
    // Hesaplama
    const progress = (job?.total_steps && job?.current_step)
        ? Math.min(100, Math.round((job.current_step / job.total_steps) * 100))
        : 0;

    return (
        <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-6 font-sans">
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-[600px]">

                {/* Header Section */}
                <div className="bg-indigo-600 relative overflow-hidden flex flex-col items-center justify-center p-10 shrink-0">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
                    <div className="relative text-center w-full z-10 flex flex-col items-center">
                        <AnimatePresence mode="wait">
                            {isComplete ? (
                                <motion.div
                                    key="complete"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 ring-4 ring-white/10"
                                >
                                    <CheckCircle2 className="w-12 h-12 text-white" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="progress"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 ring-4 ring-white/10 shadow-inner"
                                >
                                    <RefreshCw className="w-10 h-10 text-white animate-spin" />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">
                            {isComplete ? 'İşlemler Tamamlandı!' : 'Senkronizasyon Odası...'}
                        </h2>
                        <p className="text-indigo-100 font-medium">
                            {isComplete
                                ? 'Tüm adımlar başarıyla tamamlandı, ilerleyebilirsiniz.'
                                : 'Lütfen bu ekranı kapatmayın, işlemler arka planda devam ediyor.'}
                        </p>
                    </div>
                </div>

                {/* Body Section */}
                <div className="p-8 flex-1 flex flex-col overflow-hidden bg-gray-50/50">

                    {/* Progress Bar & Current Status */}
                    <div className="mb-6">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">İlerleme Durumu</span>
                            <span className="text-2xl font-black text-indigo-600">{progress}%</span>
                        </div>
                        <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                            <motion.div
                                className={`absolute top-0 left-0 h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-indigo-600'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                        </div>
                        <div className="flex justify-between mt-2">
                            <span className="text-xs text-gray-500 font-medium">
                                {job?.status === 'processing' ? 'Çalışıyor...' : job?.status === 'pending' ? 'Bekleniyor...' : job?.status === 'completed' ? 'Bitti' : ''}
                            </span>
                            {!isComplete && job?.total_steps ? (
                                <span className="text-xs text-gray-500 font-bold">
                                    Adım {job.current_step} / {job.total_steps}
                                </span>
                            ) : <span />}
                        </div>
                    </div>

                    {/* Live Logs Terminal-style */}
                    <div className="flex-1 bg-[#0D1117] rounded-2xl p-4 overflow-y-auto font-mono text-sm shadow-inner flex flex-col gap-2 border border-gray-800 relative">
                        <div className="absolute top-3 right-4 opacity-50 flex items-center gap-1.5 text-xs text-gray-400">
                            <Terminal className="w-3.5 h-3.5" /> Canlı Loglar
                        </div>
                        {messages.length === 0 ? (
                            <div className="text-gray-500 italic mt-6">&gt; N8N'den webhook dinleniyor...</div>
                        ) : (
                            <div className="mt-4 flex flex-col gap-2">
                                {messages.map((msg, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        key={i}
                                        className={`flex gap-3 leading-tight ${i === messages.length - 1 ? 'text-[#4ade80] font-semibold' : 'text-gray-400'}`}
                                    >
                                        <span className="text-gray-600 select-none shrink-0">&gt;</span>
                                        <span className="break-words">{msg}</span>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4 shrink-0" />
                    </div>

                    {/* Footer Actions */}
                    <AnimatePresence>
                        {isComplete && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-6 flex justify-center shrink-0"
                            >
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="px-8 py-3.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
                                >
                                    Dashboard'a Git <ArrowRight className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>
        </div>
    );
}
