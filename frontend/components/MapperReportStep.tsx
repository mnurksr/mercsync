'use client';

import { motion } from 'framer-motion';
import { ShoppingBag, Store, AlertTriangle, CheckCircle, TrendingDown, Lightbulb, ChevronRight, AlertOctagon } from 'lucide-react';
import { useState } from 'react';

// --- Types based on User Request ---
export interface MapperAnalysisResponse {
    dashboard_metrics: {
        sync_score: number;
        total_lost_revenue_potential: number;
        health_level: number; // 1: Critical, 2: At Risk, 3: Good (assumed)
        level_label: string;
    };
    sync_level_comment: string;
    analysis: AnalysisItem[];
}

export interface AnalysisItem {
    pair_id: string;
    status: string;
    revenue_loss_impact: number;
    impact_comment: string;
    suggestion: string;
    details: {
        shopify: PlatformDetails;
        etsy: PlatformDetails;
    };
}

interface PlatformDetails {
    product_name: string;
    stock: number;
    price: string | number;
    image_url: string;
    sku_code: string;
}

// --- Helper Components ---

const CircularProgress = ({ score, colorClass }: { score: number, colorClass: string }) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    return (
        <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    cx="80" cy="80" r={radius}
                    stroke="currentColor" strokeWidth="12" fill="transparent"
                    className="text-gray-100"
                />
                <circle
                    cx="80" cy="80" r={radius}
                    stroke="currentColor" strokeWidth="12" fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`${colorClass} transition-all duration-1000 ease-out`}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className={`text-3xl font-bold ${colorClass}`}>{score.toFixed(1)}%</span>
                <span className="text-xs text-gray-500 font-medium">Sync Score</span>
            </div>
        </div>
    );
};

export default function MapperReportStep({ data, onRestart }: { data: MapperAnalysisResponse, onRestart: () => void }) {
    // Determine Theme based on Health Level
    // Level 1: Red (Critical), Level 2: Orange (At Risk), Level 3: Green (Healthy)
    const getTheme = (level: number) => {
        switch (level) {
            case 1: return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', shadow: 'shadow-red-100', icon: AlertOctagon };
            case 2: return { color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', shadow: 'shadow-orange-100', icon: AlertTriangle };
            default: return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', shadow: 'shadow-emerald-100', icon: CheckCircle };
        }
    };

    const theme = getTheme(data.dashboard_metrics.health_level);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 pb-20">

            {/* 1. Header Section: Welcome & Metrics */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
                {/* Welcome Box */}
                <div className={`col-span-1 md:col-span-2 ${theme.bg} rounded-3xl p-8 border ${theme.border} relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <theme.icon className={`w-32 h-32 ${theme.color}`} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold bg-white shadow-sm ${theme.color} uppercase tracking-wider`}>
                                {data.dashboard_metrics.level_label}
                            </span>
                            <h2 className={`text-2xl font-bold ${theme.color}`}>Analysis Complete</h2>
                        </div>
                        <p className="text-gray-700 font-medium leading-relaxed text-lg">
                            "{data.sync_level_comment}"
                        </p>
                    </div>
                </div>

                {/* Metrics Card */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="flex items-center justify-between w-full mb-6">
                        <CircularProgress score={data.dashboard_metrics.sync_score} colorClass={theme.color} />
                    </div>

                    <div className="w-full bg-red-50 rounded-2xl p-4 border border-red-100 text-center relative group">
                        <div className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-1">Potential Revenue At Risk</div>
                        <div className="text-3xl font-extrabold text-red-600 flex items-center justify-center gap-2">
                            ${data.dashboard_metrics.total_lost_revenue_potential.toLocaleString()}
                            <TrendingDown className="w-6 h-6" />
                        </div>
                        <div className="absolute inset-0 bg-red-100/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                    </div>
                </div>
            </motion.div>

            {/* 2. Analysis List */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-900 px-2 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-blue-500" />
                    AI Insights & Recommendations
                </h3>

                {data.analysis.map((item, index) => (
                    <AnalysisCard key={index} item={item} index={index} />
                ))}
            </div>

            {/* Action Footer */}
            <div className="flex justify-center pt-8">
                <button
                    onClick={onRestart}
                    className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                    Start New Mapping Session
                </button>
            </div>
        </div>
    );
}

function AnalysisCard({ item, index }: { item: AnalysisItem, index: number }) {
    const isCritical = item.revenue_loss_impact > 0;
    const { shopify, etsy } = item.details;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`
                bg-white rounded-2xl border p-1 shadow-sm overflow-hidden hover:shadow-md transition-shadow
                ${isCritical ? 'border-red-200' : 'border-gray-200'}
            `}
        >
            <div className="flex flex-col md:flex-row">

                {/* Product Image & Info */}
                <div className="p-4 flex gap-4 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50">
                    <div className="w-20 h-20 bg-white rounded-lg border border-gray-200 shrink-0 overflow-hidden">
                        <img src={shopify.image_url || etsy.image_url} alt="Product" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {isCritical ? (
                                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" /> Profit Leak: ${item.revenue_loss_impact.toLocaleString()}
                                </span>
                            ) : (
                                <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Healthy Sync
                                </span>
                            )}
                        </div>
                        <h4 className="text-sm font-bold text-gray-900 leading-tight mb-1 line-clamp-2" title={shopify.product_name || etsy.product_name}>
                            {shopify.product_name || etsy.product_name}
                        </h4>
                        <p className="text-xs text-gray-500 font-mono">{shopify.sku_code || etsy.sku_code || 'No SKU'}</p>
                        <p className="text-xs font-semibold text-gray-900 mt-1">${shopify.price}</p>
                    </div>
                </div>

                {/* Comparison & Insight */}
                <div className="p-4 flex-1 flex flex-col justify-between relative">

                    {/* Platforms Comparison */}
                    <div className="flex items-center gap-8 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                <ShoppingBag className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Shopify Stock</div>
                                <div className={`text-lg font-bold ${shopify.stock === 0 && isCritical ? 'text-red-500' : 'text-gray-900'}`}>
                                    {shopify.stock} units
                                </div>
                            </div>
                        </div>

                        <div className="w-px h-10 bg-gray-200"></div>

                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                                <Store className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Etsy Stock</div>
                                <div className="text-lg font-bold text-gray-900">
                                    {etsy.stock} units
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Assistant Balloon */}
                    <div className={`mt-auto relative bg-blue-50/50 rounded-xl p-3 border border-blue-100/50`}>
                        <div className="flex gap-3">
                            <div className="shrink-0 mt-1">
                                <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm">
                                    <Lightbulb className="w-3.5 h-3.5" />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                    {item.suggestion}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 leading-snug">
                                    {item.impact_comment}
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </motion.div>
    );
}
