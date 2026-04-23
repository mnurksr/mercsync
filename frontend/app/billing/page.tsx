'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Check, Zap, Crown, Shield, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/useToast';
import { getShopDomain } from '@/utils/shopDomain';
import { PLAN_CONFIG, PLAN_ORDER, type PlanId } from '@/config/plans';
import { useRouter } from 'next/navigation';

const PLAN_STYLE: Record<PlanId, { icon: typeof Zap; color: string; popular?: boolean }> = {
    starter: { icon: Zap, color: 'from-blue-500 to-indigo-600' },
    growth: { icon: Crown, color: 'from-violet-500 to-purple-600', popular: true },
    pro: { icon: Shield, color: 'from-gray-800 to-gray-900' },
};

const PLANS = PLAN_ORDER.map(id => ({
    ...PLAN_CONFIG[id],
    ...PLAN_STYLE[id],
}));

export default function PlansPage() {
    const { user } = useAuth();
    const toast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Get shop domain — checks URL params first, then sessionStorage
    const shopDomain = getShopDomain(searchParams);
    const chargeId = searchParams.get('charge_id');

    useEffect(() => {
        if (!chargeId || !shopDomain) {
            return;
        }

        let cancelled = false;

        const verifySubscription = async () => {
            setIsLoading(true);

            try {
                const response = await fetch('/api/billing/verify-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charge_id: chargeId, shop_domain: shopDomain })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Subscription verification failed');
                }

                if (cancelled) {
                    return;
                }

                toast.success('Subscription activated.');
                router.replace(`/dashboard?shop=${shopDomain}`);
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
    }, [chargeId, router, shopDomain, toast]);

    const handleSelectPlan = async (planId: string) => {
        if (!user?.id && !shopDomain) {
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
                    shop_domain: shopDomain
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

    return (
        <div className="h-[100dvh] w-full overflow-hidden bg-[#F6F6F7] flex flex-col items-center justify-center px-4 py-8 font-sans">

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10"
            >
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Plan</h1>
                <p className="text-sm text-gray-500 max-w-md">
                    Start syncing your inventory across platforms. All plans include a 7-day free trial.
                </p>
            </motion.div>

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

                                {/* Price */}
                                <div className="mb-5">
                                    <span className="text-3xl font-extrabold text-gray-900">${plan.price}</span>
                                    <span className="text-sm text-gray-400 ml-1">/month</span>
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
                                        <><ArrowRight className="w-4 h-4" /> Get Started</>
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
