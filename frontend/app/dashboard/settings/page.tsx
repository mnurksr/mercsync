'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import {
    Link2, Settings, Bell, DollarSign, MapPin, Shield,
    ShoppingBag, Store, Check, X, ExternalLink,
    ArrowUpRight, Unlink, Save, Loader2,
    CreditCard, Trash2, ArrowRight, Star,
    Mail, BellRing, ChevronUp, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ui/useToast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop, disconnectShop, getShopifyLocations as fetchShopifyLocations, saveShopifyLocations, getShopLocationConfig } from '../../actions/shop';
import { getDashboardStats } from '../../actions/dashboard';
import {
    getSettings, updateSettings,
    type ShopSettings, type SyncDirection,
    type PriceRule, type NotificationChannels, type NotificationEvents
} from '../../actions/settings';
import { wipeAllAppData } from '../../actions/advanced';
import { getPlanConfig, PLAN_CONFIG, PLAN_ORDER, type PlanId } from '@/config/plans';

// ─── Tab definitions ─────────────────────────

const TABS = [
    { id: 'connections', label: 'Connections', icon: Link2 },
    { id: 'sync', label: 'Sync Settings', icon: Settings },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'pricing', label: 'Price Rules', icon: DollarSign },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
    { id: 'advanced', label: 'Advanced', icon: Shield },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Main Component ──────────────────────────

export default function SettingsPage() {
    const { supabase, user } = useAuth();
    const toast = useToast();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<TabId>('connections');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Store connection state
    const [stores, setStores] = useState({
        shopify: { connected: false, name: null as string | null, domain: null as string | null, plan_type: null as string | null, currency: 'USD' },
        etsy: { connected: false, name: null as string | null, shopId: null as string | null, currency: 'USD' }
    });

    const [productsCount, setProductsCount] = useState(0);

    // Settings state
    const [settings, setSettings] = useState<ShopSettings>({
        sync_direction: 'bidirectional',
        auto_sync_enabled: false,
        low_stock_threshold: 5,
        auto_create_products: false,
        auto_update_products: false,
        auto_delete_products: false,
        location_deduction_order: [],
        price_sync_enabled: false,
        price_rules: [],
        notification_channels: { in_app: true, email: false, slack_webhook_url: null },
        notification_events: { stock_zero: true, sync_failed: true, oversell_risk: true },
        notification_frequency: 'instant',
        notification_email: null
    });

    // Locations state
    const [locations, setLocations] = useState<{ id: string; name: string; active: boolean; address1?: string }[]>([]);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [primaryLocationId, setPrimaryLocationId] = useState<string | null>(null);
    const [savingLocations, setSavingLocations] = useState(false);

    // Notification email
    const [notificationEmail, setNotificationEmail] = useState('');

    // Modal states
    const [showShopifyModal, setShowShopifyModal] = useState(false);
    const [showEtsyModal, setShowEtsyModal] = useState(false);
    const [shopName, setShopName] = useState('');
    const [disconnectTarget, setDisconnectTarget] = useState<'shopify' | 'etsy' | null>(null);

    // Dirty tracking
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [shopify, etsy, savedSettings, dashStats] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getSettings(),
                getDashboardStats()
            ]);

            setProductsCount(dashStats.matchedProducts || 0);

            setStores({
                shopify: { 
                    connected: shopify.connected, 
                    name: shopify.shop_domain, 
                    domain: shopify.shop_domain, 
                    plan_type: shopify.plan_type || null,
                    currency: shopify.shopify_currency || 'USD'
                },
                etsy: { 
                    connected: etsy.connected, 
                    name: etsy.shop_domain, 
                    shopId: null,
                    currency: etsy.etsy_currency || 'USD'
                }
            });

            setSettings(savedSettings);
            setNotificationEmail(savedSettings.notification_email || user?.email || '');

            // Load locations if Shopify connected
            if (shopify.connected) {
                const [locResult, savedConfig] = await Promise.all([
                    fetchShopifyLocations(),
                    getShopLocationConfig()
                ]);
                if (locResult.success && locResult.data) {
                    const locs = locResult.data.map((l: any) => ({
                        id: l.id?.toString(),
                        name: l.name,
                        active: l.active || false,
                        address1: l.address1
                    }));
                    setLocations(locs);

                    const { mainLocationId: savedPrimaryId, selectedLocationIds: savedSelectedIds } = savedConfig;

                    // Restore saved primary location from DB
                    if (savedPrimaryId) {
                        setPrimaryLocationId(savedPrimaryId);
                    } else {
                        // No saved primary — fall back to first active location
                        const firstActive = locs.find(l => l.active);
                        setPrimaryLocationId(firstActive?.id || (locs.length > 0 ? locs[0].id : null));
                    }

                    // Restore saved selected locations from DB
                    if (savedSelectedIds.length > 0) {
                        // Only use IDs that still exist in the Shopify locations list
                        const validLocIds = locs.map(l => l.id);
                        const validSavedIds = savedSelectedIds.filter(id => validLocIds.includes(id));
                        setSelectedLocationIds(validSavedIds.length > 0 ? validSavedIds : [locs[0]?.id].filter(Boolean));
                    } else {
                        // No saved selection — fall back to all active locations
                        const activeLocs = locs.filter(l => l.active).map(l => l.id);
                        setSelectedLocationIds(activeLocs.length > 0 ? activeLocs : locs.length > 0 ? [locs[0].id] : []);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await updateSettings({
                ...settings,
                notification_email: notificationEmail || null
            });
            if (result.success) {
                toast.success('Settings saved successfully');
                setIsDirty(false);
            } else {
                toast.error(result.message);
            }
        } catch (err: any) {
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveLocations = async () => {
        if (selectedLocationIds.length === 0 || !primaryLocationId) {
            toast.warning('Please select at least one location and set a primary.');
            return;
        }
        setSavingLocations(true);
        try {
            const sortedLocations = [
                primaryLocationId,
                ...selectedLocationIds.filter(id => id !== primaryLocationId)
            ];

            const result = await saveShopifyLocations(sortedLocations);
            if (result.success) {
                toast.success('Location settings saved');
            } else {
                toast.error(result.message || 'Failed to save locations');
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setSavingLocations(false);
        }
    };

    const updateField = <K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    // ─── Store connection handlers ───
    const handleConnectShopify = () => {
        if (!shopName.trim()) { toast.warning('Please enter the shop name'); return; }
        if (!user?.id) { toast.error('User session not found.'); return; }
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/shopify/callback`);
        let cleanShopName = shopName.trim();
        if (!cleanShopName.includes('.')) cleanShopName += '.myshopify.com';
        window.location.href = `/api/auth/shopify/start?user_id=${user.id}&shop=${encodeURIComponent(cleanShopName)}&return_url=${returnUrl}`;
    };

    const handleConnectEtsy = () => {
        if (!shopName.trim()) { toast.warning('Please enter the shop name'); return; }
        const returnUrl = encodeURIComponent(`${window.location.origin}/auth/etsy/callback`);
        window.location.href = `/api/auth/etsy/start?user_id=${user?.id || ''}&shop=${encodeURIComponent(shopName.trim())}&return_url=${returnUrl}`;
    };

    const executeDisconnect = async () => {
        if (!disconnectTarget) return;
        const platform = disconnectTarget;
        setDisconnectTarget(null);
        try {
            const result = await disconnectShop(platform);
            if (result.success) {
                setStores(prev => ({
                    ...prev,
                    [platform]: { connected: false, name: null, domain: null, shopId: null, plan_type: null }
                }));
                toast.success('Disconnected successfully.');
                loadData();
            } else {
                toast.error(`Failed to disconnect: ${result.message}`);
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        }
    };

    // ─── Render ──────────────────────

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Tab Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                                isActive
                                    ? 'bg-gray-900 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Save Bar (sticky) — only for tabs that use settings state */}
            <AnimatePresence>
                {isDirty && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="sticky top-20 z-20 bg-blue-600 text-white rounded-xl px-5 py-3 flex items-center justify-between shadow-lg"
                    >
                        <span className="text-sm font-medium">You have unsaved changes</span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { loadData(); setIsDirty(false); }}
                                className="px-4 py-1.5 text-sm font-medium text-blue-100 hover:text-white transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-5 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tab Content */}
            {isLoading ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8">
                    <div className="space-y-4 animate-pulse">
                        <div className="h-6 w-48 bg-gray-200 rounded" />
                        <div className="h-4 w-full bg-gray-100 rounded" />
                        <div className="h-12 w-full bg-gray-100 rounded-xl" />
                        <div className="h-12 w-full bg-gray-100 rounded-xl" />
                    </div>
                </div>
            ) : (
                <>
                    {activeTab === 'connections' && (
                        <ConnectionsTab
                            stores={stores}
                            setShopName={setShopName}
                            setShowShopifyModal={setShowShopifyModal}
                            setShowEtsyModal={setShowEtsyModal}
                            onDisconnect={setDisconnectTarget}
                        />
                    )}
                    {activeTab === 'sync' && (
                        <SyncTab settings={settings} updateField={updateField} locations={locations} storesConnected={stores.shopify.connected} />
                    )}
                    {activeTab === 'locations' && (
                        <LocationsTab
                            locations={locations}
                            selectedLocationIds={selectedLocationIds}
                            setSelectedLocationIds={setSelectedLocationIds}
                            primaryLocationId={primaryLocationId}
                            setPrimaryLocationId={setPrimaryLocationId}
                            onSave={handleSaveLocations}
                            saving={savingLocations}
                            storesConnected={stores.shopify.connected}
                        />
                    )}
                    {activeTab === 'pricing' && (
                        <PricingTab settings={settings} updateField={updateField} stores={stores} />
                    )}
                    {activeTab === 'notifications' && (
                        <NotificationsTab
                            settings={settings}
                            updateField={updateField}
                            notificationEmail={notificationEmail}
                            setNotificationEmail={setNotificationEmail}
                            setIsDirty={setIsDirty}
                        />
                    )}
                    {activeTab === 'billing' && (
                        <BillingTab stores={stores} productsCount={productsCount} />
                    )}
                    {activeTab === 'advanced' && (
                        <AdvancedTab />
                    )}
                </>
            )}

            {/* Connect Modals */}
            <ConnectModal
                show={showShopifyModal}
                onClose={() => setShowShopifyModal(false)}
                platform="shopify"
                shopName={shopName}
                setShopName={setShopName}
                onConnect={handleConnectShopify}
            />
            <ConnectModal
                show={showEtsyModal}
                onClose={() => setShowEtsyModal(false)}
                platform="etsy"
                shopName={shopName}
                setShopName={setShopName}
                onConnect={handleConnectEtsy}
            />

            {/* Disconnect Confirm Modal */}
            <ConfirmModal
                isOpen={!!disconnectTarget}
                title="Disconnect Store"
                message="Are you sure you want to disconnect? You can reconnect later."
                variant="danger"
                confirmLabel="Disconnect"
                cancelLabel="Cancel"
                onConfirm={executeDisconnect}
                onCancel={() => setDisconnectTarget(null)}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════
// Tab Components
// ═══════════════════════════════════════════════

// ─── Connections Tab (no Account section) ────

function ConnectionsTab({ stores, setShopName, setShowShopifyModal, setShowEtsyModal, onDisconnect }: any) {
    return (
        <div className="space-y-4">
            <SectionHeader title="Connected Stores" description="Manage your e-commerce platform connections" />

            <StoreCard
                name="Etsy"
                icon={<Store className="w-6 h-6 text-white" />}
                color="#F56400"
                connected={stores.etsy.connected}
                domain={stores.etsy.name}
                currency={stores.etsy.currency}
                onConnect={() => { setShopName(''); setShowEtsyModal(true); }}
                onDisconnect={() => onDisconnect('etsy')}
                adminUrl="https://www.etsy.com/your/shops/me"
            />
        </div>
    );
}

// ─── Sync Settings Tab (simplified) ──────────

function SyncTab({ settings, updateField, locations, storesConnected }: { settings: ShopSettings; updateField: any; locations: any[]; storesConnected: boolean }) {
    
    // Sort locations based on the saved deduction order
    // If a location is not in the array, it goes to the bottom
    const sortedLocations = [...locations].sort((a, b) => {
        const indexA = settings.location_deduction_order.indexOf(a.id);
        const indexB = settings.location_deduction_order.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    const moveLocation = (index: number, direction: 'up' | 'down') => {
        const currentOrder = settings.location_deduction_order.length > 0 
            ? [...settings.location_deduction_order]
            : locations.map(l => l.id); // Initialize if empty
        
        // Ensure all locations exist in the order array
        locations.forEach(loc => {
            if (!currentOrder.includes(loc.id)) currentOrder.push(loc.id);
        });

        if (direction === 'up' && index > 0) {
            const temp = currentOrder[index];
            currentOrder[index] = currentOrder[index - 1];
            currentOrder[index - 1] = temp;
        } else if (direction === 'down' && index < currentOrder.length - 1) {
            const temp = currentOrder[index];
            currentOrder[index] = currentOrder[index + 1];
            currentOrder[index + 1] = temp;
        }
        updateField('location_deduction_order', currentOrder);
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Sync Settings" description="Configure how inventory synchronizes between your platforms" />

            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                {/* Auto-Sync Toggle */}
                <SettingRow
                    label="Auto-Sync"
                    description="Automatically sync inventory changes between platforms in real-time"
                >
                    <ToggleSwitch
                        enabled={settings.auto_sync_enabled}
                        onChange={(v) => updateField('auto_sync_enabled', v)}
                    />
                </SettingRow>

                {/* Sync Direction */}
                <SettingRow
                    label="Sync Direction"
                    description="Choose which direction inventory changes flow"
                >
                    <SelectBox
                        value={settings.sync_direction}
                        onChange={(v) => updateField('sync_direction', v as SyncDirection)}
                        options={[
                            { value: 'bidirectional', label: 'Bidirectional (Both Ways)' },
                            { value: 'shopify_to_etsy', label: 'Shopify → Etsy Only' },
                            { value: 'etsy_to_shopify', label: 'Etsy → Shopify Only' }
                        ]}
                    />
                </SettingRow>
            </div>

            {/* Location Deduction Priority */}
            <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Shopify Location Deduction Priority</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        When an order is placed on Etsy, we need to reduce stock on Shopify. If a product has stock in multiple Shopify locations, we will deduct stock in the order defined below (top to bottom).
                    </p>
                </div>
                
                {!storesConnected ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                        <p className="text-sm text-gray-400">Connect Shopify to manage locations.</p>
                    </div>
                ) : locations.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                        <p className="text-sm text-gray-400">Loading locations...</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sortedLocations.map((loc, index) => (
                            <div key={loc.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded text-xs font-bold text-gray-500">
                                        {index + 1}
                                    </div>
                                    <span className="text-sm font-semibold text-gray-700">{loc.name}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <button 
                                        onClick={() => moveLocation(index, 'up')}
                                        disabled={index === 0}
                                        className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 p-1"
                                    >
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => moveLocation(index, 'down')}
                                        disabled={index === sortedLocations.length - 1}
                                        className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 p-1"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Locations Tab (interactive, like setup wizard) ──

function LocationsTab({ locations, selectedLocationIds, setSelectedLocationIds, primaryLocationId, setPrimaryLocationId, onSave, saving, storesConnected }: {
    locations: { id: string; name: string; active: boolean; address1?: string }[];
    selectedLocationIds: string[];
    setSelectedLocationIds: (v: string[] | ((prev: string[]) => string[])) => void;
    primaryLocationId: string | null;
    setPrimaryLocationId: (v: string) => void;
    onSave: () => void;
    saving: boolean;
    storesConnected: boolean;
}) {
    return (
        <div className="space-y-4">
            <SectionHeader title="Inventory Locations" description="Select which Shopify locations supply your Etsy stock and set a primary fulfillment location" />

            {!storesConnected ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-400">Connect Shopify first to manage locations.</p>
                </div>
            ) : locations.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 text-gray-300 animate-spin" />
                    <p className="text-sm text-gray-400">Loading locations...</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <p className="text-sm text-gray-500 mb-4">
                        Select the locations whose stock will be aggregated for Etsy. The <strong>primary</strong> location is used for fulfillment priority.
                    </p>

                    <div className="space-y-2 mb-6">
                        {locations.map(loc => {
                            const isSelected = selectedLocationIds.includes(loc.id);
                            const isPrimary = primaryLocationId === loc.id;

                            return (
                                <div
                                    key={loc.id}
                                    className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                                        isSelected
                                            ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600/10'
                                            : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                                    }`}
                                >
                                    <div
                                        className="flex items-center gap-3 cursor-pointer select-none flex-1"
                                        onClick={() => {
                                            if (isPrimary) {
                                                alert('Cannot unselect the primary location. Assign a new primary first.');
                                                return;
                                            }
                                            setSelectedLocationIds((prev: string[]) =>
                                                isSelected
                                                    ? prev.filter(id => id !== loc.id)
                                                    : [...prev, loc.id]
                                            );
                                        }}
                                    >
                                        <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                            isSelected ? 'bg-indigo-600' : 'bg-white border border-gray-300'
                                        }`}>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>
                                                {loc.name}
                                            </p>
                                            {loc.address1 && <p className="text-[11px] text-gray-400 truncate">{loc.address1}</p>}
                                        </div>
                                    </div>

                                    {isSelected && (
                                        <div className="shrink-0">
                                            {isPrimary ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200">
                                                    ★ Primary
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPrimaryLocationId(loc.id); }}
                                                    className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-md transition-colors border border-transparent hover:border-indigo-100"
                                                >
                                                    Set Primary
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={onSave}
                        disabled={saving || selectedLocationIds.length === 0}
                        className="w-full h-11 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Save Location Settings
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Price Rules Tab (improved UX + currency) ─

function PricingTab({ settings, updateField, stores }: { settings: ShopSettings; updateField: any; stores: any }) {
    const addRule = () => {
        if (settings.price_rules.length >= 2) return;
        const hasEtsy = settings.price_rules.some((r: PriceRule) => r.platform === 'etsy');
        const newPlatform = hasEtsy ? 'shopify' : 'etsy';
        const newRule: PriceRule = { platform: newPlatform, type: 'percentage', value: 0, rounding: 'none' };
        updateField('price_rules', [...settings.price_rules, newRule]);
    };

    const removeRule = (index: number) => {
        updateField('price_rules', settings.price_rules.filter((_: any, i: number) => i !== index));
    };

    const updateRule = (index: number, field: keyof PriceRule, value: any) => {
        const updated = settings.price_rules.map((rule: PriceRule, i: number) =>
            i === index ? { ...rule, [field]: value } : rule
        );
        updateField('price_rules', updated);
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Price Sync Rules" description="Configure automatic price adjustments between platforms" />


            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <SettingRow
                    label="Price Sync"
                    description="Automatically update prices on the target platform when the source price changes"
                >
                    <ToggleSwitch
                        enabled={settings.price_sync_enabled}
                        onChange={(v) => updateField('price_sync_enabled', v)}
                    />
                </SettingRow>
            </div>

            {settings.price_sync_enabled && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">Price Rules</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Define one rule per target platform (Max 2)</p>
                        </div>
                        {settings.price_rules.length < 2 && (
                            <button onClick={addRule} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                + Add Rule
                            </button>
                        )}
                    </div>

                    {settings.price_rules.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                            <DollarSign className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">No rules configured</p>
                            <button onClick={addRule} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-2">
                                + Create your first rule
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {settings.price_rules.map((rule: PriceRule, i: number) => (
                                <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-bold text-gray-400 uppercase">Rule {i + 1}</span>
                                        <div className="flex-1 h-px bg-gray-200" />
                                        <button onClick={() => removeRule(i)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <select
                                            value={rule.platform}
                                            onChange={(e) => updateRule(i, 'platform', e.target.value)}
                                            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white font-medium"
                                        >
                                            <option value="etsy" disabled={settings.price_rules.some((r: PriceRule, filterIndex: number) => r.platform === 'etsy' && filterIndex !== i)}>Etsy</option>
                                            <option value="shopify" disabled={settings.price_rules.some((r: PriceRule, filterIndex: number) => r.platform === 'shopify' && filterIndex !== i)}>Shopify</option>
                                        </select>

                                        <span className="text-sm text-gray-500">price =</span>

                                        <span className="text-sm font-medium text-gray-700">
                                            {rule.platform === 'etsy' ? 'Shopify' : 'Etsy'} price
                                        </span>

                                        <select
                                            value={rule.type}
                                            onChange={(e) => updateRule(i, 'type', e.target.value)}
                                            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                                        >
                                            <option value="percentage">+ Percentage (%)</option>
                                            <option value="fixed">+ Fixed Amount</option>
                                        </select>

                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={rule.value}
                                                onChange={(e) => updateRule(i, 'value', parseFloat(e.target.value) || 0)}
                                                className="w-20 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-400">{rule.type === 'percentage' ? '%' : '$'}</span>
                                        </div>

                                        <select
                                            value={rule.rounding}
                                            onChange={(e) => updateRule(i, 'rounding', e.target.value)}
                                            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                                        >
                                            <option value="none">No rounding</option>
                                            <option value="nearest_99">Round to .99</option>
                                            <option value="nearest_95">Round to .95</option>
                                            <option value="round_up">Round up</option>
                                        </select>
                                    </div>

                                    {/* Preview */}
                                    {rule.value > 0 && (
                                        <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg">
                                            <p className="text-xs text-blue-700">
                                                <strong>Example:</strong> If {rule.platform === 'etsy' ? 'Shopify' : 'Etsy'} price is $10.00 →
                                                {' '}{rule.platform === 'etsy' ? 'Etsy' : 'Shopify'} price will be{' '}
                                                <strong>
                                                    ${rule.type === 'percentage'
                                                        ? (10 * (1 + rule.value / 100)).toFixed(2)
                                                        : (10 + rule.value).toFixed(2)
                                                    }
                                                </strong>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Notifications Tab (simplified) ──────────

function NotificationsTab({ settings, updateField, notificationEmail, setNotificationEmail, setIsDirty }: {
    settings: ShopSettings; updateField: any; notificationEmail: string; setNotificationEmail: (v: string) => void; setIsDirty: (v: boolean) => void;
}) {
    const updateChannel = (key: keyof NotificationChannels, value: any) => {
        updateField('notification_channels', { ...settings.notification_channels, [key]: value });
    };

    const updateEvent = (key: keyof NotificationEvents, value: boolean) => {
        if (key === 'oversell_risk' && value && (!settings.low_stock_threshold || settings.low_stock_threshold < 1)) {
            updateField('low_stock_threshold', 5);
        }
        updateField('notification_events', { ...settings.notification_events, [key]: value });
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Notifications" description="Choose what events trigger alerts and where they are delivered" />

            {/* Channels */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">Notification Channels</h3>
                </div>
                <SettingRow label="In-App Notifications" description="Show alerts in the dashboard notification bell">
                    <ToggleSwitch enabled={settings.notification_channels.in_app} onChange={(v) => updateChannel('in_app', v)} />
                </SettingRow>
                <div>
                    <SettingRow label="Email Notifications" description="Send critical alerts to your email">
                        <ToggleSwitch enabled={settings.notification_channels.email} onChange={(v) => updateChannel('email', v)} />
                    </SettingRow>
                    {settings.notification_channels.email && (
                        <div className="px-6 pb-4 -mt-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Notification Email</label>
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-gray-400" />
                                <input
                                    type="email"
                                    value={notificationEmail}
                                    onChange={(e) => {
                                        setNotificationEmail(e.target.value);
                                        setIsDirty(true);
                                    }}
                                    placeholder="your@email.com"
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* Events */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">Alert Events</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Notifications are sent instantly when the selected event occurs</p>
                </div>
                <SettingRow label="Stock reaches zero" description="When any product runs out of stock">
                    <ToggleSwitch enabled={settings.notification_events.stock_zero} onChange={(v) => updateEvent('stock_zero', v)} />
                </SettingRow>
                <SettingRow label="Sync failed" description="When a stock sync operation fails">
                    <ToggleSwitch enabled={settings.notification_events.sync_failed} onChange={(v) => updateEvent('sync_failed', v)} />
                </SettingRow>
                <SettingRow label="Low stock alert" description="When stock drops below a threshold you set">
                    <div className="flex items-center gap-4">
                        {settings.notification_events.oversell_risk && (
                            <motion.div 
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-1.5"
                            >
                                <span className="text-xs text-gray-400">below</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={settings.low_stock_threshold || 5}
                                    onChange={(e) => updateField('low_stock_threshold', Math.max(1, parseInt(e.target.value) || 5))}
                                    className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-gray-50"
                                />
                                <span className="text-xs text-gray-400">units</span>
                            </motion.div>
                        )}
                        <ToggleSwitch enabled={settings.notification_events.oversell_risk} onChange={(v) => updateEvent('oversell_risk', v)} />
                    </div>
                </SettingRow>
            </div>
        </div>
    );
}

// ─── Billing Tab (with inline plan cards) ──

const PLAN_STYLE: Record<PlanId, { color: string; popular?: boolean }> = {
    starter: { color: 'from-blue-500 to-indigo-600' },
    growth: { color: 'from-violet-500 to-purple-600', popular: true },
    pro: { color: 'from-gray-800 to-gray-900' },
};

const PLAN_TIERS = PLAN_ORDER.map(id => ({
    ...PLAN_CONFIG[id],
    ...PLAN_STYLE[id],
}));

function BillingTab({ stores, productsCount = 0 }: { stores: any, productsCount?: number }) {
    const toast = useToast();
    const { user } = useAuth();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    const planType = stores.shopify?.plan_type || 'guest';
    const currentPlan = getPlanConfig(planType);
    const planLabel = currentPlan?.name || 'Free';
    const isPaid = !!currentPlan;
    const currentPlanId = currentPlan?.id || null;

    const handleSelectPlan = async (planId: string) => {
        if (planId === currentPlanId) return;
        setLoadingPlan(planId);
        try {
            const res = await fetch('/api/billing/create-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: planId,
                    user_id: user?.id || undefined,
                    shop_domain: stores.shopify?.domain || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create subscription');
            if (data.confirmationUrl) {
                const targetWindow = window.top || window;
                targetWindow.location.href = data.confirmationUrl;
            } else {
                throw new Error('No confirmation URL received');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to start billing.';
            toast.error(message);
        } finally {
            setLoadingPlan(null);
        }
    };

    const limit = currentPlan?.limits.matchedItems || 0;
    const widthPercent = limit === 0 ? 0 : Math.min(100, Math.round((productsCount / limit) * 100));

    return (
        <div className="space-y-4">
            <SectionHeader title="Billing & Plan" description="Manage your subscription and view usage" />

            {/* Current Plan Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        isPaid ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-gray-100'
                    }`}>
                        {isPaid ? (
                            <Star className="w-6 h-6 text-white" />
                        ) : (
                            <CreditCard className="w-6 h-6 text-gray-400" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{planLabel} Plan</h3>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                isPaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                                {isPaid ? 'Active' : 'Free Tier'}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {isPaid
                                ? 'Your subscription is managed through Shopify Billing.'
                                : 'Upgrade to unlock automatic synchronization and premium features.'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLAN_TIERS.map((plan) => {
                    const isCurrent = plan.id === currentPlanId;
                    const isLoading = loadingPlan === plan.id;

                    return (
                        <div
                            key={plan.id}
                            className={`relative bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md ${
                                isCurrent
                                    ? 'border-indigo-300 ring-2 ring-indigo-100'
                                    : plan.popular
                                        ? 'border-violet-200'
                                        : 'border-gray-200'
                            }`}
                        >
                            {plan.popular && !isCurrent && (
                                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                                    <span className="inline-block px-3 py-0.5 bg-violet-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-b-lg">
                                        Most Popular
                                    </span>
                                </div>
                            )}
                            {isCurrent && (
                                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                                    <span className="inline-block px-3 py-0.5 bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-b-lg">
                                        Current Plan
                                    </span>
                                </div>
                            )}

                            <div className="p-5 flex-1">
                                <div className="flex items-center gap-3 mb-3 mt-2">
                                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                                        <Star className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{plan.name}</h4>
                                        <p className="text-[11px] text-gray-500">{plan.description}</p>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <span className="text-2xl font-extrabold text-gray-900">${plan.price}</span>
                                    <span className="text-xs text-gray-400 ml-1">/month</span>
                                </div>

                                <ul className="space-y-1.5 mb-4">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="px-5 pb-5">
                                <button
                                    onClick={() => handleSelectPlan(plan.id)}
                                    disabled={isCurrent || !!loadingPlan}
                                    className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
                                        isCurrent
                                            ? 'bg-indigo-50 text-indigo-600 cursor-default'
                                            : plan.popular
                                                ? 'bg-gray-900 text-white hover:bg-gray-800'
                                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                    }`}
                                >
                                    {isLoading ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                                    ) : isCurrent ? (
                                        <><Check className="w-3.5 h-3.5" /> Current Plan</>
                                    ) : (
                                        <><ArrowRight className="w-3.5 h-3.5" /> {isPaid ? 'Switch Plan' : 'Get Started'}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Usage */}
            {isPaid && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Usage This Month</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm text-gray-600">Matched products</span>
                                <span className="text-sm font-medium text-gray-900">
                                    {`${productsCount} / ${limit}`}
                                </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                                <div 
                                    className={`h-2 rounded-full transition-all ${widthPercent > 90 ? 'bg-red-500' : widthPercent > 75 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                                    style={{ width: `${widthPercent}%` }} 
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <p className="text-xs text-gray-400 text-center">
                Secure payment powered by Shopify Billing. Cancel anytime from your Shopify admin.
            </p>
        </div>
    );
}

// ─── Advanced Tab ────────────────────────────

function AdvancedTab() {
    const toast = useToast();
    const router = useRouter();
    const [wiping, setWiping] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleWipeData = async () => {
        setShowConfirm(false);
        setWiping(true);
        try {
            const res = await wipeAllAppData();
            if (res.success) {
                toast.success('App data wiped successfully. Redirecting to import page...');
                // Redirect user to products page so they can re-import
                setTimeout(() => {
                    router.push('/dashboard/products');
                }, 1500);
            } else {
                toast.error(res.message);
                setWiping(false);
            }
        } catch (e: any) {
            toast.error(e.message);
            setWiping(false);
        }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Advanced" description="Danger zone — use with caution" />

            <div className="bg-white rounded-2xl border border-red-200 divide-y divide-red-100">
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900">Wipe All App Data</h3>
                        <p className="text-sm text-gray-500">Completely resets your testing data. Deletes all imported staging data, inventory items, and matches from the app. Use this to start fresh.</p>
                    </div>
                    <button 
                        onClick={() => setShowConfirm(true)}
                        disabled={wiping}
                        className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {wiping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {wiping ? 'Wiping Data...' : 'Wipe Data & Restart'}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showConfirm}
                variant="danger"
                title="Wipe All Application Data?"
                message="Are you strictly sure you want to wipe all application data? This will delete all imported products, inventory mappings, and staging data. Your actual Shopify and Etsy stores will NOT be affected."
                confirmLabel="Yes, Wipe Everything"
                cancelLabel="Cancel"
                onConfirm={handleWipeData}
                onCancel={() => setShowConfirm(false)}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════

function SectionHeader({ title, description }: { title: string; description?: string }) {
    return (
        <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
    );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
    );
}

function SelectBox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
        >
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}

function StoreCard({ name, icon, color, connected, domain, currency, onConnect, onDisconnect, adminUrl }: {
    name: string;
    icon: React.ReactNode;
    color: string;
    connected: boolean;
    domain: string | null;
    currency?: string;
    onConnect: () => void;
    onDisconnect: () => void;
    adminUrl?: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-5 w-full md:w-auto">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0"
                        style={{ backgroundColor: color }}
                    >
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-lg font-bold text-gray-900">{name}</h3>
                            {connected && (
                                <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-100 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Connected
                                    </span>
                                </div>
                            )}
                        </div>
                        {connected && (
                            <div className="flex items-center gap-3">
                                <p className="text-sm font-medium text-gray-500 truncate max-w-[200px]">{domain}</p>
                                {adminUrl && (
                                    <a
                                        href={adminUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>
                        )}
                        {!connected && <p className="text-sm text-gray-400">Not connected</p>}
                    </div>
                </div>

                {connected ? (
                    <div className="flex items-center gap-3">
                        {adminUrl && (
                            <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                                <ExternalLink className="w-5 h-5" />
                            </a>
                        )}
                        <button onClick={onDisconnect} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium text-sm transition-colors flex items-center gap-2">
                            <Unlink className="w-4 h-4" /> Disconnect
                        </button>
                    </div>
                ) : (
                    <button onClick={onConnect} className="px-5 py-2.5 text-white font-semibold rounded-xl flex items-center gap-2 transition-colors" style={{ backgroundColor: color }}>
                        Connect <ArrowUpRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

function ConnectModal({ show, onClose, platform, shopName, setShopName, onConnect }: {
    show: boolean; onClose: () => void; platform: 'shopify' | 'etsy';
    shopName: string; setShopName: (v: string) => void; onConnect: () => void;
}) {
    const isShopify = platform === 'shopify';
    const color = isShopify ? '#95BF47' : '#F56400';
    const Icon = isShopify ? ShoppingBag : Store;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: color }}>
                                <Icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Connect {isShopify ? 'Shopify' : 'Etsy'}</h3>
                                <p className="text-sm text-gray-500">Enter your {isShopify ? 'store' : 'shop'} name to continue</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {isShopify ? 'Store Name' : 'Shop Name'}
                                </label>
                                {isShopify ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text" value={shopName}
                                            onChange={(e) => setShopName(e.target.value)}
                                            placeholder="my-store"
                                            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                                            style={{ '--tw-ring-color': color } as any}
                                        />
                                        <span className="text-gray-400 text-sm">.myshopify.com</span>
                                    </div>
                                ) : (
                                    <input
                                        type="text" value={shopName}
                                        onChange={(e) => setShopName(e.target.value)}
                                        placeholder="YourEtsyShopName"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                                        style={{ '--tw-ring-color': color } as any}
                                    />
                                )}
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={onClose} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button onClick={onConnect} className="flex-1 py-3 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: color }}>
                                    Connect <ArrowUpRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
