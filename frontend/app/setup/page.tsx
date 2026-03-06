'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ui/useToast';
import {
    ShoppingBag, Store,
    Loader2, Zap, Check, Box, FileText, Archive, AlertCircle, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import StagingInterface from '@/components/staging/StagingInterface';
import { setShopDomain } from '@/utils/shopDomain';

export default function SetupPage() {
    const { user } = useAuth();
    const toast = useToast();
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
    const [ownerId, setOwnerId] = useState<string | null>(null);

    const [isMatching, setIsMatching] = useState(false);
    const [isMatched, setIsMatched] = useState(false);
    const [showMatchingInterface, setShowMatchingInterface] = useState(false);

    useEffect(() => {
        console.log('SetupPage: Mounted, User:', user?.id);

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
            const shopFromUrl = searchParams.get('shop') || undefined;
            if (shopFromUrl) setShopDomain(shopFromUrl); // Persist for subsequent pages
            const shopDomainToUse = user ? undefined : shopFromUrl;
            console.log('SetupPage: Using domain:', shopDomainToUse, 'User:', user?.id);

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

            const resolvedOwnerId = shopify.owner_id || etsy.owner_id || null;
            if (resolvedOwnerId) setOwnerId(resolvedOwnerId);

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
        const resolvedUserId = user?.id || ownerId;
        if (!resolvedUserId) {
            console.error('handleConnectEtsy: No user ID found');
            toast.error('User not authenticated. Please log in first.');
            return;
        }
        window.open(`https://api.mercsync.com/webhook/auth/etsy/start?user_id=${resolvedUserId}`, '_blank');
    };

    const handleMatch = () => {
        setShowSyncModal(true);
    };

    const handleStartImport = async () => {
        console.log('Start Import clicked');
        const userId = user?.id || ownerId;

        if (!userId) {
            console.error('Start Import: No user ID found');
            toast.error('User not authenticated. Cannot start import.');
            return;
        }

        console.log('Starting import for user:', userId, 'Shopify Filters:', shopifyFilters, 'Etsy Filters:', etsyFilters);

        setIsImporting(true);
        try {
            const importPromises = [];

            if (shopifyFilters.length > 0) {
                const shopifyPayload = {
                    ownerId: userId,
                    options: { shopify: shopifyFilters }
                };
                importPromises.push(
                    fetch('https://api.mercsync.com/webhook/shopify-import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(shopifyPayload)
                    })
                );
            }

            if (etsyFilters.length > 0) {
                const etsyPayload = {
                    owner_id: userId,
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
                toast.warning('Please select at least one category to import.');
                setIsImporting(false);
                return;
            }

            const responses = await Promise.all(importPromises);
            const allOk = responses.every(r => r.ok);

            if (allOk) {
                console.log('All import webhooks triggered successfully');
                setShowMatchingInterface(true);
            } else {
                console.error('One or more import webhooks failed');
                toast.error('Failed to start some imports. Please check console.');
            }
        } catch (error) {
            console.error('Import error:', error);
            toast.error('An error occurred. Please try again.');
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
            <div className="h-screen flex items-center justify-center bg-[#F9FAFB]">
                <Loader2 className="w-8 h-8 text-gray-900 animate-spin" />
            </div>
        );
    }

    if (showMatchingInterface) {
        const activeUserId = user?.id || ownerId;
        return <StagingInterface
            isSetupMode={true}
            userId={activeUserId}
            onBack={() => setShowMatchingInterface(false)}
        />;
    }

    return (
        <div className="h-screen bg-[#F9FAFB] flex flex-col overflow-hidden font-sans">
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
                            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
                        >
                            <div className="p-5 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900">Sync Settings</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Select which products to import</p>
                            </div>

                            <div className="p-5 flex gap-6">
                                {/* Shopify Options */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
                                        <h4 className="font-semibold text-sm text-gray-900">Shopify</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {['active', 'draft', 'archived'].map(status => (
                                            <label key={status} className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={shopifyFilters.includes(status)}
                                                    onChange={() => toggleFilter('shopify', status)}
                                                    className="w-4 h-4 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="capitalize text-gray-700 text-sm font-medium">{status}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Etsy Options */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Store className="w-4 h-4 text-[#F56400]" />
                                        <h4 className="font-semibold text-sm text-gray-900">Etsy</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {['active', 'draft', 'expired', 'inactive', 'sold_out'].map(status => (
                                            <label key={status} className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={etsyFilters.includes(status)}
                                                    onChange={() => toggleFilter('etsy', status)}
                                                    className="w-4 h-4 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="capitalize text-gray-700 text-sm font-medium">{status.replace('_', ' ')}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setShowSyncModal(false)}
                                    disabled={isImporting}
                                    className="px-4 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStartImport}
                                    disabled={isImporting || (shopifyFilters.length === 0 && etsyFilters.length === 0)}
                                    className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                >
                                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {isImporting ? 'Importing...' : 'Start Import'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Page Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-hidden min-h-0">
                {/* Header Section */}
                {!isMatched && (
                    <div className="text-center mb-6 shrink-0">
                        <h1 className="text-2xl font-bold text-gray-900 mb-1 tracking-tight">
                            Store Sync Hub
                        </h1>
                        <p className="text-gray-500 text-sm">
                            Unified inventory management for all your stores
                        </p>
                    </div>
                )}

                {/* Main Interaction Area */}
                <AnimatePresence mode="wait">
                    {!isMatched && (
                        <div className="flex flex-row items-stretch justify-center w-full max-w-4xl gap-4 min-h-0 shrink-0">

                            {/* SHOPIFY CARD */}
                            <div className="flex-1 bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col min-w-0">
                                <div className="flex items-center gap-3 mb-5 shrink-0">
                                    <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shrink-0">
                                        <ShoppingBag className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg text-gray-900 leading-tight">Shopify</h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${stores.shopify.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {stores.shopify.connected ? (stores.shopify.name || 'Connected') : 'Not connected'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                                    {stores.shopify.connected ? (
                                        <>
                                            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                                <div className="flex items-center gap-2.5">
                                                    <Box className="w-4 h-4 text-green-600" />
                                                    <span className="font-medium text-sm text-gray-700">Active</span>
                                                </div>
                                                <span className="text-base font-bold text-green-600">{stores.shopify.counts.active}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-2.5">
                                                    <FileText className="w-4 h-4 text-gray-500" />
                                                    <span className="font-medium text-sm text-gray-700">Draft</span>
                                                </div>
                                                <span className="text-base font-bold text-gray-900">{stores.shopify.counts.draft}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-100">
                                                <div className="flex items-center gap-2.5">
                                                    <Archive className="w-4 h-4 text-orange-600" />
                                                    <span className="font-medium text-sm text-gray-700">Archived</span>
                                                </div>
                                                <span className="text-base font-bold text-orange-600">{stores.shopify.counts.archived}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                                            No store connected
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 shrink-0">
                                    <button
                                        disabled={true}
                                        className="w-full py-3 bg-[#0F172A] text-white font-semibold rounded-xl flex items-center justify-center gap-2 cursor-default disabled:opacity-100 text-sm shadow-sm"
                                    >
                                        {stores.shopify.connected ? (
                                            <><div className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Connected</>
                                        ) : (
                                            'Connect Shopify'
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* CENTER ACTION */}
                            <div className="flex flex-col items-center justify-center px-1 shrink-0">
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
                                        className={`w-12 h-12 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center transition-all ${canMatch && !isMatching ? 'hover:scale-105 hover:border-blue-200 cursor-pointer' : 'cursor-default opacity-50'}`}
                                    >
                                        <Zap className={`w-5 h-5 ${isMatching ? 'text-blue-500 animate-pulse' : 'text-blue-500'}`} fill="currentColor" />
                                    </button>
                                </div>
                                <span className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mt-2 block w-[50px] text-center">
                                    {isMatching ? 'Syncing' : 'Sync'}
                                </span>
                            </div>

                            {/* ETSY CARD */}
                            <div className="flex-1 bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col min-w-0">
                                <div className="flex items-center gap-3 mb-5 shrink-0">
                                    <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shrink-0">
                                        <Store className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg text-gray-900 leading-tight">Etsy</h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${stores.etsy.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {stores.etsy.connected ? (stores.etsy.name || 'Connected') : 'Not connected'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                                    {stores.etsy.connected ? (
                                        <>
                                            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                                <div className="flex items-center gap-2.5">
                                                    <Box className="w-4 h-4 text-green-600" />
                                                    <span className="font-medium text-sm text-gray-700">Active</span>
                                                </div>
                                                <span className="text-base font-bold text-green-600">{stores.etsy.counts.active}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-2.5">
                                                    <FileText className="w-4 h-4 text-gray-500" />
                                                    <span className="font-medium text-sm text-gray-700">Draft</span>
                                                </div>
                                                <span className="text-base font-bold text-gray-900">{stores.etsy.counts.draft}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                                                <div className="flex items-center gap-2.5">
                                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                                    <span className="font-medium text-sm text-gray-700">Expired</span>
                                                </div>
                                                <span className="text-base font-bold text-red-600">{stores.etsy.counts.expired}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-4 h-4 rounded-full border-2 border-gray-400 flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                                    </div>
                                                    <span className="font-medium text-sm text-gray-700">Inactive</span>
                                                </div>
                                                <span className="text-base font-bold text-gray-600">{stores.etsy.counts.inactive}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border border-purple-100">
                                                <div className="flex items-center gap-2.5">
                                                    <Store className="w-4 h-4 text-purple-600" />
                                                    <span className="font-medium text-sm text-gray-700">Sold Out</span>
                                                </div>
                                                <span className="text-base font-bold text-purple-600">{stores.etsy.counts.sold_out}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col justify-center gap-2 items-center text-center">
                                            <p className="text-gray-500 text-sm px-4">
                                                Connect your Etsy shop to start syncing products.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 shrink-0">
                                    {stores.etsy.connected ? (
                                        <div className="w-full py-3 bg-[#0F172A] text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm">
                                            <div className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Connected
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleConnectEtsy}
                                            className="w-full py-3 bg-[#0F172A] hover:bg-black text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
                                        >
                                            Connect Etsy
                                        </button>
                                    )}
                                    <p className="text-center text-[10px] text-gray-400 mt-2">
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
