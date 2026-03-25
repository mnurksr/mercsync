'use client';

import { useState, useEffect } from 'react';
import {
    Link2, Settings, Bell, DollarSign, MapPin, Shield,
    ShoppingBag, Store, Check, X, ExternalLink,
    ArrowUpRight, Unlink, Save, Loader2, ChevronRight,
    ToggleLeft, ToggleRight, CreditCard, Trash2
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ui/useToast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectedShop, disconnectShop, getShopifyLocations as fetchShopifyLocations } from '../../actions/shop';
import {
    getSettings, updateSettings,
    type ShopSettings, type SyncDirection, type ConflictStrategy,
    type SyncFrequency, type NotificationFrequency,
    type PriceRule, type NotificationChannels, type NotificationEvents
} from '../../actions/settings';

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
        shopify: { connected: false, name: null as string | null, domain: null as string | null },
        etsy: { connected: false, name: null as string | null, shopId: null as string | null }
    });

    // Settings state
    const [settings, setSettings] = useState<ShopSettings>({
        sync_direction: 'bidirectional',
        conflict_strategy: 'last_write_wins',
        auto_sync_enabled: false,
        sync_frequency: '6h',
        stock_buffer: 0,
        price_sync_enabled: false,
        price_rules: [],
        notification_channels: { in_app: true, email: false, slack_webhook_url: null },
        notification_events: { stock_zero: true, sync_failed: true, oversell_risk: true, new_order: false, token_expiring: true },
        notification_frequency: 'instant'
    });

    // Locations state
    const [locations, setLocations] = useState<{ id: string; name: string; active: boolean }[]>([]);

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
            const [shopify, etsy, savedSettings] = await Promise.all([
                getConnectedShop('shopify'),
                getConnectedShop('etsy'),
                getSettings()
            ]);

            setStores({
                shopify: { connected: shopify.connected, name: shopify.shop_domain, domain: shopify.shop_domain },
                etsy: { connected: etsy.connected, name: etsy.shop_domain, shopId: null }
            });

            setSettings(savedSettings);

            // Load locations if Shopify connected
            if (shopify.connected) {
                const locResult = await fetchShopifyLocations();
                if (locResult.success && locResult.data) {
                    setLocations(locResult.data.map((l: any) => ({
                        id: l.id?.toString(),
                        name: l.name,
                        active: l.active || false
                    })));
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
            const result = await updateSettings(settings);
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
                    [platform]: { connected: false, name: null, domain: null, shopId: null }
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

            {/* Save Bar (sticky) */}
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
                            shopName={shopName}
                            setShopName={setShopName}
                            showShopifyModal={showShopifyModal}
                            setShowShopifyModal={setShowShopifyModal}
                            showEtsyModal={showEtsyModal}
                            setShowEtsyModal={setShowEtsyModal}
                            handleConnectShopify={handleConnectShopify}
                            handleConnectEtsy={handleConnectEtsy}
                            onDisconnect={setDisconnectTarget}
                            user={user}
                        />
                    )}
                    {activeTab === 'sync' && (
                        <SyncTab settings={settings} updateField={updateField} />
                    )}
                    {activeTab === 'locations' && (
                        <LocationsTab locations={locations} />
                    )}
                    {activeTab === 'pricing' && (
                        <PricingTab settings={settings} updateField={updateField} />
                    )}
                    {activeTab === 'notifications' && (
                        <NotificationsTab settings={settings} updateField={updateField} />
                    )}
                    {activeTab === 'billing' && (
                        <BillingTab user={user} />
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

// ─── Connections Tab ─────────────────────────

function ConnectionsTab({ stores, shopName, setShopName, showShopifyModal, setShowShopifyModal, showEtsyModal, setShowEtsyModal, handleConnectShopify, handleConnectEtsy, onDisconnect, user }: any) {
    return (
        <div className="space-y-4">
            <SectionHeader title="Connected Stores" description="Manage your e-commerce platform connections" />

            {/* Shopify Card */}
            <StoreCard
                name="Shopify"
                icon={<ShoppingBag className="w-6 h-6 text-white" />}
                color="#95BF47"
                connected={stores.shopify.connected}
                domain={stores.shopify.domain}
                onConnect={() => { setShopName(''); setShowShopifyModal(true); }}
                onDisconnect={() => onDisconnect('shopify')}
                adminUrl={stores.shopify.domain ? `https://${stores.shopify.domain}/admin` : undefined}
            />

            {/* Etsy Card */}
            <StoreCard
                name="Etsy"
                icon={<Store className="w-6 h-6 text-white" />}
                color="#F56400"
                connected={stores.etsy.connected}
                domain={stores.etsy.name}
                onConnect={() => { setShopName(''); setShowEtsyModal(true); }}
                onDisconnect={() => onDisconnect('etsy')}
                adminUrl="https://www.etsy.com/your/shops/me"
            />

            {/* Account Section */}
            <SectionHeader title="Account" />
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold text-white">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">{user?.email || 'User'}</h3>
                            <p className="text-sm text-gray-500">Manage your account</p>
                        </div>
                    </div>
                    <Link
                        href="/billing"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors"
                    >
                        Manage Plan
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ─── Sync Settings Tab ───────────────────────

function SyncTab({ settings, updateField }: { settings: ShopSettings; updateField: any }) {
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

                {/* Conflict Resolution */}
                <SettingRow
                    label="Conflict Resolution"
                    description="What happens when both platforms change stock at the same time?"
                >
                    <SelectBox
                        value={settings.conflict_strategy}
                        onChange={(v) => updateField('conflict_strategy', v as ConflictStrategy)}
                        options={[
                            { value: 'last_write_wins', label: 'Last Write Wins' },
                            { value: 'shopify_wins', label: 'Shopify Always Wins' },
                            { value: 'etsy_wins', label: 'Etsy Always Wins' },
                            { value: 'manual_review', label: 'Manual Review' }
                        ]}
                    />
                </SettingRow>

                {/* Sync Frequency */}
                <SettingRow
                    label="Full Sync Frequency"
                    description="How often to perform a complete inventory reconciliation"
                >
                    <SelectBox
                        value={settings.sync_frequency}
                        onChange={(v) => updateField('sync_frequency', v as SyncFrequency)}
                        options={[
                            { value: '1h', label: 'Every 1 Hour' },
                            { value: '6h', label: 'Every 6 Hours' },
                            { value: '12h', label: 'Every 12 Hours' },
                            { value: '24h', label: 'Every 24 Hours' }
                        ]}
                    />
                </SettingRow>

                {/* Stock Buffer */}
                <SettingRow
                    label="Stock Buffer"
                    description="Safety buffer — deducts this amount from the stock shown on each platform to prevent overselling"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={settings.stock_buffer}
                            onChange={(e) => updateField('stock_buffer', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-400">units</span>
                    </div>
                </SettingRow>
            </div>
        </div>
    );
}

// ─── Locations Tab ───────────────────────────

function LocationsTab({ locations }: { locations: { id: string; name: string; active: boolean }[] }) {
    return (
        <div className="space-y-4">
            <SectionHeader title="Inventory Locations" description="Manage which Shopify locations contribute to your total stock" />

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                {locations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No locations found. Connect Shopify first.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {locations.map(loc => (
                            <div key={loc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    <div>
                                        <p className="font-medium text-gray-900 text-sm">{loc.name}</p>
                                        <p className="text-xs text-gray-400">ID: {loc.id}</p>
                                    </div>
                                </div>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${loc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {loc.active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-xs text-gray-400 mt-4">
                    Location management will be expanded in a future update. Currently, the primary location is set globally from the Inventory page.
                </p>
            </div>
        </div>
    );
}

// ─── Price Rules Tab ─────────────────────────

function PricingTab({ settings, updateField }: { settings: ShopSettings; updateField: any }) {
    const addRule = () => {
        const newRule: PriceRule = { platform: 'etsy', type: 'percentage', value: 0, rounding: 'none' };
        updateField('price_rules', [...settings.price_rules, newRule]);
    };

    const removeRule = (index: number) => {
        updateField('price_rules', settings.price_rules.filter((_, i) => i !== index));
    };

    const updateRule = (index: number, field: keyof PriceRule, value: any) => {
        const updated = settings.price_rules.map((rule, i) =>
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
                    description="Automatically update prices on the target platform when the source changes"
                >
                    <ToggleSwitch
                        enabled={settings.price_sync_enabled}
                        onChange={(v) => updateField('price_sync_enabled', v)}
                    />
                </SettingRow>
            </div>

            {settings.price_sync_enabled && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Price Rules</h3>
                        <button onClick={addRule} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                            + Add Rule
                        </button>
                    </div>

                    {settings.price_rules.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No rules configured. Click "Add Rule" to get started.</p>
                    ) : (
                        <div className="space-y-3">
                            {settings.price_rules.map((rule, i) => (
                                <div key={i} className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                                    <select
                                        value={rule.platform}
                                        onChange={(e) => updateRule(i, 'platform', e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    >
                                        <option value="etsy">Etsy price =</option>
                                        <option value="shopify">Shopify price =</option>
                                    </select>
                                    <span className="text-sm text-gray-500">Source price</span>
                                    <select
                                        value={rule.type}
                                        onChange={(e) => updateRule(i, 'type', e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    >
                                        <option value="percentage">+ %</option>
                                        <option value="fixed">+ $</option>
                                    </select>
                                    <input
                                        type="number"
                                        value={rule.value}
                                        onChange={(e) => updateRule(i, 'value', parseFloat(e.target.value) || 0)}
                                        className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right"
                                    />
                                    <select
                                        value={rule.rounding}
                                        onChange={(e) => updateRule(i, 'rounding', e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    >
                                        <option value="none">No rounding</option>
                                        <option value="nearest_99">.99</option>
                                        <option value="nearest_95">.95</option>
                                        <option value="round_up">Round Up</option>
                                    </select>
                                    <button onClick={() => removeRule(i)} className="p-1.5 text-red-400 hover:text-red-600">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Notifications Tab ───────────────────────

function NotificationsTab({ settings, updateField }: { settings: ShopSettings; updateField: any }) {
    const updateChannel = (key: keyof NotificationChannels, value: any) => {
        updateField('notification_channels', { ...settings.notification_channels, [key]: value });
    };

    const updateEvent = (key: keyof NotificationEvents, value: boolean) => {
        updateField('notification_events', { ...settings.notification_events, [key]: value });
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Notifications" description="Choose what events trigger alerts and where they're delivered" />

            {/* Channels */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">Notification Channels</h3>
                </div>
                <SettingRow label="In-App Notifications" description="Show alerts in the dashboard bell icon">
                    <ToggleSwitch enabled={settings.notification_channels.in_app} onChange={(v) => updateChannel('in_app', v)} />
                </SettingRow>
                <SettingRow label="Email Notifications" description="Send alerts to your account email">
                    <ToggleSwitch enabled={settings.notification_channels.email} onChange={(v) => updateChannel('email', v)} />
                </SettingRow>
                <SettingRow label="Slack / Discord Webhook" description="Send alerts to a Slack or Discord channel">
                    <input
                        type="url"
                        value={settings.notification_channels.slack_webhook_url || ''}
                        onChange={(e) => updateChannel('slack_webhook_url', e.target.value || null)}
                        placeholder="https://hooks.slack.com/..."
                        className="w-72 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </SettingRow>
            </div>

            {/* Events */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">Alert Events</h3>
                </div>
                <SettingRow label="Stock reaches zero" description="Alert when any product runs out of stock">
                    <ToggleSwitch enabled={settings.notification_events.stock_zero} onChange={(v) => updateEvent('stock_zero', v)} />
                </SettingRow>
                <SettingRow label="Sync failed" description="Alert when a stock sync operation fails">
                    <ToggleSwitch enabled={settings.notification_events.sync_failed} onChange={(v) => updateEvent('sync_failed', v)} />
                </SettingRow>
                <SettingRow label="Over-sell risk" description="Alert when stock levels are dangerously low">
                    <ToggleSwitch enabled={settings.notification_events.oversell_risk} onChange={(v) => updateEvent('oversell_risk', v)} />
                </SettingRow>
                <SettingRow label="New order" description="Alert when a new order comes in from any platform">
                    <ToggleSwitch enabled={settings.notification_events.new_order} onChange={(v) => updateEvent('new_order', v)} />
                </SettingRow>
                <SettingRow label="Token expiring" description="Alert when a platform connection is about to expire">
                    <ToggleSwitch enabled={settings.notification_events.token_expiring} onChange={(v) => updateEvent('token_expiring', v)} />
                </SettingRow>
            </div>

            {/* Frequency */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                <SettingRow label="Notification Frequency" description="How often to receive notification summaries">
                    <SelectBox
                        value={settings.notification_frequency}
                        onChange={(v) => updateField('notification_frequency', v as NotificationFrequency)}
                        options={[
                            { value: 'instant', label: 'Instant' },
                            { value: 'hourly', label: 'Hourly Digest' },
                            { value: 'daily', label: 'Daily Digest' }
                        ]}
                    />
                </SettingRow>
            </div>
        </div>
    );
}

// ─── Billing Tab ─────────────────────────────

function BillingTab({ user }: { user: any }) {
    return (
        <div className="space-y-4">
            <SectionHeader title="Billing & Plan" description="Manage your subscription and view usage" />

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900">Current Plan</h3>
                        <p className="text-sm text-gray-500 mt-1">Your plan details and usage will appear here once billing systems are active.</p>
                    </div>
                    <Link
                        href="/billing"
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors"
                    >
                        Manage Subscription
                    </Link>
                </div>

                {/* Quota placeholder */}
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Monthly Sync Operations</span>
                        <span className="text-sm font-medium text-gray-900">— / —</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '0%' }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Quota tracking will be available in Faz 5.</p>
                </div>
            </div>
        </div>
    );
}

// ─── Advanced Tab ────────────────────────────

function AdvancedTab() {
    return (
        <div className="space-y-4">
            <SectionHeader title="Advanced" description="Danger zone — use with caution" />

            <div className="bg-white rounded-2xl border border-red-200 divide-y divide-red-100">
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900">Clear Staging Data</h3>
                        <p className="text-sm text-gray-500">Remove all imported product data from staging tables. Your live products won't be affected.</p>
                    </div>
                    <button className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors">
                        Clear Data
                    </button>
                </div>
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900">Reset All Matches</h3>
                        <p className="text-sm text-gray-500">Remove all product matches between Shopify and Etsy. You'll need to re-match them.</p>
                    </div>
                    <button className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors">
                        Reset Matches
                    </button>
                </div>
            </div>
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

function StoreCard({ name, icon, color, connected, domain, onConnect, onDisconnect, adminUrl }: {
    name: string; icon: React.ReactNode; color: string; connected: boolean; domain: string | null;
    onConnect: () => void; onDisconnect: () => void; adminUrl?: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-all">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: color }}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{name}</h3>
                        {connected ? (
                            <>
                                <p className="text-sm text-gray-500">{domain}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                                    <span className="text-xs text-green-600 font-medium">Connected</span>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-400">Not connected</p>
                        )}
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
