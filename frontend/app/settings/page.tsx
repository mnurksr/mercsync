'use client';

import { useAuth } from '@/components/AuthProvider';
import { useEffect, useState } from 'react';
import { Save, CheckCircle, XCircle, RefreshCw, ExternalLink, Trash2 } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

interface ShopState {
    shopify_domain: string | null;
    etsy_connected: boolean;
    etsy_shop_id: string | null;
}

export default function IntegrationsPage() {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [shopData, setShopData] = useState<ShopState | null>(null);

    // Inputs
    const [shopifyDomainInput, setShopifyDomainInput] = useState('');

    useEffect(() => {
        if (!user) return;
        loadShopData();

        // Check URL params for success messages
        if (searchParams.get('etsy_connected')) alert('Etsy hesabı başarıyla bağlandı!');

    }, [user, searchParams]);

    const loadShopData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', user?.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching shop data:', error);
        }

        if (data) {
            setShopData(data);
            if (data.shop_domain) setShopifyDomainInput(data.shop_domain);
        }
        setLoading(false);
    };

    const handleConnect = (platform: string) => {
        // n8n Webhook Start URLs
        const BASE_WEBHOOK = 'https://n8n.erenmuhammedortakvps.store/webhook/auth';
        let authUrl = '';

        if (platform === 'shopify') {
            if (!shopifyDomainInput) return alert('Lütfen mağaza domainini girin!');
            const shop = shopifyDomainInput.replace('https://', '').replace('.myshopify.com', '').replace(/\/$/, '');
            authUrl = `${BASE_WEBHOOK}/shopify/start?user_id=${user?.id}&shop=${shop}.myshopify.com`;
        } else if (platform === 'etsy') {
            authUrl = `${BASE_WEBHOOK}/etsy/start?user_id=${user?.id}`;
        }

        window.location.href = authUrl;
    };

    const handleDisconnect = async (platform: string) => {
        if (!confirm(`${platform} bağlantısını kesmek istediğinize emin misiniz?`)) return;

        const updates: any = {};
        if (platform === 'shopify') {
            // Shopify için genelde kaydı silmeyiz ama token'ı sıfırlarız
            updates.access_token = null;
            updates.is_active = false;
        } else if (platform === 'etsy') {
            updates.etsy_connected = false;
            updates.etsy_access_token = null;
            updates.etsy_refresh_token = null;
        }

        const { error } = await supabase.from('shops').update(updates).eq('owner_id', user?.id);

        if (error) {
            alert('Hata oluştu: ' + error.message);
        } else {
            alert('Bağlantı kesildi.');
            loadShopData();
        }
    };

    if (loading) return <div className="p-10 text-center">Yükleniyor...</div>;

    const IntegrationsCard = ({
        platform,
        name,
        description,
        isConnected,
        iconColor,
        iconLetter,
        borderColor
    }: any) => (
        <div className={`bg-white p-6 rounded-xl border ${borderColor} shadow-sm relative overflow-hidden transition-all hover:shadow-md`}>
            {isConnected && (
                <div className="absolute top-4 right-4 text-green-500">
                    <CheckCircle size={24} />
                </div>
            )}
            <div className="flex items-center gap-3 mb-4">
                <span className={`w-12 h-12 rounded-lg ${iconColor} flex items-center justify-center font-bold text-xl`}>
                    {iconLetter}
                </span>
                <div>
                    <h2 className="text-xl font-bold text-gray-800">{name}</h2>
                    <p className="text-sm text-gray-500">{description}</p>
                </div>
            </div>

            <div className="mt-4">
                {platform === 'shopify' && !isConnected && (
                    <input
                        type="text"
                        value={shopifyDomainInput}
                        onChange={e => setShopifyDomainInput(e.target.value)}
                        className="w-full bg-gray-50 border rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="my-store.myshopify.com"
                    />
                )}

                {isConnected ? (
                    <div className="flex gap-2">
                        <button disabled className="flex-1 bg-green-50 text-green-700 font-semibold py-2 rounded-md cursor-default border border-green-200">
                            Bağlandı
                        </button>
                        <button
                            onClick={() => handleDisconnect(platform)}
                            className="bg-red-50 text-red-600 p-2 rounded-md hover:bg-red-100 border border-red-200"
                            title="Bağlantıyı Kes"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => handleConnect(platform)}
                        className={`w-full text-white font-bold py-2 rounded-md transition-colors ${platform === 'shopify' ? 'bg-green-600 hover:bg-green-700' :
                                'bg-orange-600 hover:bg-orange-700'
                            }`}
                    >
                        {platform === 'shopify' ? 'Mağazayı Bağla' : `${name} Bağla`}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-2 text-gray-800">Entegrasyonlar</h1>
            <p className="text-gray-500 mb-8">Sadece Shopify ve Etsy mağazalarınızı bağlayarak ürün ve siparişlerinizi tek yerden yönetin.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <IntegrationsCard
                    platform="shopify"
                    name="Shopify"
                    description="Resmi Mağaza Bağlantısı"
                    isConnected={!!shopData?.shopify_domain && !!shopData?.shopify_domain /* basic check */} // is_active check handled in query if needed
                    iconColor="bg-green-100 text-green-600"
                    iconLetter="S"
                    borderColor="border-green-200"
                />

                <IntegrationsCard
                    platform="etsy"
                    name="Etsy"
                    description="El Emeği & Vintage"
                    isConnected={shopData?.etsy_connected}
                    iconColor="bg-orange-100 text-orange-600"
                    iconLetter="E"
                    borderColor="border-orange-200"
                />
            </div>
        </div>
    );
}
