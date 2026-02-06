'use client';

import { useState, useEffect } from 'react';
import { Upload, ArrowRight, Check, X, Link as LinkIcon, FileSpreadsheet, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

import MapperUploadStep from '@/components/MapperUploadStep';
import MatchingDesk from '@/components/MatchingDesk';
import MapperReportStep, { MapperAnalysisResponse } from '@/components/MapperReportStep';

export default function StockMapperWizard() {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const { user } = useAuth();
    const router = useRouter();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [pendingMatches, setPendingMatches] = useState<any[] | null>(null);
    const [isCheckingRestore, setIsCheckingRestore] = useState(true);

    // Data State
    const [mapperData, setMapperData] = useState({
        matched: [],
        unmatched_shopify: [],
        unmatched_etsy: []
    });

    const [reportData, setReportData] = useState<MapperAnalysisResponse | null>(null);

    // ... (handleUploadSuccess remains the same) ...
    const handleUploadSuccess = (data: any) => {
        // n8n returns an array with a single object containing the lists
        // Output format: [ { matched: [...], unmatched_shopify: [...], unmatched_etsy: [...] } ]

        const payload = Array.isArray(data) ? data[0] : data;

        // Helper to normalize product data for MatchingDesk
        // SPREAD full item to preserve all original CSV columns as requested
        const normalizeShopify = (item: any) => ({
            ...item,
            id: item.source_id,
            title: item.product_name,
            sku: item.sku_code,
            price: item.price,
            image: item.image || ''
        });

        const normalizeEtsy = (item: any) => ({
            ...item,
            id: item.source_id,
            title: item.product_name,
            sku: item.sku_code,
            price: item.price,
            image: item.image || ''
        });

        const structuredData = {
            matched: (payload.matched || []).map((m: any) => ({
                pair_id: m.pair_id,
                shopify: normalizeShopify(m.shopify),
                etsy: normalizeEtsy(m.etsy)
            })),
            unmatched_shopify: (payload.unmatched_shopify || []).map(normalizeShopify),
            unmatched_etsy: (payload.unmatched_etsy || []).map(normalizeEtsy)
        };

        console.log('Processed Mapper Data:', structuredData);
        setMapperData(structuredData);
        setStep(2);
    };


    // Restore state if user logs in after being prompted
    useEffect(() => {
        const checkRestore = async () => {
            if (user) {
                const savedMatches = localStorage.getItem('mercsync_pending_matches');
                if (savedMatches) {
                    try {
                        const matches = JSON.parse(savedMatches);
                        localStorage.removeItem('mercsync_pending_matches');
                        // Keep isCheckingRestore true while we process
                        await handleSaveMatches(matches);
                        setIsCheckingRestore(false);
                        return;
                    } catch (e) {
                        console.error("Failed to parse pending matches", e);
                    }
                }
            }
            // If no user or no saved matches, stop checking
            setIsCheckingRestore(false);
        };

        checkRestore();
    }, [user]);

    const handleSaveMatches = async (matches: any[]) => {
        // Auth Gate: Check if user is logged in
        if (!user) {
            localStorage.setItem('mercsync_pending_matches', JSON.stringify(matches));
            setPendingMatches(matches);
            setShowAuthModal(true);
            return;
        }

        setIsLoading(true);
        try {
            // Send FULL MATCH DATA (original fields) via local proxy to avoid CORS
            const response = await fetch('/api/save-matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matches })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to save matches');
            }

            const responseData = await response.json();
            const analysisResult = Array.isArray(responseData) ? responseData[0] : responseData;

            console.log("Analysis Result:", analysisResult);
            setReportData(analysisResult);
            setStep(3);

        } catch (error: any) {
            console.error('Failed to save matches', error);
            alert(`Failed to save matches: ${error.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingRestore) {
        return (
            <div className="h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700">Restoring your analysis...</h3>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden relative">
            {/* Header - Simplified for Wizard */}
            <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 z-20">
                <div className="flex items-center gap-2">
                    <Link href="/dashboard" className="text-xl font-bold tracking-tight text-blue-600">MercSync</Link>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm font-medium text-gray-500">Stock Mapping Wizard</span>
                </div>
                <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 font-medium">
                    Exit
                </Link>
            </header>

            <main className="flex-1 flex flex-col min-h-0 w-full max-w-[1600px] mx-auto p-4 sm:p-8">
                {/* Progress Steps */}
                <div className="mb-6 shrink-0">
                    <div className="flex items-center justify-between relative max-w-2xl mx-auto">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 -z-10"></div>
                        <div className={`w-full h-1 absolute left-0 top-1/2 -translate-y-1/2 -z-10 bg-blue-600 transition-all duration-500 ${step === 1 ? 'w-0' : step === 2 ? 'w-1/2' : 'w-full'}`}></div>

                        {[1, 2, 3].map((s) => (
                            <div key={s} className={`flex flex-col items-center gap-2 bg-gray-50 px-2 ${step >= s ? 'text-blue-600' : 'text-gray-400'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                    {s}
                                </div>
                                <span className="text-xs font-semibold uppercase tracking-wider">
                                    {s === 1 ? 'Upload' : s === 2 ? 'Review' : 'Report'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content Container - Flex-1 to take remaining space */}
                <div className="flex-1 min-h-0 flex flex-col relative">
                    {/* Step 1: Upload */}
                    {step === 1 && (
                        <div className="max-w-2xl mx-auto w-full overflow-y-auto custom-scrollbar py-4">
                            <MapperUploadStep onSuccess={handleUploadSuccess} />
                        </div>
                    )}

                    {/* Step 2: Review & Edit (Interactive Matching Desk) */}
                    {step === 2 && (
                        <MatchingDesk
                            initialData={mapperData}
                            onSave={handleSaveMatches}
                            onBack={() => setStep(1)}
                        />
                    )}

                    {/* Step 3: Report */}
                    {step === 3 && reportData && (
                        <div className="h-full overflow-y-auto custom-scrollbar pb-10">
                            <MapperReportStep
                                data={reportData}
                                onRestart={() => {
                                    setStep(1);
                                    setMapperData({ matched: [], unmatched_shopify: [], unmatched_etsy: [] });
                                    setReportData(null);
                                }}
                            />
                        </div>
                    )}
                </div>
            </main>

            {/* Auth Gate Modal */}
            {showAuthModal && (
                <div className="absolute inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center border border-gray-100">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <LinkIcon className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Save & Analyze Results</h3>
                        <p className="text-gray-500 mb-8 leading-relaxed">
                            To view your detailed Crisis Analysis report and sync your products, please sign in or create a free account. Your work has been saved.
                        </p>
                        <div className="space-y-3">
                            <Link
                                href="/login?redirect=/dashboard/mapper"
                                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                            >
                                Sign In to View Results
                            </Link>
                            <Link
                                href="/login?flow=register&redirect=/dashboard/mapper"
                                className="block w-full bg-white hover:bg-gray-50 text-gray-900 font-bold py-3.5 rounded-xl border border-gray-200 transition-all"
                            >
                                Create Free Account
                            </Link>
                        </div>
                        <p className="mt-6 text-xs text-gray-400">
                            By continuing, you agree to our Terms of Service and Privacy Policy.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
