'use client';

import { motion } from 'framer-motion';
import { ShoppingBag, Store, AlertTriangle, TrendingDown, Lightbulb, Activity, Zap, ShieldAlert } from 'lucide-react';

// --- New Types based on User Request ---
export interface MapperAnalysisResponse {
    dashboard_metrics: {
        sync_score: number;
        total_oversell_risk: number;
        max_possible_risk: number;
        products_at_risk: number;
        health_level: number; // 1: Critical
        level_label: string;
        ai_comment: string;
    };
    analysis: AnalysisItem[];
}

export interface AnalysisItem {
    pair_id: string;
    status: string;
    actual_stock: number;
    shopify_stock: number;
    etsy_stock: number;
    shopify_oversell_units: number;
    etsy_oversell_units: number;
    shopify_loss_risk: number;
    etsy_loss_risk: number;
    total_loss_risk: number;
    severity: number;
    shopify_price: number;
    etsy_price: number;
    details: {
        pair_id: string;
        shopify: PlatformDetails;
        etsy: PlatformDetails;
    };
    quick_action: string;
}

interface PlatformDetails {
    product_name: string;
    stock: number;
    price: string | number;
    image_url: string;
    sku_code: string;
}

export default function MapperReportStep({ data, onRestart }: { data: MapperAnalysisResponse, onRestart: () => void }) {
    const { dashboard_metrics, analysis } = data;
    const isCritical = dashboard_metrics.health_level === 1;

    return (
        <div className="w-full max-w-6xl mx-auto space-y-10 pb-20">

            {/* 1. AI Summary: Strateji Notu */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-gray-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl border border-gray-700 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Activity className="w-40 h-40 text-white" />
                </div>
                <div className="relative z-10 flex items-start gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl border border-blue-400/30">
                        <Lightbulb className="w-6 h-6 text-blue-300" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-blue-300 uppercase tracking-widest mb-1">
                            STRATEJİ NOTU
                        </h3>
                        <p className="text-xl font-medium leading-relaxed text-gray-100">
                            "{dashboard_metrics.ai_comment}"
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* 2. Risk Sayacı: Inventory Crisis Manager Header */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center justify-center py-8 text-center"
            >
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-red-100 text-red-700 border border-red-200 text-sm font-bold animate-pulse">
                    <ShieldAlert className="w-4 h-4" />
                    INVENTORY CRISIS DETECTED
                </div>

                <h2 className="text-7xl font-black text-gray-900 tracking-tighter mb-2 flex items-center gap-4">
                    <span className="text-red-600">${dashboard_metrics.total_oversell_risk.toLocaleString()}</span>
                </h2>
                <div className="text-gray-400 text-sm font-medium uppercase tracking-[0.2em] mb-4">Total Oversell Risk</div>

                <div className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold text-lg shadow-lg shadow-red-200">
                    Durum: Kritik
                </div>
            </motion.div>

            {/* 3. Ürün Kartları: Risk Analysis */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        Action Required
                        <span className="bg-gray-100 text-gray-600 text-sm py-1 px-3 rounded-full">{analysis.length} Items</span>
                    </h3>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {analysis.map((item, index) => (
                        <RiskCard key={index} item={item} index={index} />
                    ))}
                </div>
            </div>

            {/* Footer Action */}
            <div className="flex justify-center pt-12">
                <button
                    onClick={onRestart}
                    className="px-8 py-3 bg-white border-2 border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                >
                    Back to Dashboard
                </button>
            </div>
        </div>
    );
}

function RiskCard({ item, index }: { item: AnalysisItem, index: number }) {
    const { shopify, etsy } = item.details;
    const isCritical = item.status.includes('critical') || item.severity > 50;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`
                bg-white rounded-3xl border-2 p-1 overflow-hidden shadow-sm hover:shadow-xl transition-all group
                ${isCritical ? 'border-red-100 hover:border-red-300' : 'border-gray-100'}
            `}
        >
            <div className="flex flex-col md:flex-row h-full">

                {/* Left: Product Info */}
                <div className="p-6 md:w-1/4 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden shadow-sm">
                        <img src={shopify.image_url || etsy.image_url} alt="Product" className="w-full h-full object-cover" />
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm leading-tight mb-2 line-clamp-2">
                        {shopify.product_name || etsy.product_name}
                    </h4>
                    <span className="text-xs font-mono text-gray-400">{shopify.sku_code || 'NO-SKU'}</span>
                </div>

                {/* Center: Inventory Comparison */}
                <div className="flex-1 p-6 flex flex-col justify-center">
                    <div className="flex items-center justify-around gap-4 mb-6 relative">
                        {/* Connecting Line */}
                        <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-gray-100 -z-10"></div>

                        {/* Shopify Node */}
                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm text-center min-w-[120px]">
                            <div className="flex items-center justify-center gap-2 text-emerald-600 mb-2">
                                <ShoppingBag className="w-5 h-5" />
                                <span className="text-xs font-bold uppercase">Shopify</span>
                            </div>
                            <div className={`text-3xl font-black ${item.shopify_oversell_units > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                                {shopify.stock}
                            </div>
                            <div className="text-[10px] text-gray-400 font-medium mt-1">Stok</div>
                        </div>

                        {/* Etsy Node */}
                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm text-center min-w-[120px]">
                            <div className="flex items-center justify-center gap-2 text-orange-600 mb-2">
                                <Store className="w-5 h-5" />
                                <span className="text-xs font-bold uppercase">Etsy</span>
                            </div>
                            <div className="text-3xl font-black text-gray-900">
                                {etsy.stock}
                            </div>
                            <div className="text-[10px] text-gray-400 font-medium mt-1">Stok</div>
                        </div>
                    </div>

                    {/* Risk Highlight */}
                    {item.shopify_oversell_units > 0 && (
                        <div className="bg-red-50 rounded-xl p-3 border border-red-100 flex items-center justify-center gap-2 text-red-700 font-medium text-sm animate-pulse">
                            <TrendingDown className="w-4 h-4" />
                            <span>Fazladan Satış Riski: <b>{item.shopify_oversell_units} Adet</b> ({item.shopify_loss_risk > 0 ? `$${item.shopify_loss_risk.toLocaleString()} Risk` : 'High Risk'})</span>
                        </div>
                    )}
                </div>

                {/* Right: Action Center */}
                <div className="p-6 md:w-1/4 bg-gray-900 text-white flex flex-col justify-center items-center text-center relative overflow-hidden">
                    <div className="relative z-10 w-full">
                        <div className="mb-4">
                            <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Recommended Action</div>
                            <div className="text-sm font-medium text-gray-300 leading-snug">
                                Sync inventory to prevent overselling
                            </div>
                        </div>

                        <button className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2 transition-all active:scale-95 group-hover:scale-105">
                            <Zap className="w-4 h-4 fill-white" />
                            <span className="truncate">{item.quick_action}</span>
                        </button>
                    </div>

                    {/* Background decoration */}
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl"></div>
                </div>

            </div>
        </motion.div>
    );
}
