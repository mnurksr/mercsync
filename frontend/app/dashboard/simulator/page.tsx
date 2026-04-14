'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/ui/useToast';
import { Loader2, Plus, Trash2, Send, Beaker } from 'lucide-react';

export default function SimulatorPage() {
    const { supabase, user } = useAuth();
    const toast = useToast();

    const [shops, setShops] = useState<{id: string, shop_domain: string}[]>([]);
    const [selectedShopId, setSelectedShopId] = useState('');
    const [receiptId, setReceiptId] = useState('999999999');
    const [transactions, setTransactions] = useState([{ listing_id: '', quantity: 1 }]);
    
    const [isSimulating, setIsSimulating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        if (user) loadShops();
    }, [user]);

    const loadShops = async () => {
        const { data } = await supabase.from('shops').select('id, shop_domain').eq('owner_id', user?.id || '');
        if (data) {
            setShops(data);
            if (data.length > 0) setSelectedShopId(data[0].id);
        }
    };

    const runSimulation = async () => {
        if (!selectedShopId) return toast.warning('Bir mağaza seçin.');
        if (transactions.some(t => !t.listing_id || t.quantity < 1)) return toast.warning('Geçerli bir Listing ID ve adet girin.');

        setIsSimulating(true);
        setLogs(['Sanal Sipariş apiye gönderiliyor...']);

        try {
            const res = await fetch('/api/dev/simulate-etsy-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop_id: selectedShopId,
                    receipt_id: receiptId || Date.now(),
                    transactions
                })
            });

            const result = await res.json();
            
            if (result.success) {
                setLogs(prev => [...prev, ...result.logs]);
                toast.success('Simülasyon Tamamlandı!');
            } else {
                setLogs(prev => [...prev, `❌ Hata: ${result.error}`]);
                toast.error('Hata oluştu');
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ İstek Hatası: ${err.message}`]);
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-indigo-100 rounded-xl">
                        <Beaker className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Etsy Sipariş Simülatörü (Test Aracı)</h2>
                        <p className="text-sm text-gray-500">Bu araç, gerçek ödeme almadan sanki Etsy üzerinden sipariş gelmiş gibi arka plandaki "Cascade Stok Düşme" kodlarını test etmenizi sağlar.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mağaza</label>
                        <select 
                            value={selectedShopId} 
                            onChange={e => setSelectedShopId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                        >
                            {shops.length === 0 ? <option disabled value="">Yükleniyor...</option> : null}
                            {shops.map(s => <option key={s.id} value={s.id}>{s.shop_domain}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fake Receipt ID (Fatura No)</label>
                        <input 
                            type="text" 
                            value={receiptId} 
                            onChange={e => setReceiptId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                </div>

                <div className="space-y-3 mb-6">
                    <label className="block text-sm font-medium text-gray-700">İçinde Geçecek Ürünler (Sepet)</label>
                    {transactions.map((tx, i) => (
                        <div key={i} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Etsy Listing ID</label>
                                <input 
                                    type="text" 
                                    placeholder="Örn: 1530743840"
                                    value={tx.listing_id}
                                    onChange={e => {
                                        const newTx = [...transactions];
                                        newTx[i].listing_id = e.target.value;
                                        setTransactions(newTx);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div className="w-32">
                                <label className="block text-xs text-gray-500 mb-1">Düşülecek Adet</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={tx.quantity}
                                    onChange={e => {
                                        const newTx = [...transactions];
                                        newTx[i].quantity = Number(e.target.value);
                                        setTransactions(newTx);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <button 
                                onClick={() => setTransactions(transactions.filter((_, idx) => idx !== i))}
                                disabled={transactions.length === 1}
                                className="mt-4 p-2 text-red-500 disabled:opacity-30 hover:bg-red-50 rounded-lg"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                    
                    <button 
                        onClick={() => setTransactions([...transactions, { listing_id: '', quantity: 1 }])}
                        className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700"
                    >
                        <Plus className="w-4 h-4" /> Yeni Ürün Ekle
                    </button>
                </div>

                <button
                    onClick={runSimulation}
                    disabled={isSimulating}
                    className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-75 transition-colors"
                >
                    {isSimulating ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                    Siparişi Simüle Et ve Shopify Stoğunu Düş
                </button>
            </div>

            {/* Terminal / Logs Output */}
            {logs.length > 0 && (
                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 overflow-hidden">
                    <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2 mb-4">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Test Çıktısı (Logs)
                    </h3>
                    <div className="space-y-2 font-mono text-sm">
                        {logs.map((log, idx) => (
                            <p key={idx} className={`${
                                log.includes('✅') ? 'text-green-400' :
                                log.includes('❌') ? 'text-red-400' :
                                log.includes('⚠️') ? 'text-yellow-400' :
                                'text-gray-300'
                            }`}>
                                {log}
                            </p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
