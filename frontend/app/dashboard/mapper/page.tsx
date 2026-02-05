'use client';

import { useState } from 'react';
import { Upload, ArrowRight, Check, X, Link as LinkIcon, FileSpreadsheet, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function StockMapperWizard() {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Mock Data for Step 2
    const [matches, setMatches] = useState([
        { id: 1, shopify: 'Ceramic Mug - Blue', etsy: 'Handmade Blue Mug', sku: 'MUG-BLU-001', status: 'matched' },
        { id: 2, shopify: 'Wool Scarf', etsy: 'Winter Wool Scarf', sku: 'SCF-WIN-002', status: 'matched' },
        { id: 3, shopify: 'Leather Wallet', etsy: '', sku: 'WLT-BRN-003', status: 'unmatched' },
    ]);

    const handleUpload = () => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            setStep(2);
        }, 2000);
    };

    const handleSave = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            setStep(3);
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header - Simplified for Wizard */}
            <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <Link href="/dashboard" className="text-xl font-bold tracking-tight text-blue-600">MercSync</Link>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm font-medium text-gray-500">Stock Mapping Wizard</span>
                </div>
                <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 font-medium">
                    Exit
                </Link>
            </header>

            <main className="flex-1 max-w-5xl mx-auto w-full p-8">
                {/* Progress Steps */}
                <div className="mb-12">
                    <div className="flex items-center justify-between relative">
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

                {/* Step 1: Upload */}
                {step === 1 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto text-center">
                        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Upload className="w-8 h-8 text-blue-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Inventory Files</h2>
                        <p className="text-gray-500 mb-8">Upload your product exports from Shopify and Etsy to start the mapping process.</p>

                        <div className="grid gap-4 mb-8">
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-blue-400 transition-colors cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                        <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Shopify Export</h3>
                                        <p className="text-xs text-gray-400">.csv format</p>
                                    </div>
                                </div>
                            </div>
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-blue-400 transition-colors cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                        <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Etsy Export</h3>
                                        <p className="text-xs text-gray-400">.csv format</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={isLoading}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Analyzing Files...
                                </>
                            ) : (
                                <>
                                    Start Mapping
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Step 2: Review & Edit */}
                {step === 2 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Review Matches</h2>
                            <div className="text-sm text-gray-500">
                                Found {matches.filter(m => m.status === 'matched').length} matches from {matches.length} products
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-xl overflow-hidden mb-8">
                            <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-200 p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <div className="col-span-5">Shopify Product</div>
                                <div className="col-span-2 text-center">Status</div>
                                <div className="col-span-4">Etsy Product</div>
                                <div className="col-span-1 text-right">Actions</div>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {matches.map((match) => (
                                    <div key={match.id} className="grid grid-cols-12 p-4 items-center hover:bg-gray-50/50 transition-colors">
                                        <div className="col-span-5 font-medium text-gray-900">
                                            {match.shopify}
                                            <div className="text-xs text-gray-400 font-normal">{match.sku}</div>
                                        </div>
                                        <div className="col-span-2 flex justify-center">
                                            {match.status === 'matched' ? (
                                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                                    <LinkIcon className="w-4 h-4 text-green-600" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                                    <X className="w-4 h-4 text-red-600" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="col-span-4 text-gray-600">
                                            {match.etsy || <span className="text-gray-400 italic">No match found</span>}
                                        </div>
                                        <div className="col-span-1 flex justify-end gap-2">
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors" title="Edit Match">
                                                <div className="w-4 h-4">✏️</div>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-4">
                            <button
                                onClick={() => setStep(1)}
                                className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        Save & Complete
                                        <Check className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Report */}
                {step === 3 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">Sync Complete!</h2>
                        <p className="text-gray-500 mb-10">Your inventory has been successfully mapped and synchronized.</p>

                        <div className="grid grid-cols-3 gap-6 mb-10 text-left">
                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                                <div className="text-blue-600 font-bold text-3xl mb-1">{matches.filter(m => m.status === 'matched').length}</div>
                                <div className="text-sm text-blue-800 font-medium">Synced Products</div>
                            </div>
                            <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                                <div className="text-green-600 font-bold text-3xl mb-1">1,240</div>
                                <div className="text-sm text-green-800 font-medium">Stock Units</div>
                            </div>
                            <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                                <div className="text-red-600 font-bold text-3xl mb-1">{matches.filter(m => m.status === 'unmatched').length}</div>
                                <div className="text-sm text-red-800 font-medium">Unmatched</div>
                            </div>
                        </div>

                        {matches.some(m => m.status === 'unmatched') && (
                            <div className="text-left bg-gray-50 rounded-xl p-6 mb-8 border border-gray-200">
                                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    Unmatched Items
                                </h3>
                                <ul className="space-y-3">
                                    {matches.filter(m => m.status === 'unmatched').map(m => (
                                        <li key={m.id} className="flex items-center justify-between text-sm bg-white p-3 rounded-lg border border-gray-100">
                                            <span className="font-medium text-gray-700">{m.shopify}</span>
                                            <span className="text-gray-400 font-mono text-xs">{m.sku}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex gap-4 justify-center">
                            <Link
                                href="/dashboard"
                                className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Return to Dashboard
                            </Link>
                            <button
                                onClick={() => {
                                    setStep(1);
                                    setMatches([
                                        { id: 1, shopify: 'Ceramic Mug - Blue', etsy: 'Handmade Blue Mug', sku: 'MUG-BLU-001', status: 'matched' },
                                        { id: 2, shopify: 'Wool Scarf', etsy: 'Winter Wool Scarf', sku: 'SCF-WIN-002', status: 'matched' },
                                        { id: 3, shopify: 'Leather Wallet', etsy: '', sku: 'WLT-BRN-003', status: 'unmatched' },
                                    ]);
                                }}
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                            >
                                New Mapping
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
