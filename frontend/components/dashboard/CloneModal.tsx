'use client';

import React, { useState, useEffect } from 'react';
import {
    X, ShoppingBag, Store, ArrowRight, Package, Info, Check
} from 'lucide-react';

export type CrossListingVariant = {
    source_variant_id: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    selected?: boolean;
};

export type CrossListingItem = {
    source_id: string;
    target_id?: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    description?: string;
    image?: string;
    variants?: CrossListingVariant[];
    price_rule?: any; // Added for pricing engine
};

// Generic source data structure that can come from Staging or Products page
export type CloneSourceData = {
    title: string;
    platform: 'shopify' | 'etsy';
    sourceId: string;
    imageUrl?: string;
    sku?: string;
    price?: number;
    stock?: number;
    description?: string;
    variants: Array<{
        platformId: string;
        variantTitle: string;
        sku: string;
        price: number;
        stockQuantity: number;
    }>;
};

type CloneModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: CrossListingItem) => void;
    sourceData: CloneSourceData | null;
    targetPlatform: 'shopify' | 'etsy';
    initialData?: CrossListingItem;
    targetId?: string;
    pricingRules?: any[];
    shopCurrencies?: { shopify: string, etsy: string };
};

export default function CloneModal({
    isOpen,
    onClose,
    onConfirm,
    sourceData,
    targetPlatform,
    initialData,
    targetId,
    pricingRules
}: CloneModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        sku: '',
        price: 0,
        stock: 0,
        description: '',
        image: '',
        variants: [] as CrossListingVariant[],
        apply_pricing_rule: false,
        selected_rule: null as any
    });

    useEffect(() => {
        if (isOpen && sourceData) {
            const defaultRule = pricingRules?.find(r => r.platform === targetPlatform);
            
            // Build variants based on sourceData and potentially initialData
            const buildVariants = () => {
                return sourceData.variants.map(v => {
                    const existingData = initialData?.variants?.find((iv: any) => iv.source_variant_id === v.platformId);
                    if (existingData) {
                        return { ...existingData, selected: true };
                    }
                    return {
                        source_variant_id: v.platformId || '',
                        title: v.variantTitle || '',
                        sku: v.sku || '',
                        price: v.price ?? 0,
                        stock: v.stockQuantity ?? 0,
                        selected: initialData ? false : true // Default all selected for new clone, none for edit unless matched
                    };
                });
            };

            const initialVariants = buildVariants();
            const dataToSet = initialData ? {
                title: initialData.title,
                sku: initialData.sku || '',
                price: initialData.price,
                stock: initialData.stock,
                description: initialData.description || '',
                image: initialData.image || '',
                variants: initialVariants,
                apply_pricing_rule: !!initialData.price_rule,
                selected_rule: initialData.price_rule || defaultRule || null
            } : {
                title: sourceData.title || '',
                sku: sourceData.sku || '',
                price: sourceData.price || 0,
                stock: sourceData.stock || 0,
                description: sourceData.description || '',
                image: sourceData.imageUrl || '',
                variants: initialVariants,
                apply_pricing_rule: !!defaultRule,
                selected_rule: defaultRule || null
            };

            setFormData(dataToSet);
        }
    }, [isOpen, initialData, sourceData, pricingRules, targetPlatform]);

    const handleInputChange = (field: keyof typeof formData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleVariantChange = (index: number, field: keyof CrossListingVariant, value: string | number) => {
        setFormData(prev => {
            const newVariants = [...prev.variants];
            newVariants[index] = { ...newVariants[index], [field]: value };
            return { ...prev, variants: newVariants };
        });
    };

    const handleVariantToggle = (index: number) => {
        setFormData(prev => {
            const newVariants = [...prev.variants];
            newVariants[index] = { ...newVariants[index], selected: !newVariants[index].selected };
            return { ...prev, variants: newVariants };
        });
    };

    if (!isOpen || !sourceData) return null;

    const sourcePlatform = sourceData.platform;
    const SourceIcon = sourcePlatform === 'shopify' ? ShoppingBag : Store;
    const TargetIcon = targetPlatform === 'shopify' ? ShoppingBag : Store;
    const isEditing = !!initialData;

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg">{isEditing ? 'Edit Clone' : 'Clone Product'}</h3>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold capitalize">
                            <SourceIcon className="w-4 h-4" />
                            {sourcePlatform}
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/60" />
                        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold capitalize">
                            <TargetIcon className="w-4 h-4" />
                            {targetPlatform}
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    {/* Image Preview + Title */}
                    <div className="flex gap-4 items-start">
                        <div className="w-20 h-20 rounded-xl bg-gray-100/80 flex-shrink-0 overflow-hidden border-2 border-gray-200 shadow-sm">
                            {formData.image ? (
                                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <Package className="w-8 h-8" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Product Title</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={e => handleInputChange('title', e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                    </div>

                    {/* Image Info Note */}
                    <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700 leading-relaxed">
                            This is just a preview thumbnail. <span className="font-semibold">All images</span> from the source listing will be included in the clone automatically.
                        </p>
                    </div>

                    {/* Grid: Price, Stock, SKU */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Base Price</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">$</span>
                                <input
                                    type="number"
                                    value={formData.price}
                                    onChange={e => handleInputChange('price', parseFloat(e.target.value) || 0)}
                                    className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Stock</label>
                            <input
                                type="number"
                                value={formData.stock}
                                onChange={e => handleInputChange('stock', parseInt(e.target.value) || 0)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Base SKU</label>
                            <input
                                type="text"
                                value={formData.sku}
                                onChange={e => handleInputChange('sku', e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                            />
                        </div>
                    </div>

                    {/* Pricing Rule Integration */}
                    <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <Info className="w-4 h-4" />
                                </span>
                                <div>
                                    <h5 className="text-sm font-bold text-gray-900">Pricing Adjustments</h5>
                                    <p className="text-[10px] text-gray-500">Apply pricing rule for {targetPlatform === 'etsy' ? 'Etsy' : 'Shopify'}</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={formData.apply_pricing_rule}
                                    onChange={e => {
                                        const enabled = e.target.checked;
                                        const autoRule = pricingRules?.find(r => r.platform === targetPlatform) || null;
                                        setFormData(prev => ({ 
                                            ...prev, 
                                            apply_pricing_rule: enabled,
                                            selected_rule: enabled ? autoRule : null
                                        }));
                                    }}
                                    className="sr-only peer" 
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>

                        {formData.apply_pricing_rule && (
                            <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {formData.selected_rule ? (
                                    <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-sm space-y-1.5">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Active Rule</p>
                                        <p className="text-sm font-bold text-indigo-700">
                                            Source price {formData.selected_rule.type === 'percentage' ? `+ ${formData.selected_rule.value}%` : `+ $${formData.selected_rule.value}`}
                                            {formData.selected_rule.rounding && formData.selected_rule.rounding !== 'none' ? ` → ${formData.selected_rule.rounding}` : ''}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-amber-600 font-medium bg-amber-50 p-2 rounded-lg text-center">
                                        No pricing rule defined for {targetPlatform === 'etsy' ? 'Etsy' : 'Shopify'}. Add one via the Pricing Rules section above or in Settings.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
                        <textarea
                            rows={4}
                            value={formData.description}
                            onChange={e => handleInputChange('description', e.target.value)}
                            placeholder="Product description..."
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm"
                        />
                    </div>

                    {/* Variant Editor (If multiple) */}
                    {formData.variants.length > 1 && (
                        <div className="mt-4 border-t border-gray-100 pt-5">
                            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                Variants ({formData.variants.length})
                            </h4>
                            <div className="space-y-3">
                                {formData.variants.map((v, i) => (
                                    <div key={i} className={`grid grid-cols-12 gap-3 items-center p-3 rounded-xl border transition-all ${v.selected === false ? 'bg-gray-50/50 border-gray-100 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="col-span-12 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Variant Name</label>
                                            <input
                                                type="text"
                                                value={v.title}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'title', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">SKU</label>
                                            <input
                                                type="text"
                                                value={v.sku}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'sku', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Price</label>
                                            <input
                                                type="number"
                                                value={v.price}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'price', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Stock</label>
                                            <input
                                                type="number"
                                                value={v.stock}
                                                disabled={v.selected === false}
                                                onChange={e => handleVariantChange(i, 'stock', parseInt(e.target.value) || 0)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                        <div className="col-span-12 md:col-span-1 flex items-end justify-center pb-1">
                                            <button
                                                type="button"
                                                onClick={() => handleVariantToggle(i)}
                                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${v.selected !== false
                                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                                    : 'bg-white border text-gray-400 hover:text-indigo-600 hover:border-indigo-200'
                                                    }`}
                                                title={v.selected !== false ? "Include Variant" : "Exclude Variant"}
                                            >
                                                {v.selected !== false && <Check className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            const selectedVariants = formData.variants.filter(v => v.selected !== false);

                            onConfirm({
                                source_id: sourceData.sourceId,
                                target_id: targetId,
                                title: formData.title,
                                sku: formData.sku,
                                price: formData.price,
                                stock: formData.stock,
                                description: formData.description,
                                image: formData.image,
                                variants: selectedVariants,
                                price_rule: formData.apply_pricing_rule ? formData.selected_rule : null
                            });
                        }}
                        className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-200 text-sm flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        {isEditing ? 'Update' : 'Confirm Clone'}
                    </button>
                </div>
            </div>
        </div>
    );
}
