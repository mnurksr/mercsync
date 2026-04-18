'use client';

import { useState, useEffect } from 'react';
import {
    Package, TrendingUp, AlertTriangle, Clock,
    Link2, ArrowRight, RefreshCw, ShoppingBag,
    Store, CheckCircle2, XCircle, Activity
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from '../actions/dashboard';
import { getSetupStatus, type SetupStatus } from '../actions/staging';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from '@/components/ui/useToast';
import Link from 'next/link';

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
        lastSync: '--',
        matchedProducts: 0
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

    if (isLoading) {
        return (
            <div className="space-y-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-48 rounded-2xl" />
                    <Skeleton className="h-48 rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ═══ Stat Cards ═══ */}
            <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Sync Health</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        icon={<Package className="w-5 h-5 text-blue-600" />}
                        bgColor="bg-blue-50"
                        value={stats.productsSynced}
                        label="Total Products"
                    />
                    <StatCard
                        icon={<TrendingUp className="w-5 h-5 text-green-600" />}
                        bgColor="bg-green-50"
                        value={`${stats.syncSuccessRate}%`}
                        label="Sync Success Rate"
                        valueColor={stats.syncSuccessRate >= 90 ? 'text-green-600' : stats.syncSuccessRate >= 50 ? 'text-yellow-600' : 'text-red-600'}
                    />
                    <StatCard
                        icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
                        bgColor="bg-orange-50"
                        value={stats.atRiskProducts}
                        label="Low Stock Items"
                        valueColor={stats.atRiskProducts > 0 ? 'text-orange-600' : 'text-gray-900'}
                    />
                    <StatCard
                        icon={<Clock className="w-5 h-5 text-purple-600" />}
                        bgColor="bg-purple-50"
                        value={stats.lastSync}
                        label="Last Sync"
                    />
                </div>
            </section>

            {/* ═══ Middle Row: Store Status + Quick Actions ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Store Connection Status */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-gray-400" />
                        Connected Platforms
                    </h3>
                    <div className="space-y-3">
                        <PlatformRow
                            name="Shopify"
                            icon={<ShoppingBag className="w-4 h-4 text-white" />}
                            color="#95BF47"
                            connected={stores.shopify.connected}
                            domain={stores.shopify.name}
                        />
                        <PlatformRow
                            name="Etsy"
                            icon={<Store className="w-4 h-4 text-white" />}
                            color="#F56400"
                            connected={stores.etsy.connected}
                            domain={stores.etsy.name}
                        />
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-50">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Matched Products</span>
                            <span className="font-bold text-gray-900">{stats.matchedProducts} / {stats.productsSynced}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                            <div
                                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                style={{ width: stats.productsSynced > 0 ? `${Math.round((stats.matchedProducts / stats.productsSynced) * 100)}%` : '0%' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-gray-400" />
                        Quick Actions
                    </h3>
                    <div className="space-y-2">
                        <QuickActionLink href="/dashboard/products" label="Manage Products" description="View, match, and sync your products" />
                        <QuickActionLink href="/dashboard/inventory" label="Inventory Overview" description="Check stock levels across platforms" />
                        <QuickActionLink href="/dashboard/history" label="Sync History" description="Review past synchronization events" />
                        <QuickActionLink href="/dashboard/settings" label="Settings" description="Configure sync rules, locations, and billing" />
                    </div>
                </div>
            </div>

            {/* ═══ Recent Activity ═══ */}
            <section>
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-gray-400" />
                            Recent Activity
                        </h3>
                        <Link href="/dashboard/history" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                            View All <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    {activities.length === 0 ? (
                        <div className="text-center py-8">
                            <RefreshCw className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                            <p className="text-sm text-gray-400 font-medium">No sync activity yet</p>
                            <p className="text-xs text-gray-300 mt-1">Activity will appear here once products start syncing</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {activities.map((item) => (
                                <div key={item.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                                        item.status === 'success' ? 'bg-green-500' : item.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-800 font-medium truncate">{item.action}</p>
                                        <p className="text-xs text-gray-400 truncate">{item.product}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{item.platform}</span>
                                        <p className="text-[10px] text-gray-300">{item.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

// ═══ Sub-Components ═══

function StatCard({ icon, bgColor, value, label, valueColor = 'text-gray-900' }: {
    icon: React.ReactNode;
    bgColor: string;
    value: string | number;
    label: string;
    valueColor?: string;
}) {
    return (
        <div className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 ${bgColor} rounded-xl flex items-center justify-center`}>
                    {icon}
                </div>
            </div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
        </div>
    );
}

function PlatformRow({ name, icon, color, connected, domain }: {
    name: string;
    icon: React.ReactNode;
    color: string;
    connected: boolean;
    domain: string | null;
}) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{name}</p>
                {connected && domain && (
                    <p className="text-xs text-gray-400 truncate">{domain}</p>
                )}
            </div>
            {connected ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
            ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                    <XCircle className="w-3 h-3" /> Not Connected
                </span>
            )}
        </div>
    );
}

function QuickActionLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0" />
        </Link>
    );
}
