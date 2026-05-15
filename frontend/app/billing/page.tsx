'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Check, Zap, Crown, Shield, Loader2, ArrowRight, Tag, X, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/useToast';
import { getShopDomain, setShopDomain } from '@/utils/shopDomain';
import { PLAN_CONFIG, PLAN_ORDER, type PlanId } from '@/config/plans';
import { useRouter } from 'next/navigation';
import EmbeddedAdminRedirect from '@/components/EmbeddedAdminRedirect';

const PLAN_STYLE: Record<PlanId, { icon: typeof Zap; color: string; popular?: boolean }> = {
    starter: { icon: Zap, color: 'from-blue-500 to-indigo-600' },
    growth: { icon: Crown, color: 'from-violet-500 to-purple-600', popular: true },
    pro: { icon: Shield, color: 'from-gray-800 to-gray-900' },
};

const PLANS = PLAN_ORDER.map(id => ({
    ...PLAN_CONFIG[id],
    ...PLAN_STYLE[id],
}));

function formatTrialEndDate(trialDays: number): string {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + trialDays);
    return endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PlansPage() {
    const { user } = useAuth();
    const toast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resolvedShopDomain, setResolvedShopDomain] = useState<string | undefined>(undefined);

    // Promo code state
    const [promoCode, setPromoCode] = useState('');
    const [promoStatus, setPromoStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
    const [promoData, setPromoData] = useState<{ trial_days: number; label: string; code: string } | null>(null);
    const [promoError, setPromoError] = useState<string | null>(null);
    const [showPromo, setShowPromo] = useState(false);

    // Effective trial days — from promo or default plan value
    const effectiveTrialDays = promoData?.trial_days || 7;
    const trialEndDate = useMemo(() => formatTrialEndDate(effectiveTrialDays), [effectiveTrialDays]);

    // Get shop domain — checks URL params first, then sessionStorage
    const shopDomain = getShopDomain(searchParams);
    const chargeId = searchParams.get('charge_id');

    useEffect(() => {
        if (shopDomain) {
            setResolvedShopDomain(shopDomain);
            return;
        }

        let cancelled = false;

        const loadCurrentShop = async () => {
            try {
                const response = await fetch('/api/shop/current');
                const data = await response.json();

                if (cancelled || !data?.shopDomain) {
                    return;
                }

                setShopDomain(data.shopDomain);
                setResolvedShopDomain(data.shopDomain);
            } catch (error) {
                console.error('[Billing Page] Failed to resolve current shop:', error);
            }
        };

        loadCurrentShop();

        return () => {
            cancelled = true;
        };
    }, [shopDomain]);

    useEffect(() => {
        const effectiveShopDomain = resolvedShopDomain || shopDomain;

        if (!chargeId || !effectiveShopDomain) {
            return;
        }

        let cancelled = false;

        const verifySubscription = async () => {
            setIsLoading(true);

            try {
                const response = await fetch('/api/billing/verify-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charge_id: chargeId, shop_domain: effectiveShopDomain })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Subscription verification failed');
                }

                if (cancelled) {
                    return;
                }

                toast.success('Subscription activated.');
                router.replace(`/setup?shop=${effectiveShopDomain}`);
            } catch (error: unknown) {
                if (cancelled) {
                    return;
                }
                const message = error instanceof Error ? error.message : 'Error verifying payment.';
                toast.error(message);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        verifySubscription();

        return () => {
            cancelled = true;
        };
    }, [chargeId, resolvedShopDomain, router, shopDomain, toast]);

    useEffect(() => {
        const effectiveShopDomain = resolvedShopDomain || shopDomain;

        if (!effectiveShopDomain || chargeId) {
            return;
        }

        let cancelled = false;

        const syncBillingState = async () => {
            try {
                const response = await fetch('/api/billing/sync-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shop_domain: effectiveShopDomain })
                });

                const data = await response.json();
                if (cancelled || !response.ok) {
                    return;
                }

                if (data.success && data.plan) {
                    router.replace(`/setup?shop=${effectiveShopDomain}`);
                }
            } catch (error) {
                console.error('[Billing Page] Failed to sync billing state:', error);
            }
        };

        syncBillingState();

        return () => {
            cancelled = true;
        };
    }, [chargeId, resolvedShopDomain, router, shopDomain]);

    const handleSelectPlan = async (planId: string) => {
        const effectiveShopDomain = resolvedShopDomain || shopDomain;

        if (!user?.id && !effectiveShopDomain) {
            toast.error('Could not identify your shop. Please try again from Shopify admin.');
            return;
        }

        setSelectedPlan(planId);
        setIsLoading(true);

        try {
            const res = await fetch('/api/billing/create-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: planId,
                    user_id: user?.id || undefined,
                    shop_domain: effectiveShopDomain,
                    promo_code: promoData?.code || undefined
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create subscription');
            }

            if (data.confirmationUrl) {
                // Redirect to Shopify's secure billing page
                const targetWindow = window.top || window;
                targetWindow.location.href = data.confirmationUrl;
            } else {
                throw new Error('No confirmation URL received');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to start billing. Please try again.';
            console.error('Billing error:', err);
            toast.error(message);
            setSelectedPlan(null);
        } finally {
            setIsLoading(false);
        }
    };

    // Promo code handlers
    const validatePromo = async () => {
        if (!promoCode.trim()) return;
        setPromoStatus('validating');
        setPromoError(null);

        try {
            const res = await fetch('/api/promo/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: promoCode.trim() })
            });
            const data = await res.json();

            if (data.valid) {
                setPromoStatus('valid');
                setPromoData(data);
            } else {
                setPromoStatus('invalid');
                setPromoError(data.error || 'Invalid promo code');
                setPromoData(null);
            }
        } catch {
            setPromoStatus('invalid');
            setPromoError('Failed to validate code');
            setPromoData(null);
        }
    };

    const clearPromo = () => {
        setPromoCode('');
        setPromoStatus('idle');
        setPromoData(null);
        setPromoError(null);
    };

    return (
        <div className="h-[100dvh] w-full overflow-y-auto bg-[#F6F6F7] flex flex-col items-center px-4 py-8 font-sans">
            <EmbeddedAdminRedirect shopDomain={resolvedShopDomain || shopDomain || undefined} />

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-6"
            >
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Plan</h1>
                <p className="text-sm text-gray-500 max-w-md">
                    Start syncing your inventory across platforms. {promoData
                        ? `Your ${promoData.trial_days}-day free trial is active!`
                        : 'All plans include a 7-day free trial.'}
                </p>
            </motion.div>

            {/* Promo Code Section */}
            <div className="w-full max-w-sm mb-6">
                {!showPromo ? (
                    <button
                        onClick={() => setShowPromo(true)}
                        className="mx-auto flex items-center gap-2 text-xs text-gray-400 hover:text-violet-600 transition-colors"
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Have a promo code?
                    </button>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                    >
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={promoCode}
                                    onChange={(e) => {
                                        setPromoCode(e.target.value.toUpperCase());
                                        if (promoStatus !== 'idle') {
                                            setPromoStatus('idle');
                                            setPromoError(null);
                                        }
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && validatePromo()}
                                    placeholder="Enter promo code"
                                    className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono tracking-wider bg-white transition-colors outline-none ${
                                        promoStatus === 'valid'
                                            ? 'border-emerald-400 bg-emerald-50/50'
                                            : promoStatus === 'invalid'
                                                ? 'border-red-300 bg-red-50/50'
                                                : 'border-gray-300 focus:border-violet-400'
                                    }`}
                                    disabled={promoStatus === 'valid'}
                                />
                                {promoStatus === 'valid' && (
                                    <button
                                        onClick={clearPromo}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {promoStatus !== 'valid' && (
                                <button
                                    onClick={validatePromo}
                                    disabled={promoStatus === 'validating' || !promoCode.trim()}
                                    className="px-4 py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {promoStatus === 'validating' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        'Apply'
                                    )}
                                </button>
                            )}
                        </div>

                        {promoStatus === 'valid' && promoData && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-2.5 px-3 py-2.5 bg-emerald-50 rounded-lg border border-emerald-200"
                            >
                                <Gift className="w-4 h-4 text-emerald-600 shrink-0" />
                                <p className="text-xs font-semibold text-emerald-700">
                                    {promoData.trial_days}-day free trial unlocked! Code <span className="font-mono">{promoData.code}</span> applied.
                                </p>
                            </motion.div>
                        )}

                        {promoStatus === 'invalid' && promoError && (
                            <p className="text-xs text-red-500 px-0.5">{promoError}</p>
                        )}
                    </motion.div>
                )}
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
                {PLANS.map((plan, i) => {
                    const Icon = plan.icon;
                    const isSelected = selectedPlan === plan.id;
                    const isLoadingThis = isSelected && isLoading;

                    return (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`relative bg-white rounded-2xl border ${plan.popular ? 'border-violet-300 shadow-lg shadow-violet-100/50' : 'border-gray-200 shadow-sm'
                                } flex flex-col overflow-hidden transition-all hover:shadow-md`}
                        >
                            {/* Popular Badge */}
                            {plan.popular && (
                                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                                    <span className="inline-block px-3 py-0.5 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-b-lg">
                                        Most Popular
                                    </span>
                                </div>
                            )}

                            <div className="p-6 flex-1">
                                {/* Icon & Name */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{plan.name}</h3>
                                        <p className="text-xs text-gray-500">{plan.description}</p>
                                    </div>
                                </div>

                                {/* Price with trial info */}
                                <div className="mb-5">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-extrabold text-gray-900">${plan.price}</span>
                                        <span className="text-sm text-gray-400">/month</span>
                                    </div>
                                    <div className="mt-1.5 text-xs text-gray-500">
                                        <span className="text-emerald-600 font-semibold">$0.00</span>
                                        <span className="text-gray-400"> until {trialEndDate}</span>
                                    </div>
                                </div>

                                {/* Features */}
                                <ul className="space-y-2.5 mb-6">
                                    {plan.features.map((feature, fi) => (
                                        <li key={fi} className="flex items-start gap-2 text-sm text-gray-600">
                                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* CTA */}
                            <div className="px-6 pb-6">
                                <button
                                    onClick={() => handleSelectPlan(plan.id)}
                                    disabled={isLoading}
                                    className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${plan.popular
                                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                        }`}
                                >
                                    {isLoadingThis ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                    ) : (
                                        <>
                                            <ArrowRight className="w-4 h-4" />
                                            Start {effectiveTrialDays}-Day Free Trial
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Footer */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xs text-gray-400 mt-8 text-center"
            >
                Secure payment powered by Shopify Billing. Cancel anytime from your Shopify admin.
            </motion.p>
        </div>
    );
}
