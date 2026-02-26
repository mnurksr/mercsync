'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
    ShoppingBag, Store,
    Loader2, Zap, Check, Box, FileText, Archive, AlertCircle, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import confetti from 'canvas-confetti';
import StagingInterface from '@/components/staging/StagingInterface';

export default function SetupPage() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);

    // State
    const [stores, setStores] = useState({
        shopify: {
            connected: false,
            name: null as string | null,
            counts: { active: 0, draft: 0, archived: 0 }
        },
        etsy: {
            connected: false,
            name: null as string | null,
            counts: { active: 0, draft: 0, expired: 0, inactive: 0, sold_out: 0 }
        }
    });

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [shopifyFilters, setShopifyFilters] = useState<string[]>(['active']);
    const [etsyFilters, setEtsyFilters] = useState<string[]>(['active']);


    const [isMatching, setIsMatching] = useState(false);
    const [isMatched, setIsMatched] = useState(false);
    const [showMatchingInterface, setShowMatchingInterface] = useState(false);

    useEffect(() => {
        console.log('SetupPage: Mounted, User:', user?.id);

        // Failsafe: invalidating loading state after 5 seconds max
        const timer = setTimeout(() => {
            console.warn('SetupPage: Failsafe timeout triggered! Forcing loading to false.');
            setIsLoading(false);
        }, 5000);

        loadData().then(() => {
            clearTimeout(timer);
        });

        return () => clearTimeout(timer);
    }, [user]);

    const loadData = async () => {
        try {
            console.log('SetupPage: Starting loadData');
            // Get shop domain from URL params (Shopify passes ?shop= to embedded apps)
            const shopFromUrl = searchParams.get('shop') || undefined;
            const shopDomainToUse = user ? undefined : shopFromUrl;
            console.log('SetupPage: Using domain:', shopDomainToUse, 'User:', user?.id);

            // Add timeout race
            const TIMEOUT_MS = 15000;
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Data loading timed out')), TIMEOUT_MS)
            );

            const dataPromise = Promise.all([
                getConnectedShop('shopify', shopDomainToUse),
                getConnectedShop('etsy', shopDomainToUse),
                getSetupStatus(shopDomainToUse)
            ]);

            const results = await Promise.race([dataPromise, timeoutPromise]) as [any, any, any];
            const [shopify, etsy, setupStatus] = results;

            console.log('SetupPage: Data loaded', { shopify, etsy, setupStatus });

            const sCounts = setupStatus?.initialProductCounts?.shopify || {};
            const eCounts = setupStatus?.initialProductCounts?.etsy || {};

            setStores({
                shopify: {
                    connected: shopify.connected,
                    name: shopify.shop_domain,
                    counts: {
                        active: sCounts.active || 0,
                        draft: sCounts.draft || 0,
                        archived: sCounts.archived || 0
                    }
                },
                etsy: {
                    connected: etsy.connected,
                    name: etsy.shop_domain,
                    counts: {
                        active: eCounts.active || 0,
                        draft: eCounts.draft || 0,
                        expired: eCounts.expired || 0,
                        inactive: eCounts.inactive || 0,
                        sold_out: eCounts.sold_out || 0
                    }
                }
            });

        } catch (error) {
            console.error('Failed to load setup data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectEtsy = () => {
        if (!user?.id) {
            console.error('handleConnectEtsy: No user ID found');
            alert('User not authenticated. Please log in first.');
            return;
        }
        // Open in new tab to avoid loading inside Shopify iframe
        window.open(`https://api.mercsync.com/webhook/auth/etsy/start?user_id=${user.id}`, '_blank');
    };

    const handleMatch = () => {
        setShowSyncModal(true);
    };

    const handleStartImport = async () => {
        console.log('Start Import clicked');
        const userId = user?.id;

        if (!userId) {
            console.error('Start Import: No user ID found');
            alert('User not authenticated. Cannot start import.');
            return;
        }

        console.log('Starting import for user:', userId, 'Shopify Filters:', shopifyFilters, 'Etsy Filters:', etsyFilters);

        setIsImporting(true);
        try {
            const importPromises = [];

            // 1. Shopify Import (if filters selected)
            if (shopifyFilters.length > 0) {
                const shopifyPayload = {
                    ownerId: userId,
                    options: {
                        shopify: shopifyFilters
                    }
                };
                importPromises.push(
                    fetch('https://api.mercsync.com/webhook/shopify-import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(shopifyPayload)
                    })
                );
            }

            // 2. Etsy Import (if filters selected)
            if (etsyFilters.length > 0) {
                const etsyPayload = {
                    owner_id: userId,
                    // Sending shop info if needed, though webhook might look it up by owner_id
                    shop_domain: stores.etsy.name,
                    filters: etsyFilters
                };
                importPromises.push(
                    fetch('https://api.mercsync.com/webhook/etsy-import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(etsyPayload)
                    })
                );
            }

            if (importPromises.length === 0) {
                alert('Please select at least one category to import.');
                setIsImporting(false);
                return;
            }

            // Wait for all triggered webhooks
            const responses = await Promise.all(importPromises);

            // Check if all were successful
            const allOk = responses.every(r => r.ok);

            if (allOk) {
                console.log('All import webhooks triggered successfully');
                setShowMatchingInterface(true);
            } else {
                console.error('One or more import webhooks failed');
                alert('Failed to start some imports. Please check console.');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('An error occurred. Please try again.');
        } finally {
            setIsImporting(false);
            setShowSyncModal(false);
        }
    };

    const toggleFilter = (platform: 'shopify' | 'etsy', filter: string) => {
        if (platform === 'shopify') {
            setShopifyFilters(prev =>
                prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
            );
        } else {
            setEtsyFilters(prev =>
                prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
            );
        }
    };

    const canMatch = stores.shopify.connected && stores.etsy.connected;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 text-gray-900 animate-spin" />
            </div>
        );
    }

    if (showMatchingInterface) {
        const activeUserId = user?.id;
        return <StagingInterface
            isSetupMode={true}
            userId={activeUserId}
            onBack={() => setShowMatchingInterface(false)}
        />;
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-6 font-sans">

            {/* SYNC SETTINGS MODAL */}
            <AnimatePresence>
                {showSyncModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => !isImporting && setShowSyncModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 border-b border-gray-100">
                                <h3 className="text-xl font-bold text-gray-900">Sync Settings</h3>
                                <p className="text-sm text-gray-500 mt-1">Select which products to import</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Shopify Options */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
                                        <h4 className="font-semibold text-gray-900">Shopify Products</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {['active', 'draft', 'archived'].map(status => (
                                            <label key={status} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={shopifyFilters.includes(status)}
                                                    onChange={() => toggleFilter('shopify', status)}
                                                    className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="capitalize text-gray-700 font-medium">{status}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Etsy Options */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Store className="w-4 h-4 text-[#F56400]" />
                                        <h4 className="font-semibold text-gray-900">Etsy Products</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {['active', 'draft', 'expired', 'inactive', 'sold_out'].map(status => (
                                            <label key={status} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={etsyFilters.includes(status)}
                                                    onChange={() => toggleFilter('etsy', status)}
                                                    className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="capitalize text-gray-700 font-medium">{status.replace('_', ' ')}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setShowSyncModal(false)}
                                    disabled={isImporting}
                                    className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStartImport}
                                    disabled={isImporting}
                                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {isImporting ? 'Importing...' : 'Start Import'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="w-full max-w-6xl">

                {/* Header Section */}
                {!isMatched && (
                    <div className="text-center mb-16">
                        <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">
                            Store Sync Hub
                        </h1>
                        <p className="text-gray-500 text-lg">
                            Unified inventory management for all your stores
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                            Connect and sync your products automatically
                        </p>
                    </div>
                )}

                {/* Main Interaction Area */}
                <AnimatePresence mode="wait">
                    {!isMatched && (
                        <div className="flex flex-col xl:flex-row items-stretch justify-center gap-8 xl:gap-12">

                            {/* SHOPIFY CARD */}
                            <div className="w-full max-w-lg bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-[#1A1A1A] rounded-xl flex items-center justify-center">
                                        <ShoppingBag className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-gray-900">Shopify</h3>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${stores.shopify.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <p className="text-sm text-gray-400 truncate max-w-[200px]">
                                                {stores.shopify.connected ? (stores.shopify.name || 'Connected') : 'Not connected'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 flex-1">
                                    {stores.shopify.connected ? (
                                        <>
                                            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                                                <div className="flex items-center gap-3">
                                                    <Box className="w-5 h-5 text-green-600" />
                                                    <span className="font-medium text-gray-700">Active</span>
                                                </div>
                                                <span className="text-xl font-bold text-green-600">{stores.shopify.counts.active}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-5 h-5 text-gray-500" />
                                                    <span className="font-medium text-gray-700">Draft</span>
                                                </div>
                                                <span className="text-lg font-bold text-gray-900">{stores.shopify.counts.draft}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100">
                                                <div className="flex items-center gap-3">
                                                    <Archive className="w-5 h-5 text-orange-600" />
                                                    <span className="font-medium text-gray-700">Archived</span>
                                                </div>
                                                <span className="text-lg font-bold text-orange-600">{stores.shopify.counts.archived}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 italic">
                                            No store connected
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8">
                                    <button
                                        disabled={true} // Shopify assumed always connected via setup for now
                                        className="w-full py-4 bg-[#0F172A] text-white font-semibold rounded-xl flex items-center justify-center gap-2 cursor-default disabled:opacity-100"
                                    >
                                        {stores.shopify.connected ? (
                                            <>
                                                <div className="w-2 h-2 bg-green-400 rounded-full" /> Connected
                                            </>
                                        ) : (
                                            'Connect Shopify'
                                        )}
                                    </button>
                                </div>
                            </div>


                            {/* CENTER ACTION */}
                            <div className="flex flex-col items-center justify-center py-4 xl:py-0 relative">
                                <div className="relative">
                                    {isMatching && (
                                        <motion.div
                                            className="absolute inset-[-4px] rounded-full border border-blue-100"
                                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        />
                                    )}
                                    <button
                                        onClick={canMatch ? handleMatch : undefined}
                                        disabled={!canMatch || isMatching}
                                        className={`w-14 h-14 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center transition-all ${canMatch && !isMatching ? 'hover:scale-105 hover:border-blue-200 cursor-pointer' : 'cursor-default opacity-50'}`}
                                    >
                                        <Zap className={`w-6 h-6 ${isMatching ? 'text-blue-500 animate-pulse' : 'text-blue-500'}`} fill="currentColor" />
                                    </button>
                                </div>
                                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mt-3">
                                    {isMatching ? 'Syncing...' : 'Sync'}
                                </span>
                            </div>


                            {/* ETSY CARD */}
                            <div className="w-full max-w-lg bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-[#1A1A1A] rounded-xl flex items-center justify-center">
                                        <Store className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-gray-900">Etsy</h3>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${stores.etsy.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <p className="text-sm text-gray-400 truncate max-w-[200px]">
                                                {stores.etsy.connected ? (stores.etsy.name || 'Connected') : 'Not connected'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 flex-1">
                                    {stores.etsy.connected ? (
                                        <>
                                            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                                                <div className="flex items-center gap-3">
                                                    <Box className="w-5 h-5 text-green-600" />
                                                    <span className="font-medium text-gray-700">Active</span>
                                                </div>
                                                <span className="text-xl font-bold text-green-600">{stores.etsy.counts.active}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-5 h-5 text-gray-500" />
                                                    <span className="font-medium text-gray-700">Draft</span>
                                                </div>
                                                <span className="text-lg font-bold text-gray-900">{stores.etsy.counts.draft}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
                                                <div className="flex items-center gap-3">
                                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                                    <span className="font-medium text-gray-700">Expired</span>
                                                </div>
                                                <span className="text-lg font-bold text-red-600">{stores.etsy.counts.expired}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-gray-400 rounded-full" />
                                                    </div>
                                                    <span className="font-medium text-gray-700">Inactive</span>
                                                </div>
                                                <span className="text-lg font-bold text-gray-600">{stores.etsy.counts.inactive}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl border border-purple-100">
                                                <div className="flex items-center gap-3">
                                                    <Store className="w-5 h-5 text-purple-600" />
                                                    <span className="font-medium text-gray-700">Sold Out</span>
                                                </div>
                                                <span className="text-lg font-bold text-purple-600">{stores.etsy.counts.sold_out}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col justify-center gap-4 items-center text-center">
                                            <p className="text-gray-500 text-sm">
                                                Connect your Etsy shop to start syncing products.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8">
                                    {stores.etsy.connected ? (
                                        <div className="w-full py-4 bg-[#0F172A] text-white font-semibold rounded-xl flex items-center justify-center gap-2">
                                            <div className="w-2 h-2 bg-green-400 rounded-full" /> Connected
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleConnectEtsy}
                                            className="w-full py-4 bg-[#0F172A] hover:bg-black text-white font-semibold rounded-xl transition-colors"
                                        >
                                            Connect Etsy
                                        </button>
                                    )}
                                    <p className="text-center text-xs text-gray-400 mt-3">
                                        Click to establish connection
                                    </p>
                                </div>
                            </div>

                        </div>
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
}
