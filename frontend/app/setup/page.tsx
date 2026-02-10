'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
    Check, ShoppingBag, Store, ArrowRight, Download,
    CreditCard, ShieldCheck, Zap, Loader2, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import confetti from 'canvas-confetti';

export default function SetupPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    // State
    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null },
        etsy: { connected: false, name: null as string | null }
    });
    const [etsyShopName, setEtsyShopName] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    // Pricing Mock Data
    const plans = [
        {
            id: 'starter',
            name: 'Starter',
            price: '$19',
            period: '/month',
            features: ['Up to 1,000 Products', 'Daily Sync', 'Email Support'],
            recommended: false
        },
        {
            id: 'pro',
            name: 'Professional',
            price: '$49',
            period: '/month',
            features: ['Up to 10,000 Products', 'Real-time Sync', 'Priority Support', 'Overselling Protection'],
            recommended: true
        },
        {
            id: 'business',
            name: 'Business',
            price: '$99',
            period: '/month',
            features: ['Unlimited Products', 'Real-time Sync', 'Dedicated Account Manager', 'Custom API Access'],
            recommended: false
        }
    ];

    useEffect(() => {
        // Allow running without user for dev/test
        loadData();
    }, [user]);

    const loadData = async () => {
        try {
            // If no user, mock data or just empty state
            if (!user) {
                setStores({
                    shopify: { connected: false, name: null },
                    etsy: { connected: false, name: null }
                });
                setIsLoading(false);
                return;
            }

            const [shopify, etsy, setupStatus] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getSetupStatus()
            ]);

            setStores({
                shopify: { connected: shopify.connected, name: shopify.shop_domain },
                etsy: { connected: etsy.connected, name: etsy.shop_domain }
            });

            // Auto-advance logic
            if (shopify.connected && etsy.connected) {
                if (setupStatus?.shopifyExported && setupStatus?.etsyExported) {
                    setStep(3);
                } else {
                    setStep(2);
                }
            }
        } catch (error) {
            console.error('Failed to load setup data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectEtsy = () => {
        if (!etsyShopName.trim()) {
            alert('Please enter your Etsy shop name');
            return;
        }
        const returnUrl = encodeURIComponent(`${window.location.origin}/setup?step=2`); // Return to setup step 2
        const userId = user?.id || '';
        const shop = encodeURIComponent(etsyShopName.trim());
        window.location.href = `https://api.mercsync.com/webhook/auth/etsy/start?user_id=${userId}&shop=${shop}&return_url=${returnUrl}`;
    };

    const handleImport = async () => {
        setIsImporting(true);
        // Mock import delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsImporting(false);
        setStep(3); // Move to pricing
        confetti();
    };

    const handleSelectPlan = async (planId: string) => {
        // Mock payment flow
        const confirm = window.confirm(`Proceed to payment for ${planId.toUpperCase()} plan?`);
        if (confirm) {
            // Here we would normally redirect to Stripe/Shopify Billing
            // For now, we simulate success and redirect to dashboard
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 }
            });
            setTimeout(() => {
                router.push('/dashboard');
            }, 1500);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col md:flex-row min-h-[600px]">

                {/* Sidebar / Progress */}
                <div className="w-full md:w-1/3 bg-gray-900 p-8 text-white flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-12">
                            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center font-bold">M</div>
                            <span className="font-bold text-xl tracking-tight">MerSync</span>
                        </div>

                        <div className="space-y-8">
                            <div className={`flex gap-4 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${step > 1 ? 'bg-green-500 border-green-500' : step === 1 ? 'border-white text-white' : 'border-white/30 text-white/30'}`}>
                                    {step > 1 ? <Check className="w-4 h-4" /> : '1'}
                                </div>
                                <div>
                                    <h3 className="font-bold">Connect Stores</h3>
                                    <p className="text-sm text-gray-400">Shopify & Etsy</p>
                                </div>
                            </div>

                            <div className={`flex gap-4 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${step > 2 ? 'bg-green-500 border-green-500' : step === 2 ? 'border-white text-white' : 'border-white/30 text-white/30'}`}>
                                    {step > 2 ? <Check className="w-4 h-4" /> : '2'}
                                </div>
                                <div>
                                    <h3 className="font-bold">Sync Inventory</h3>
                                    <p className="text-sm text-gray-400">Import products</p>
                                </div>
                            </div>

                            <div className={`flex gap-4 ${step >= 3 ? 'opacity-100' : 'opacity-40'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${step > 3 ? 'bg-green-500 border-green-500' : step === 3 ? 'border-white text-white' : 'border-white/30 text-white/30'}`}>
                                    {step > 3 ? <Check className="w-4 h-4" /> : '3'}
                                </div>
                                <div>
                                    <h3 className="font-bold">Select Plan</h3>
                                    <p className="text-sm text-gray-400">Choose your tier</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-gray-500 mt-8">
                        Need help? <a href="#" className="underline">Contact Support</a>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-8 md:p-12 overflow-y-auto">
                    <AnimatePresence mode="wait">

                        {/* STEP 1: CONNECT */}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Accounts</h2>
                                    <p className="text-gray-500">Link your Shopify and Etsy stores to start syncing.</p>
                                </div>

                                <div className="space-y-4">
                                    {/* Shopify Card */}
                                    <div className="p-4 border border-green-200 bg-green-50 rounded-xl flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                                                <ShoppingBag className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900">Shopify</h4>
                                                <p className="text-sm text-green-700 font-medium">
                                                    {stores.shopify.connected ? 'Connected' : 'Not Connected'}
                                                </p>
                                            </div>
                                        </div>
                                        {stores.shopify.connected && <div className="bg-white rounded-full p-1"><Check className="w-4 h-4 text-green-600" /></div>}
                                    </div>

                                    {/* Etsy Card */}
                                    <div className={`p-6 border rounded-xl transition-all ${stores.etsy.connected ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stores.etsy.connected ? 'bg-green-500' : 'bg-[#F56400]'}`}>
                                                <Store className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900">Etsy</h4>
                                                <p className="text-sm text-gray-500">
                                                    {stores.etsy.connected ? `Connected to ${stores.etsy.name}` : 'Connect your Etsy shop'}
                                                </p>
                                            </div>
                                            {stores.etsy.connected && <div className="ml-auto bg-white rounded-full p-1"><Check className="w-4 h-4 text-green-600" /></div>}
                                        </div>

                                        {!stores.etsy.connected && (
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    placeholder="Enter your Etsy shop name"
                                                    value={etsyShopName}
                                                    onChange={(e) => setEtsyShopName(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F56400] outline-none"
                                                />
                                                <button
                                                    onClick={handleConnectEtsy}
                                                    className="w-full py-3 bg-[#F56400] hover:bg-[#d95700] text-white font-bold rounded-lg transition-colors"
                                                >
                                                    Connect Etsy
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!stores.shopify.connected}
                                    className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continue <ArrowRight className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}

                        {/* STEP 2: IMPORT */}
                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="text-center mb-8">
                                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Download className="w-10 h-10 text-blue-600" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Sync Your Inventory</h2>
                                    <p className="text-gray-500">
                                        We found products in your connected stores. Import them now to start matching.
                                    </p>
                                </div>

                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex justify-around">
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-gray-900">--</div>
                                        <div className="text-xs text-gray-500 uppercase font-semibold mt-1">Shopify Items</div>
                                    </div>
                                    <div className="w-px bg-gray-200"></div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-gray-900">--</div>
                                        <div className="text-xs text-gray-500 uppercase font-semibold mt-1">Etsy Items</div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleImport}
                                    disabled={isImporting}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                                >
                                    {isImporting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" /> Importing...
                                        </>
                                    ) : (
                                        <>
                                            Import & Sync <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        )}

                        {/* STEP 3: PRICING */}
                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a Plan</h2>
                                    <p className="text-gray-500">Choose the plan that fits your business needs.</p>
                                </div>

                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {plans.map((plan) => (
                                        <div
                                            key={plan.id}
                                            className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${plan.recommended ? 'border-blue-600 bg-blue-50/50' : 'border-gray-200 hover:border-blue-300'}`}
                                            onClick={() => handleSelectPlan(plan.id)}
                                        >
                                            {plan.recommended && (
                                                <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                                                    RECOMMENDED
                                                </div>
                                            )}
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                                                        <span className="text-gray-500 text-sm">{plan.period}</span>
                                                    </div>
                                                </div>
                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${plan.recommended ? 'border-blue-600' : 'border-gray-300'}`}>
                                                    {plan.recommended && <div className="w-3 h-3 bg-blue-600 rounded-full" />}
                                                </div>
                                            </div>
                                            <ul className="space-y-2">
                                                {plan.features.map((feature, i) => (
                                                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-center text-xs text-gray-400">
                                    Secured by Stripe. 14-day money-back guarantee.
                                </p>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
