'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
    X, Link2, Unlink, Search, Check, Package,
    ArrowRight, Loader2, AlertTriangle, ChevronDown
} from 'lucide-react'
import { unmatchProduct, matchProducts, getUnmatchedProducts } from '@/app/actions/matching'
import type { ListingItem } from '@/app/actions/inventory'
import { EtsyIcon, ShopifyIcon } from '@/components/PlatformIcons'

type MatchModalProps = {
    isOpen: boolean
    onClose: () => void
    product: ListingItem | null
    platform: 'shopify' | 'etsy'
    onMatchUpdated: () => void
}

export default function MatchModal({ isOpen, onClose, product, platform, onMatchUpdated }: MatchModalProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [unmatchedItems, setUnmatchedItems] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
    const [result, setResult] = useState<{ success: boolean; message: string; variantMatches?: any[] } | null>(null)
    const [showConfirmUnmatch, setShowConfirmUnmatch] = useState(false)

    const oppositePlatform = platform === 'shopify' ? 'etsy' : 'shopify'
    const isMatched = product?.matchStatus === 'synced'

    useEffect(() => {
        if (isOpen && product && !isMatched) {
            loadUnmatchedItems()
        }
        if (!isOpen) {
            setSearchQuery('')
            setSelectedTarget(null)
            setResult(null)
            setShowConfirmUnmatch(false)
        }
    }, [isOpen, product, isMatched])

    const loadUnmatchedItems = async () => {
        setIsLoading(true)
        try {
            const items = await getUnmatchedProducts(oppositePlatform)
            setUnmatchedItems(items)
        } catch (err) {
            console.error('Failed to load unmatched items:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleUnmatch = async () => {
        if (!product) return
        setIsProcessing(true)
        try {
            const res = await unmatchProduct(platform, product.id)
            setResult(res)
            if (res.success) {
                setTimeout(() => {
                    onMatchUpdated()
                    onClose()
                }, 1200)
            }
        } catch (err) {
            setResult({ success: false, message: 'An error occurred' })
        } finally {
            setIsProcessing(false)
        }
    }

    const handleMatch = async () => {
        if (!product || !selectedTarget) return
        setIsProcessing(true)
        try {
            const shopifyId = platform === 'shopify' ? product.id : selectedTarget
            const etsyId = platform === 'etsy' ? product.id : selectedTarget
            const res = await matchProducts(shopifyId, etsyId)
            setResult(res)
            if (res.success) {
                setTimeout(() => {
                    onMatchUpdated()
                    onClose()
                }, 1500)
            }
        } catch (err) {
            setResult({ success: false, message: 'An error occurred' })
        } finally {
            setIsProcessing(false)
        }
    }

    const filteredItems = useMemo(() => {
        if (!searchQuery) return unmatchedItems
        const q = searchQuery.toLowerCase()
        return unmatchedItems.filter(i =>
            i.title?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)
        )
    }, [unmatchedItems, searchQuery])

    if (!isOpen || !product) return null

    const PlatformIcon = platform === 'shopify' ? ShopifyIcon : EtsyIcon
    const OppositeIcon = platform === 'shopify' ? EtsyIcon : ShopifyIcon

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`px-6 py-5 text-white ${isMatched ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-gradient-to-r from-amber-600 to-orange-600'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            {isMatched ? <Link2 className="w-5 h-5" /> : <Unlink className="w-5 h-5" />}
                            Match Management
                        </h3>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/20 overflow-hidden flex-shrink-0">
                            {product.imageUrl ? (
                                <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5" /></div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{product.title}</p>
                            <p className="text-xs opacity-75">{product.variantsCount} variant(s) • {platform}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* Result banner */}
                    {result && (
                        <div className={`mb-4 p-3 rounded-xl border flex items-center gap-2 text-sm font-medium ${result.success
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                            {result.success ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            {result.message}
                            {result.variantMatches && result.variantMatches.length > 0 && (
                                <span className="ml-auto text-xs opacity-75">
                                    {result.variantMatches.length} variant(s) matched
                                </span>
                            )}
                        </div>
                    )}

                    {isMatched ? (
                        /* ─── UNMATCH MODE ─── */
                        <div>
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Link2 className="w-4 h-4 text-emerald-600" />
                                    <span className="text-sm font-bold text-emerald-800">Currently Matched</span>
                                </div>
                                <p className="text-xs text-emerald-700 leading-relaxed">
                                    This product is synced with a product on {oppositePlatform}. Unmatching will split the inventory tracking into two separate entries.
                                </p>
                            </div>

                            {!showConfirmUnmatch ? (
                                <button
                                    onClick={() => setShowConfirmUnmatch(true)}
                                    className="w-full py-3 px-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Unlink className="w-4 h-4" />
                                    Unmatch This Product
                                </button>
                            ) : (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-600" />
                                        <span className="text-sm font-bold text-red-800">Confirm Unmatch</span>
                                    </div>
                                    <p className="text-xs text-red-700">
                                        This will break the sync between platforms. Both products will continue to exist independently but stock levels will no longer be tracked together.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowConfirmUnmatch(false)}
                                            disabled={isProcessing}
                                            className="flex-1 py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleUnmatch}
                                            disabled={isProcessing}
                                            className="flex-1 py-2 px-3 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                                            {isProcessing ? 'Processing...' : 'Confirm'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ─── MATCH MODE ─── */
                        <div>
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <PlatformIcon className="w-4 h-4 text-gray-500" />
                                    <ArrowRight className="w-3 h-3 text-gray-400" />
                                    <OppositeIcon className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-bold text-gray-700">
                                        Select a matching product on {oppositePlatform}
                                    </span>
                                </div>

                                <div className="relative mb-3">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search by title or SKU..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-gray-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    <span className="text-sm">Loading unmatched products...</span>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="text-center py-8">
                                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-medium">
                                        {searchQuery ? 'No products match your search' : `No unmatched products on ${oppositePlatform}`}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {filteredItems.map(item => (
                                        <button
                                            key={item.parentId}
                                            onClick={() => setSelectedTarget(selectedTarget === item.parentId ? null : item.parentId)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedTarget === item.parentId
                                                ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-400'
                                                : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                                                }`}
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-medium text-gray-500">{item.variantCount} variant(s)</span>
                                                    {item.sku && <span className="text-[10px] font-mono text-gray-400">{item.sku}</span>}
                                                </div>
                                            </div>
                                            {selectedTarget === item.parentId && (
                                                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                                                    <Check className="w-4 h-4" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {selectedTarget && (
                                <button
                                    onClick={handleMatch}
                                    disabled={isProcessing}
                                    className="w-full mt-4 py-3 px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Matching variants...
                                        </>
                                    ) : (
                                        <>
                                            <Link2 className="w-4 h-4" />
                                            Match & Auto-Link Variants
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
