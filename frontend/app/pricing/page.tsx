'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Check, Zap, Crown, Shield, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ui/useToast';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getShopDomain } from '@/utils/shopDomain';
import { PLAN_CONFIG, PLAN_ORDER, type PlanId } from '@/config/plans';

const PLAN_STYLE: Record<PlanId, { icon: typeof Zap; popular?: boolean }> = {
    starter: { icon: Zap },
    growth: { icon: Crown, popular: true },
    pro: { icon: Shield },
};

const plans = PLAN_ORDER.map(id => ({
    ...PLAN_CONFIG[id],
    ...PLAN_STYLE[id],
    cta: 'Start Free Trial',
}));

export default function PricingPage() {
    const { user } = useAuth();
    const toast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState<string | null>(null);

    // Get shop domain — checks URL params first, then sessionStorage
    const shopDomain = getShopDomain(searchParams);

    // Create Shopify subscription via our billing API
    const initiateSubscription = async (planId: string) => {
        // Need either user auth or shop domain from URL
        if (!user?.id && !shopDomain) {
            router.push(`/login?redirect=${encodeURIComponent(`/pricing?checkout=${planId}`)}`);
            return;
        }

        setIsLoading(planId);
        try {
            const response = await fetch('/api/billing/create-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: planId,
                    user_id: user?.id || undefined,
                    shop_domain: shopDomain
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create subscription');
            }

            if (data.confirmationUrl) {
                // Redirect to Shopify's secure billing page (iframe-safe)
                const targetWindow = window.top || window;
                targetWindow.location.href = data.confirmationUrl;
            } else {
                throw new Error('No confirmation URL received');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'An error occurred. Please try again.';
            console.error('Billing error:', error);
            toast.error(message);
        } finally {
            setIsLoading(null);
        }
    };

    // Handle auto-checkout after login redirect
    useEffect(() => {
        const checkoutPlan = searchParams.get('checkout');
        if (checkoutPlan && user && !isLoading) {
            initiateSubscription(checkoutPlan);
        }
    }, [user, searchParams]);

    const handlePlanClick = (plan: typeof plans[0]) => {
        if (isLoading) return;
        initiateSubscription(plan.id);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900 font-sans">
            {/* Header */}
            <header className="fixed w-full bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2.5">
                        <Image src="/logo.png" alt="MercSync" width={32} height={32} className="rounded-lg" />
                        <span className="text-xl font-bold tracking-tight">MercSync</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-8">
                        <Link href="/#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">How It Works</Link>
                        <Link href="/#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                            Sign In
                        </Link>
                        <Link
                            href="/login"
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-24">
                {/* Hero Section */}
                <div className="text-center max-w-4xl mx-auto px-4 mb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 text-sm font-semibold mb-6 border border-blue-100">
                            <Sparkles className="w-4 h-4" />
                            7-day free trial • Shopify Billing
                        </div>

                        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
                            Stop Losing Money to{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                                Overselling
                            </span>
                        </h1>

                        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                            Choose a plan that fits your business. All plans include our core sync technology that prevents costly overselling mistakes.
                        </p>
                    </motion.div>
                </div>

                {/* Pricing Cards */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-3 gap-8 items-start">
                        {plans.map((plan, index) => (
                            <motion.div
                                key={plan.name}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className={`
                                    relative bg-white rounded-3xl p-8 shadow-xl border-2 transition-all hover:scale-[1.02] hover:shadow-2xl
                                    ${plan.popular
                                        ? 'border-blue-500 shadow-blue-100'
                                        : 'border-gray-100 hover:border-gray-200'
                                    }
                                `}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">
                                        Most Popular
                                    </div>
                                )}

                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${plan.popular ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    <plan.icon className="w-6 h-6" />
                                </div>

                                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                <p className="text-gray-500 text-sm mb-6">{plan.description}</p>

                                <div className="mb-8">
                                    <span className="text-5xl font-black text-gray-900">${plan.price}</span>
                                    <span className="text-gray-500 text-lg">/month</span>
                                </div>

                                <ul className="space-y-4 mb-8">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${plan.popular ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                <Check className="w-3 h-3" strokeWidth={3} />
                                            </div>
                                            <span className="text-gray-600 text-sm">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handlePlanClick(plan)}
                                    disabled={!!isLoading}
                                    className={`
                                        w-full py-4 rounded-xl font-bold text-center flex items-center justify-center gap-2 transition-all
                                        ${plan.popular
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                                            : 'bg-gray-900 hover:bg-black text-white'
                                        }
                                        ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {isLoading === plan.id ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            {plan.cta}
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Trust Section */}
                <div className="mt-24 max-w-4xl mx-auto px-4 text-center">
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-12 text-white">
                        <h3 className="text-2xl font-bold mb-4">
                            🛡️ 100% Money-Back Guarantee
                        </h3>
                        <p className="text-gray-300 max-w-xl mx-auto leading-relaxed">
                            If MercSync does not deliver the value promised on this page, contact us within 30 days of your first paid charge and we will review your request under our current refund policy.
                        </p>
                    </div>
                </div>

                {/* FAQ Preview */}
                <div className="mt-24 max-w-3xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
                        Frequently Asked Questions
                    </h2>

                    <div className="space-y-4">
                        {[
                            {
                                q: 'How does the free trial work?',
                                a: 'Each plan starts with a 7-day Shopify Billing trial. You can change or cancel from Shopify admin.'
                            },
                            {
                                q: 'Can I change plans later?',
                                a: 'Absolutely! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and billing is prorated.'
                            },
                            {
                                q: 'What happens if I exceed my product limit?',
                                a: "We'll notify you when you're approaching your limit. You can upgrade your plan or remove inactive products to stay within your limit."
                            }
                        ].map((faq, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                                <h4 className="font-bold text-gray-900 mb-2">{faq.q}</h4>
                                <p className="text-gray-600 text-sm">{faq.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-100 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Image src="/logo.png" alt="MercSync" width={24} height={24} className="rounded" />
                        <span className="text-lg font-bold text-gray-900">MercSync</span>
                    </div>
                    <div className="flex gap-6">
                        <Link href="/privacy" className="text-gray-400 hover:text-gray-900 transition-colors text-sm">Privacy Policy</Link>
                        <Link href="/terms" className="text-gray-400 hover:text-gray-900 transition-colors text-sm">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
