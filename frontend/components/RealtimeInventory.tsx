'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { RefreshCw, Package, MapPin, Globe } from 'lucide-react';

interface InventoryLevel {
    id: string;
    inventory_item_id: string;
    location_id: string;
    market_iso: string;
    available_stock: number;
    reserved_stock: number;
    updated_at: string;
}

export default function RealtimeInventory() {
    const [levels, setLevels] = useState<InventoryLevel[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);

    const fetchLevels = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('inventory_levels')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(20);

        if (data) setLevels(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchLevels();

        const channel = supabase
            .channel('realtime_inventory')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'inventory_levels',
                },
                (payload) => {
                    console.log('Change received!', payload);
                    setLastUpdate(new Date().toLocaleTimeString());

                    if (payload.eventType === 'INSERT') {
                        setLevels((prev) => [payload.new as InventoryLevel, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        setLevels((prev) => prev.map(item => item.id === (payload.new as InventoryLevel).id ? (payload.new as InventoryLevel) : item));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    Canlı Stok İzleme (Realtime)
                </h2>
                <div className="flex items-center gap-3">
                    {lastUpdate && (
                        <span className="text-sm text-green-600 font-medium animate-pulse">
                            Güncellendi: {lastUpdate}
                        </span>
                    )}
                    <button
                        onClick={fetchLevels}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase">
                        <tr>
                            <th className="px-4 py-3 font-medium">Item ID</th>
                            <th className="px-4 py-3 font-medium flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</th>
                            <th className="px-4 py-3 font-medium flex items-center gap-1"><Globe className="w-3 h-3" /> Market</th>
                            <th className="px-4 py-3 font-medium text-right">Available</th>
                            <th className="px-4 py-3 font-medium text-right">Reserved</th>
                            <th className="px-4 py-3 font-medium text-right">Updated</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {levels.map((level) => (
                            <tr key={level.id} className="hover:bg-blue-50/50 transition-colors group">
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{level.inventory_item_id.slice(0, 8)}...</td>
                                <td className="px-4 py-3 text-gray-700">{level.location_id.slice(0, 8)}...</td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                        {level.market_iso}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900">{level.available_stock}</td>
                                <td className="px-4 py-3 text-right font-medium text-orange-600">{level.reserved_stock}</td>
                                <td className="px-4 py-3 text-right text-gray-400 text-xs">
                                    {new Date(level.updated_at).toLocaleTimeString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {levels.length === 0 && !loading && (
                    <div className="text-center py-8 text-gray-400">Veri bulunamadı.</div>
                )}
            </div>
        </div>
    );
}
