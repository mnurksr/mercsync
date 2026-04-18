'use client';

import { useState, useEffect } from 'react';
import {
    Package, TrendingUp, AlertTriangle, Clock,
    Link2, ArrowRight, RefreshCw, ShoppingBag,
    Store, CheckCircle2, XCircle, Activity, Bell
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from '../actions/dashboard';
import { getNotifications, markAsRead, type NotificationItem } from '../actions/notifications';
import { pushMismatchStock } from '../actions/inventory';
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
        totalProducts: 0,
        shopifyProductCount: 0,
        etsyProductCount: 0,
        matchedProducts: 0,
        mismatchCount: 0,
        actionRequiredCount: 0,
        connectedStores: 0,
        lastSync: '--',
        mismatchItems: [],
        actionRequiredItems: []
    });
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isPushingMismatch, setIsPushingMismatch] = useState(false);

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
            const [shopify, etsy, dashboardStats, recentActivity, latestNotifications] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getDashboardStats(),
                getRecentActivity(),
                getNotifications()
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
            setNotifications(latestNotifications);

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const handlePushMismatch = async () => {
        setIsPushingMismatch(true);
        try {
            const res = await pushMismatchStock();
            if (res.success) {
                toast.success(res.message);
                loadData();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error('Failed to push mismatch stock');
        } finally {
            setIsPushingMismatch(false);
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
        <div className="space-y-6 pb-20">
            {/* ═══ Header with Refresh ═══ */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Overview</h1>
                    <p className="text-sm text-gray-500 font-medium capitalize">Real-time store synchronization overview</p>
                </div>
                <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-3 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw className={`w-5 h-5 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* ═══ Inventory Summary Row ═══ */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stats Card */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black text-gray-900">Inventory Sync Health</h3>
                            <p className="text-xs text-gray-400 font-semibold tracking-wide uppercase mt-1">Product Data Stats</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest">
                            <Clock className="w-3 h-3" /> {stats.lastSync}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50/50 border border-gray-100 p-6 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Package className="w-6 h-6" />
                                </div>
                                <span className="text-sm font-bold text-gray-500">Inventory Overview</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-end gap-2">
                                    <span className="text-4xl font-black text-gray-900">{stats.totalProducts}</span>
                                    <span className="text-xs text-gray-400 font-bold mb-1">Total Unique Items</span>
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-black uppercase">
                                        <ShoppingBag className="w-3 h-3" /> Shopify: {stats.shopifyProductCount}
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-[10px] font-black uppercase">
                                        <Store className="w-3 h-3" /> Etsy: {stats.etsyProductCount}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-emerald-50/30 border border-emerald-100/50 p-6 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Link2 className="w-6 h-6" />
                                </div>
                                <span className="text-sm font-bold text-gray-500">Cross-Store Linking</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-end gap-2">
                                    <span className="text-4xl font-black text-gray-900">{stats.matchedProducts}</span>
                                    <span className="text-xs text-gray-400 font-bold mb-1">Products Synced</span>
                                </div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Bidirectional sync active for these items</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Instant Inventory Alerts replacing Store Connections */}
                <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50 flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 mb-6">Instant Inventory</h3>
                    
                    <div className="space-y-4 flex-1">
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Mismatched Stock</span>
                                <span className="text-base font-black text-amber-900">{stats.mismatchCount}</span>
                            </div>
                            <p className="text-[10px] text-amber-700/60 font-bold">Items with differing stock levels across platforms.</p>
                        </div>

                        <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Action Required</span>
                                <span className="text-base font-black text-red-900">{stats.actionRequiredCount}</span>
                            </div>
                            <p className="text-[10px] text-red-700/60 font-bold">Items requiring manual mapping or fix.</p>
                        </div>
                    </div>

                    <button 
                        onClick={handlePushMismatch}
                        disabled={isPushingMismatch || stats.mismatchCount === 0}
                        className="mt-6 flex items-center justify-center gap-3 py-4 bg-indigo-600 disabled:bg-gray-100 text-white disabled:text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 group"
                    >
                        {isPushingMismatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Push All Mismatches
                    </button>
                    <Link href="/dashboard/inventory" className="mt-3 text-center text-[10px] font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-colors">
                        Go to full inventory <ArrowRight className="inline w-2.5 h-2.5 ml-1" />
                    </Link>
                </div>
            </section>

            {/* ═══ Health Status Area ═══ */}
            {(stats.mismatchCount > 0 || stats.actionRequiredCount > 0) ? (
                <section className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-gray-900">Inventory Health Alerts</h3>
                            <p className="text-xs text-red-500 font-bold uppercase tracking-widest mt-1">Manual intervention required for {stats.mismatchCount + stats.actionRequiredCount} items</p>
                        </div>
                        <div className="flex gap-3">
                            {stats.mismatchCount > 0 && (
                                <button 
                                    onClick={handlePushMismatch}
                                    disabled={isPushingMismatch}
                                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-amber-600/20"
                                >
                                    {isPushingMismatch ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                    Sync All Mismatches
                                </button>
                            )}
                            <Link href="/dashboard/inventory" className="px-6 py-3 bg-gray-100 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all">
                                View Inventory
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Action Required List */}
                        {stats.actionRequiredCount > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg w-fit text-[10px] font-black uppercase">
                                    <AlertTriangle className="w-3 h-3" /> Mappings Needed
                                </div>
                                <div className="space-y-2">
                                    {stats.actionRequiredItems.slice(0, 3).map(item => (
                                        <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50/50 hover:bg-white border border-transparent hover:border-gray-100 transition-all group">
                                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-400 m-3" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-gray-900 truncate">{item.name}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">{item.sku}</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Mismatch List */}
                        {stats.mismatchCount > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg w-fit text-[10px] font-black uppercase">
                                    <Activity className="w-3 h-3" /> Stock Discrepancies
                                </div>
                                <div className="space-y-2">
                                    {stats.mismatchItems.slice(0, 3).map(item => (
                                        <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50/50 hover:bg-white border border-transparent hover:border-gray-100 transition-all group">
                                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-400 m-3" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-gray-900 truncate">{item.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold text-blue-600">S: {item.shopify_stock_snapshot}</span>
                                                    <span className="text-[10px] font-bold text-orange-600">E: {item.etsy_stock_snapshot}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            ) : (
                <section className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shadow-inner">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900">System Healthy</h3>
                            <p className="text-xs text-gray-400 font-bold">All matched products are currently in sync across platforms.</p>
                        </div>
                    </div>
                    <Link href="/dashboard/inventory" className="text-[10px] font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest flex items-center gap-2 transition-colors">
                        View Inventory <ArrowRight className="w-3 h-3" />
                    </Link>
                </section>
            )}

            {/* ═══ Activity & Notifications ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Notifications List */}
                <section className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                <Bell className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900">Recent Alerts</h3>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {notifications.length === 0 ? (
                            <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                                <p className="text-sm text-gray-400 font-bold">Everything looks great!</p>
                                <p className="text-xs text-gray-300">No new notifications to show.</p>
                            </div>
                        ) : (
                            notifications.slice(0, 5).map((item) => (
                                <div key={item.id} className={`p-4 rounded-2xl border transition-all ${!item.is_read ? 'bg-indigo-50/30 border-indigo-100' : 'bg-gray-50/50 border-gray-100'}`}>
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${!item.is_read ? 'font-black text-gray-900' : 'font-bold text-gray-600'}`}>{item.title}</p>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.message}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 whitespace-nowrap uppercase tracking-widest">{timeAgo(item.created_at)}</span>
                                    </div>
                                    {item.action_url && (
                                        <Link href={item.action_url} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest">
                                            View Details <ArrowRight className="w-2.5 h-2.5" />
                                        </Link>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Recent Sync Activity */}
                <section className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                <Activity className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900">Sync Activity</h3>
                        </div>
                        <Link href="/dashboard/history" className="text-xs font-black text-emerald-600 hover:text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                            View All <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    <div className="space-y-1">
                        {activities.length === 0 ? (
                            <div className="text-center py-12">
                                <Activity className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                                <p className="text-sm text-gray-400 font-bold">Passive Monitoring</p>
                                <p className="text-xs text-gray-300">Activity will be logged here as sync happens.</p>
                            </div>
                        ) : (
                            activities.map((item) => (
                                <ActivityItemRow key={item.id} item={item} />
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

// ═══ Expanded Sub-Components ═══

function ActivityItemRow({ item }: { item: ActivityItem }) {
    return (
        <div className="flex items-center gap-4 py-3 px-4 rounded-2xl hover:bg-gray-50 transition-colors group">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform ${item.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : item.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 font-black truncate">{item.action}</p>
                <p className="text-[11px] text-gray-400 font-bold truncate">{item.product}</p>
            </div>
            <div className="text-right shrink-0">
                <span className={`text-[9px] font-black uppercase tracking-widest ${item.platform === 'shopify' ? 'text-blue-500' : 'text-orange-500'}`}>{item.platform}</span>
                <p className="text-[10px] text-gray-300 font-bold">{item.time}</p>
            </div>
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
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50/50 border border-transparent hover:border-gray-100 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: color }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">{name}</p>
                {connected && domain && (
                    <p className="text-xs text-gray-400 font-bold truncate opacity-60">{domain}</p>
                )}
            </div>
            {connected ? (
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100/50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> Live
                </span>
            ) : (
                <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                    <XCircle className="w-3 h-3" /> Offline
                </span>
            )}
        </div>
    );
}

function timeAgo(dateStr: string) {
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}S`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}M`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}H`;
    const days = Math.floor(hours / 24);
    return `${days}D`;
}
