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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50/50 border border-gray-100 p-6 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Package className="w-6 h-6" />
                                </div>
                                <span className="text-sm font-bold text-gray-500">Total Products</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-4xl font-black text-gray-900">{stats.totalProducts}</span>
                                <span className="text-xs text-gray-400 font-bold mb-1">Unique Items</span>
                            </div>
                        </div>

                        <div className="bg-gray-50/50 border border-gray-100 p-6 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Link2 className="w-6 h-6" />
                                </div>
                                <span className="text-sm font-bold text-gray-500">Matched Sync</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-end gap-2">
                                    <span className="text-4xl font-black text-gray-900">{stats.matchedProducts}</span>
                                    <span className="text-xs text-gray-400 font-bold mb-1">/ {stats.totalProducts} matched</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                                    <div 
                                        className="bg-emerald-500 h-1.5 rounded-full" 
                                        style={{ width: `${stats.totalProducts > 0 ? (stats.matchedProducts / stats.totalProducts) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Platform Status */}
                <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50 flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 mb-6">Store Connections</h3>
                    <div className="space-y-4 flex-1">
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
                    <Link 
                        href="/dashboard/settings" 
                        className="mt-6 flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all group"
                    >
                        Store Settings <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </section>

            {/* ═══ Alerts Row (Mismatches & Action Required) ═══ */}
            {(stats.mismatchCount > 0 || stats.actionRequiredCount > 0) && (
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Action Required */}
                    <div className="bg-red-50/50 border border-red-100 rounded-[2rem] p-8">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-red-100 text-red-600 rounded-xl">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-black text-red-900">Action Required</h3>
                            </div>
                            <span className="px-3 py-1 bg-red-600 text-white rounded-full text-[10px] font-black">{stats.actionRequiredCount} ITEMS</span>
                        </div>
                        
                        <div className="space-y-3 mb-6">
                            {stats.actionRequiredItems.map(item => (
                                <div key={item.id} className="bg-white/80 p-3 rounded-2xl flex items-center gap-3 border border-red-50">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-gray-900 truncate">{item.name}</p>
                                        <p className="text-[10px] font-bold text-gray-400">{item.sku}</p>
                                    </div>
                                    <Link href="/dashboard/inventory" className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            ))}
                        </div>
                        <Link href="/dashboard/inventory" className="text-xs font-black text-red-600 hover:text-red-800 flex items-center gap-2 uppercase tracking-wide">
                            View All Items <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    {/* Mismatches */}
                    <div className="bg-amber-50/50 border border-amber-100 rounded-[2rem] p-8">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl">
                                    <Activity className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-black text-amber-900">Inventory Mismatch</h3>
                            </div>
                            <button 
                                onClick={handlePushMismatch}
                                disabled={isPushingMismatch}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-amber-600/20"
                            >
                                {isPushingMismatch ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Push All to Sync
                            </button>
                        </div>

                        <div className="space-y-3 mb-6">
                            {stats.mismatchItems.map(item => (
                                <div key={item.id} className="bg-white/80 p-3 rounded-2xl flex items-center gap-3 border border-amber-50">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 text-center flex items-center justify-center">
                                         {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-gray-900 truncate">{item.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded">S: {item.shopify_stock_snapshot}</span>
                                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 rounded">E: {item.etsy_stock_snapshot}</span>
                                        </div>
                                    </div>
                                    <Link href="/dashboard/inventory" className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            ))}
                        </div>
                        <Link href="/dashboard/inventory" className="text-xs font-black text-amber-600 hover:text-amber-800 flex items-center gap-2 uppercase tracking-wide">
                            Fix Discrepancies <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
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
