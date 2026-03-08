'use client';

import { useState, useEffect } from 'react';
import {
    Package, TrendingUp, AlertTriangle, Clock
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from '../actions/dashboard';
import { getSetupStatus, type SetupStatus } from '../actions/staging';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from '@/components/ui/useToast';

export default function Dashboard() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);



    const [stats, setStats] = useState<DashboardStats>({
        productsSynced: 0,
        syncSuccessRate: 0,
        atRiskProducts: 0,
        connectedStores: 0,
        lastSync: '--'
    });
    const [activities, setActivities] = useState<ActivityItem[]>([]);

    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null, lastSync: null as string | null },
        etsy: { connected: false, name: null as string | null, lastSync: null as string | null }
    });

    useEffect(() => {
        // NATIVE SESSIONLESS AUTHENTICATION:
        // Always attempt to load data. The Server Actions will securely read the 'mercsync_shop' 
        // cookie to authenticate embedded Shopify users even if 'user' is null.
        loadData();
    }, []);

    useEffect(() => {
        const chargeId = searchParams.get('charge_id');
        const shopDomainUrl = searchParams.get('shop');

        if (chargeId && shopDomainUrl) {
            console.log('Returned from billing with charge_id:', chargeId);
            setIsLoading(true);

            // Verify with backend
            fetch('/api/billing/verify-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charge_id: chargeId, shop_domain: shopDomainUrl })
            }).then(async res => {
                const data = await res.json();
                if (data.success) {
                    toast.success("Subscription Activated. Welcome aboard!");
                    // Force a total refresh so layout.tsx reads the new plan from DB
                    window.location.href = `/dashboard?shop=${shopDomainUrl}`;
                } else {
                    toast.error("Subscription verification failed. Please try again.");
                }
            }).catch(e => {
                console.error(e);
                toast.error("Error verifying payment.");
            }).finally(() => {
                setIsLoading(false);
                // Clean the URL using History API to prevent page reload
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('charge_id');
                window.history.replaceState({}, '', newUrl.toString());
            });
        }
    }, [searchParams, toast]);

    const loadData = async () => {
        try {
            const [shopify, etsy, dashboardStats, recentActivity, wizardStatus] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getDashboardStats(),
                getRecentActivity(),
                getSetupStatus()
            ]);

            // Security check: If Server Actions couldn't find ANY identity (Session OR Cookie)
            if (!shopify.connected && !shopify.shop_domain && dashboardStats.connectedStores === 0) {
                router.push('/login');
                return;
            }

            // Redirect to billing only if pending AND no ongoing payment verification
            const chargeId = searchParams.get('charge_id');
            if (shopify.plan_type === 'pending' && !chargeId) {
                router.push('/billing');
                return;
            }

            // NOTE: The Server-Side layout.tsx guard handles routing for incomplete setup or missing plans.
            // We no longer need to check `wizardStatus.isComplete` or `shopify.plan_type` here on the client.

            const newStores = {
                shopify: {
                    connected: shopify.connected,
                    name: shopify.shop_domain,
                    lastSync: shopify.last_sync
                },
                etsy: {
                    connected: etsy.connected,
                    name: etsy.shop_domain,
                    lastSync: etsy.last_sync
                }
            };

            setStores(newStores);
            setStats(dashboardStats);
            setActivities(recentActivity);

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadData();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <div className="space-y-8">
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100">
                            <div className="flex items-center gap-3 mb-3">
                                <Skeleton className="w-10 h-10 rounded-xl" />
                            </div>
                            <Skeleton className="h-8 w-16 mb-2" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    ))}
                </div>
            ) : (
                <section>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Sync Health</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <Package className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{stats.productsSynced}</div>
                            <div className="text-xs text-gray-500 mt-1">Products Synced</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-green-600">{stats.syncSuccessRate}%</div>
                            <div className="text-xs text-gray-500 mt-1">Sync Success Rate</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-orange-600">{stats.atRiskProducts}</div>
                            <div className="text-xs text-gray-500 mt-1">At-Risk Products</div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-purple-600" />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{stats.lastSync}</div>
                            <div className="text-xs text-gray-500 mt-1">Last Sync</div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
