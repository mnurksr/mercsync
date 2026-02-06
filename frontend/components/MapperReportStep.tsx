'use client';

import { motion, Variants } from 'framer-motion';
import { ShoppingBag, Store, AlertTriangle, TrendingDown, Lightbulb, Activity, Zap, ShieldAlert, ArrowRight } from 'lucide-react';

// --- Types based on User Request ---
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

    // Animation Variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="w-full max-w-7xl mx-auto space-y-12 pb-24 px-4"
        >

            {/* 1. AI Summary: Strategy Note (Futuristic Card) */}
            <motion.div
                variants={itemVariants}
                className="bg-gradient-to-br from-slate-900 via-slate-800 to-black rounded-3xl p-8 text-white shadow-2xl border border-slate-700/50 relative overflow-hidden group"
            >
                {/* Background Pulse Animation */}
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-1000">
                    <Activity className="w-64 h-64 text-white" />
                </div>
                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-colors duration-700"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg shrink-0">
                        <Lightbulb className="w-8 h-8 text-yellow-300 fill-yellow-300/20" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-blue-300 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                            AI Strategy Note
                        </h3>
                        <p className="text-2xl font-light leading-relaxed text-slate-100 tracking-wide">
                            "{dashboard_metrics.ai_comment}"
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* 2. Risk Counter: Inventory Crisis Manager Header */}
            <motion.div
                variants={itemVariants}
                className="flex flex-col items-center justify-center py-4 text-center relative"
            >
                <div className="inline-flex items-center gap-2 mb-6 px-5 py-2 rounded-full bg-red-50 text-red-600 border border-red-100 text-xs font-black uppercase tracking-widest shadow-sm">
                    <ShieldAlert className="w-4 h-4" />
                    Inventory Crisis Detected
                </div>

                <h2 className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-gray-900 to-gray-700 tracking-tighter mb-2 flex items-center justify-center gap-4 filter drop-shadow-sm">
                    <span className="text-red-600">${dashboard_metrics.total_oversell_risk.toLocaleString()}</span>
                </h2>
                <div className="text-gray-400 text-sm font-bold uppercase tracking-[0.3em] mb-6">Total Oversell Risk Exposure</div>

                <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-xl shadow-red-600/30 flex items-center gap-2"
                >
                    <AlertTriangle className="w-5 h-5 fill-white" />
                    Status: Critical
                </motion.div>
            </motion.div>

            {/* 3. Product Cards: Risk Analysis */}
            <div className="space-y-8">
                <motion.div variants={itemVariants} className="flex items-center justify-between px-2 border-b border-gray-100 pb-4">
                    <h3 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        Action Required
                        <span className="bg-gray-900 text-white text-base py-1 px-4 rounded-full font-medium">{analysis.length} Items</span>
                    </h3>
                </motion.div>

                <div className="grid grid-cols-1 gap-8">
                    {analysis.map((item, index) => (
                        <RiskCard key={index} item={item} />
                    ))}
                </div>
            </div>

            {/* Footer Action */}
            <motion.div variants={itemVariants} className="flex justify-center pt-8">
                <button
                    onClick={onRestart}
                    className="px-10 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                >
                    Return to Dashboard
                </button>
            </motion.div>
        </motion.div>
    );
}

function RiskCard({ item }: { item: AnalysisItem }) {
    const { shopify, etsy } = item.details;
    const isCritical = item.status.includes('critical') || item.severity > 50;

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0 }
            }}
            whileHover={{ y: -5 }}
            className={`
                bg-white rounded-[2rem] border overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 group
                ${isCritical ? 'border-red-100 shadow-red-50' : 'border-gray-100'}
            `}
        >
            <div className="flex flex-col xl:flex-row h-full">

                {/* Left: Product Info (Shopify) */}
                <div className="p-8 xl:w-[28%] bg-white border-b xl:border-b-0 xl:border-r border-gray-100 flex flex-col md:flex-row xl:flex-col items-center xl:items-start text-center xl:text-left gap-6 hover:bg-gray-50/50 transition-colors">
                    <div className="w-32 h-32 xl:w-full xl:h-48 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-inner shrink-0 relative group-hover:scale-[1.02] transition-transform duration-500">
                        <img src={shopify.image_url} alt="Shopify Product" className="w-full h-full object-cover" />
                        <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" /> Shopify
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 text-lg leading-tight mb-2">
                            {shopify.product_name}
                        </h4>
                        <div className="flex flex-wrap gap-2 justify-center xl:justify-start">
                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                                {shopify.sku_code || 'NO-SKU'}
                            </span>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                ${shopify.price}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Center: Inventory Comparison */}
                <div className="flex-1 p-8 flex flex-col justify-center bg-gradient-to-b from-white to-gray-50/30">
                    <div className="flex items-center justify-center md:justify-around gap-8 mb-8 relative">
                        {/* Connecting Line */}
                        <div className="hidden md:block absolute top-1/2 left-20 right-20 h-0.5 bg-gray-200 -z-10 bg-gradient-to-r from-emerald-100 via-gray-300 to-orange-100"></div>

                        {/* Shopify Node */}
                        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-xl shadow-emerald-50 text-center min-w-[140px] relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-white">
                                Current
                            </div>
                            <div className="text-emerald-600 mb-2">
                                <ShoppingBag className="w-8 h-8 mx-auto" />
                            </div>
                            <div className={`text-5xl font-black ${item.shopify_oversell_units > 0 ? 'text-red-500' : 'text-gray-900'} tracking-tighter`}>
                                {shopify.stock}
                            </div>
                            <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Stock</div>
                        </div>

                        {/* Conflict Icon */}
                        <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center border border-red-100 z-10 shadow-sm animate-pulse-slow">
                            <ArrowRight className="w-5 h-5 text-red-400" />
                        </div>

                        {/* Etsy Node */}
                        <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-xl shadow-orange-50 text-center min-w-[140px] relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-100 text-orange-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-white">
                                Actual
                            </div>
                            <div className="text-orange-600 mb-2">
                                <Store className="w-8 h-8 mx-auto" />
                            </div>
                            <div className="text-5xl font-black text-gray-900 tracking-tighter">
                                {etsy.stock}
                            </div>
                            <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Stock</div>
                        </div>
                    </div>

                    {/* Risk Highlight */}
                    {item.shopify_oversell_units > 0 && (
                        <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex flex-col md:flex-row items-center justify-center gap-3 text-red-800 shadow-sm mx-auto max-w-lg">
                            <div className="p-2 bg-red-100 rounded-lg shrink-0">
                                <TrendingDown className="w-5 h-5 text-red-600" />
                            </div>
                            <div className="text-center md:text-left">
                                <div className="text-xs uppercase font-bold text-red-400 tracking-wider mb-0.5">Oversell Risk Analysis</div>
                                <div className="font-semibold text-lg">
                                    <span className="font-black text-red-600">{item.shopify_oversell_units} Units</span> Excess
                                    <span className="mx-2 text-red-300">|</span>
                                    <span className="font-black text-red-600">${item.shopify_loss_risk.toLocaleString()}</span> Potential Loss
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Target Context (Etsy) - Symmetrical Light Theme */}
                <div className="p-8 xl:w-[28%] bg-white border-t xl:border-t-0 xl:border-l border-gray-100 flex flex-col items-center xl:items-start text-center xl:text-left gap-6 hover:bg-gray-50/50 transition-colors">
                    <div className="w-32 h-32 xl:w-full xl:h-48 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-inner shrink-0 relative group-hover:scale-[1.02] transition-transform duration-500 order-1">
                        <img src={etsy.image_url} alt="Etsy Product" className="w-full h-full object-cover" />
                        <div className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
                            <Store className="w-3 h-3" /> Etsy (Target)
                        </div>
                    </div>

                    <div className="order-2 w-full">
                        <h4 className="font-bold text-gray-900 text-lg leading-tight mb-2">
                            {etsy.product_name}
                        </h4>
                        <div className="flex flex-wrap gap-2 justify-center xl:justify-start mb-4">
                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                                {etsy.sku_code || 'NO-SKU'}
                            </span>
                            <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-md border border-orange-100">
                                ${etsy.price}
                            </span>
                        </div>

                        {/* Recommendation Alert Box (Replaces Button) */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-left w-full relative overflow-hidden group/alert">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                            <div className="flex items-start gap-3">
                                <div className="p-1.5 bg-blue-100 rounded-full shrink-0 text-blue-600 mt-0.5">
                                    <Zap className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Recommendation</div>
                                    <div className="text-sm font-bold text-blue-900 leading-snug">
                                        {item.quick_action}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </motion.div>
    );
}
