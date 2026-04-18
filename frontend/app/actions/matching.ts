'use server'

import { createAdminClient, getValidatedUserContext } from '@/utils/supabase/admin'

// ─── Similarity helpers (shared with auto-match) ───

function normalize(str: string) {
    return (str || '').toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function getSimilarity(s1: string, s2: string) {
    const n1 = normalize(s1)
    const n2 = normalize(s2)
    if (!n1 || !n2) return 0
    if (n1 === n2) return 100

    if (n1.includes(n2) || n2.includes(n1)) {
        const smaller = n1.length < n2.length ? n1 : n2
        if (smaller.length > 10) return 92
    }

    const set1 = new Set(n1.split(' ').filter(Boolean))
    const set2 = new Set(n2.split(' ').filter(Boolean))
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const diceCoefficient = (2.0 * intersection.size) / (set1.size + set2.size) * 100
    return diceCoefficient
}

// ─── Types ───

type MatchResult = {
    success: boolean
    message: string
    variantMatches?: { shopifyVariantId: string; etsyVariantId: string; reason: string }[]
}

type UnmatchedListingGroup = {
    parentId: string
    title: string
    imageUrl: string | null
    variantCount: number
    sku: string | null
}

// ─── Unmatch Product ───

export async function unmatchProduct(
    platform: 'shopify' | 'etsy',
    productId: string
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    const adminSupabase = createAdminClient()

    const { data: shop } = await adminSupabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { success: false, message: 'Shop not found' }

    try {
        if (platform === 'shopify') {
            // Get all Shopify variants for this product
            const { data: shopifyRows } = await adminSupabase
                .from('staging_shopify_products')
                .select('shopify_variant_id, etsy_variant_id, shopify_product_id, name, sku, price, image_url, stock_quantity, shopify_inventory_item_id')
                .eq('shop_id', shop.id)
                .eq('shopify_product_id', productId)

            if (!shopifyRows || shopifyRows.length === 0) return { success: false, message: 'Product not found' }

            for (const row of shopifyRows) {
                if (!row.etsy_variant_id) continue

                // Clear Shopify → Etsy link
                await adminSupabase
                    .from('staging_shopify_products')
                    .update({ etsy_variant_id: null })
                    .eq('shop_id', shop.id)
                    .eq('shopify_variant_id', row.shopify_variant_id)

                // Clear Etsy → Shopify link
                await adminSupabase
                    .from('staging_etsy_products')
                    .update({ shopify_variant_id: null })
                    .eq('shop_id', shop.id)
                    .eq('etsy_variant_id', row.etsy_variant_id)

                // Split inventory_items: find merged row and split into two
                const { data: invItem } = await adminSupabase
                    .from('inventory_items')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .eq('shopify_variant_id', row.shopify_variant_id)
                    .maybeSingle()

                if (invItem && invItem.etsy_variant_id) {
                    // Update existing row → keep Shopify side only
                    await adminSupabase
                        .from('inventory_items')
                        .update({
                            etsy_listing_id: null,
                            etsy_variant_id: null,
                            etsy_stock_snapshot: 0,
                            etsy_updated_at: null,
                            status: 'Matching',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', invItem.id)

                    // Create new row for Etsy side
                    const { data: etsyRow } = await adminSupabase
                        .from('staging_etsy_products')
                        .select('*')
                        .eq('shop_id', shop.id)
                        .eq('etsy_variant_id', row.etsy_variant_id)
                        .maybeSingle()

                    if (etsyRow) {
                        const etsySku = etsyRow.sku || `SKU-${etsyRow.etsy_variant_id}`
                        await adminSupabase
                            .from('inventory_items')
                            .upsert({
                                shop_id: shop.id,
                                sku: etsySku,
                                name: etsyRow.name || etsyRow.product_title,
                                etsy_listing_id: etsyRow.etsy_listing_id,
                                etsy_variant_id: etsyRow.etsy_variant_id,
                                shopify_product_id: null,
                                shopify_variant_id: null,
                                image_url: etsyRow.image_url,
                                status: 'Matching',
                                etsy_stock_snapshot: etsyRow.stock_quantity || 0,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'shop_id,etsy_variant_id' })
                    }
                }
            }
        } else {
            // Etsy unmatch — mirror logic
            const { data: etsyRows } = await adminSupabase
                .from('staging_etsy_products')
                .select('etsy_variant_id, shopify_variant_id, etsy_listing_id, name, sku, price, image_url, stock_quantity')
                .eq('shop_id', shop.id)
                .eq('etsy_listing_id', productId)

            if (!etsyRows || etsyRows.length === 0) return { success: false, message: 'Product not found' }

            for (const row of etsyRows) {
                if (!row.shopify_variant_id) continue

                await adminSupabase
                    .from('staging_etsy_products')
                    .update({ shopify_variant_id: null })
                    .eq('shop_id', shop.id)
                    .eq('etsy_variant_id', row.etsy_variant_id)

                await adminSupabase
                    .from('staging_shopify_products')
                    .update({ etsy_variant_id: null })
                    .eq('shop_id', shop.id)
                    .eq('shopify_variant_id', row.shopify_variant_id)

                const { data: invItem } = await adminSupabase
                    .from('inventory_items')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .eq('etsy_variant_id', row.etsy_variant_id)
                    .maybeSingle()

                if (invItem && invItem.shopify_variant_id) {
                    await adminSupabase
                        .from('inventory_items')
                        .update({
                            shopify_product_id: null,
                            shopify_variant_id: null,
                            shopify_inventory_item_id: null,
                            shopify_stock_snapshot: 0,
                            shopify_updated_at: null,
                            status: 'Matching',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', invItem.id)

                    const { data: shopifyRow } = await adminSupabase
                        .from('staging_shopify_products')
                        .select('*')
                        .eq('shop_id', shop.id)
                        .eq('shopify_variant_id', row.shopify_variant_id)
                        .maybeSingle()

                    if (shopifyRow) {
                        const shopifySku = shopifyRow.sku || `SKU-${shopifyRow.shopify_variant_id}`
                        await adminSupabase
                            .from('inventory_items')
                            .upsert({
                                shop_id: shop.id,
                                sku: shopifySku,
                                name: shopifyRow.name || shopifyRow.product_title,
                                shopify_product_id: shopifyRow.shopify_product_id,
                                shopify_variant_id: shopifyRow.shopify_variant_id,
                                shopify_inventory_item_id: shopifyRow.shopify_inventory_item_id,
                                etsy_listing_id: null,
                                etsy_variant_id: null,
                                image_url: shopifyRow.image_url,
                                status: 'Matching',
                                shopify_stock_snapshot: shopifyRow.stock_quantity || 0,
                                location_inventory_map: shopifyRow.location_inventory_map || [],
                                selected_location_ids: shopifyRow.selected_location_ids || [],
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'shop_id,shopify_variant_id' })
                    }
                }
            }
        }

        return { success: true, message: 'Product successfully unmatched' }
    } catch (err: any) {
        console.error('[unmatchProduct]', err)
        return { success: false, message: err.message || 'Failed to unmatch' }
    }
}

// ─── Match Products ───

export async function matchProducts(
    shopifyProductId: string,
    etsyListingId: string
): Promise<MatchResult> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    const adminSupabase = createAdminClient()

    const { data: shop } = await adminSupabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { success: false, message: 'Shop not found' }

    try {
        // Fetch variants from both sides
        const { data: shopifyVariants } = await adminSupabase
            .from('staging_shopify_products')
            .select('*')
            .eq('shop_id', shop.id)
            .eq('shopify_product_id', shopifyProductId)

        const { data: etsyVariants } = await adminSupabase
            .from('staging_etsy_products')
            .select('*')
            .eq('shop_id', shop.id)
            .eq('etsy_listing_id', etsyListingId)

        if (!shopifyVariants?.length || !etsyVariants?.length) {
            return { success: false, message: 'Products not found in staging' }
        }

        // Auto-match variants using similarity
        const variantMatches: { shopifyVariantId: string; etsyVariantId: string; reason: string }[] = []
        const usedEtsyIds = new Set<string>()

        for (const sv of shopifyVariants) {
            const sName = normalize(sv.name || sv.product_title || '')
            let bestMatch: any = null
            let bestScore = 0
            let bestReason = ''

            // 1. SKU match
            if (sv.sku && sv.sku !== 'NO-SKU') {
                const skuMatch = etsyVariants.find(ev => ev.sku === sv.sku && !usedEtsyIds.has(ev.etsy_variant_id))
                if (skuMatch) {
                    bestMatch = skuMatch
                    bestScore = 1000
                    bestReason = 'SKU Match'
                }
            }

            // 2. Title similarity
            if (!bestMatch) {
                for (const ev of etsyVariants) {
                    if (usedEtsyIds.has(ev.etsy_variant_id)) continue
                    const eName = normalize(ev.name || '')

                    if (sName === eName) {
                        bestMatch = ev
                        bestScore = 100
                        bestReason = 'Exact Title'
                        break
                    }

                    const score = getSimilarity(sName, eName)
                    if (score > bestScore && score >= 50) {
                        bestScore = score
                        bestMatch = ev
                        bestReason = 'Title Similarity'
                    }
                }
            }

            // 3. Single variant fallback
            if (!bestMatch && shopifyVariants.length === 1 && etsyVariants.length === 1) {
                bestMatch = etsyVariants[0]
                bestReason = 'Single Variant'
            }

            if (bestMatch) {
                usedEtsyIds.add(bestMatch.etsy_variant_id)
                variantMatches.push({
                    shopifyVariantId: sv.shopify_variant_id,
                    etsyVariantId: bestMatch.etsy_variant_id,
                    reason: bestReason
                })
            }
        }

        if (variantMatches.length === 0) {
            return { success: false, message: 'No matching variants found between products' }
        }

        // Write matches to staging tables + merge inventory_items
        for (const match of variantMatches) {
            // Update Shopify staging
            await adminSupabase
                .from('staging_shopify_products')
                .update({ etsy_variant_id: match.etsyVariantId })
                .eq('shop_id', shop.id)
                .eq('shopify_variant_id', match.shopifyVariantId)

            // Update Etsy staging
            await adminSupabase
                .from('staging_etsy_products')
                .update({ shopify_variant_id: match.shopifyVariantId })
                .eq('shop_id', shop.id)
                .eq('etsy_variant_id', match.etsyVariantId)

            // Merge inventory_items: find both platform rows and merge into one
            const { data: shopifyInv } = await adminSupabase
                .from('inventory_items')
                .select('*')
                .eq('shop_id', shop.id)
                .eq('shopify_variant_id', match.shopifyVariantId)
                .is('etsy_variant_id', null)
                .maybeSingle()

            const { data: etsyInv } = await adminSupabase
                .from('inventory_items')
                .select('*')
                .eq('shop_id', shop.id)
                .eq('etsy_variant_id', match.etsyVariantId)
                .is('shopify_variant_id', null)
                .maybeSingle()

            if (shopifyInv && etsyInv) {
                // Merge: Both platform rows exist. 
                // IMPORTANT: Delete etsy-only row FIRST to free unique constraint on etsy_variant_id,
                // THEN update shopify row with etsy data.
                const etsyData = {
                    etsy_listing_id: etsyInv.etsy_listing_id,
                    etsy_variant_id: match.etsyVariantId,
                    etsy_stock_snapshot: etsyInv.etsy_stock_snapshot,
                    etsy_updated_at: etsyInv.etsy_updated_at,
                };

                await adminSupabase
                    .from('inventory_items')
                    .delete()
                    .eq('id', etsyInv.id)

                await adminSupabase
                    .from('inventory_items')
                    .update({
                        ...etsyData,
                        status: 'Matching',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', shopifyInv.id)
            } else if (shopifyInv) {
                // Only Shopify row exists — add Etsy data
                const { data: ev } = await adminSupabase
                    .from('staging_etsy_products')
                    .select('etsy_listing_id, stock_quantity, etsy_updated_at')
                    .eq('etsy_variant_id', match.etsyVariantId)
                    .maybeSingle()

                await adminSupabase
                    .from('inventory_items')
                    .update({
                        etsy_listing_id: ev?.etsy_listing_id,
                        etsy_variant_id: match.etsyVariantId,
                        etsy_stock_snapshot: ev?.stock_quantity || 0,
                        etsy_updated_at: ev?.etsy_updated_at,
                        status: 'Matching',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', shopifyInv.id)
            } else if (etsyInv) {
                // Only Etsy row exists — add Shopify data
                const { data: sv } = await adminSupabase
                    .from('staging_shopify_products')
                    .select('shopify_product_id, shopify_inventory_item_id, stock_quantity, shopify_updated_at, image_url')
                    .eq('shopify_variant_id', match.shopifyVariantId)
                    .maybeSingle()

                await adminSupabase
                    .from('inventory_items')
                    .update({
                        shopify_product_id: sv?.shopify_product_id,
                        shopify_variant_id: match.shopifyVariantId,
                        shopify_inventory_item_id: sv?.shopify_inventory_item_id,
                        shopify_stock_snapshot: sv?.stock_quantity || 0,
                        shopify_updated_at: sv?.shopify_updated_at,
                        image_url: sv?.image_url || etsyInv.image_url,
                        status: 'Matching',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', etsyInv.id)
            }
        }

        return {
            success: true,
            message: `Matched ${variantMatches.length} variant(s) successfully`,
            variantMatches
        }
    } catch (err: any) {
        console.error('[matchProducts]', err)
        return { success: false, message: err.message || 'Failed to match' }
    }
}

// ─── Delete Product ───

export async function deleteProduct(
    platform: 'shopify' | 'etsy',
    productId: string
): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return { success: false, message: 'Not authenticated' }

    const adminSupabase = createAdminClient()

    const { data: shop } = await adminSupabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return { success: false, message: 'Shop not found' }

    try {
        if (platform === 'shopify') {
            const { data: rows } = await adminSupabase
                .from('staging_shopify_products')
                .select('shopify_variant_id, etsy_variant_id')
                .eq('shop_id', shop.id)
                .eq('shopify_product_id', productId)

            if (!rows?.length) return { success: false, message: 'Product not found' }

            for (const row of rows) {
                // Clear Etsy side link if matched
                if (row.etsy_variant_id) {
                    await adminSupabase
                        .from('staging_etsy_products')
                        .update({ shopify_variant_id: null })
                        .eq('shop_id', shop.id)
                        .eq('etsy_variant_id', row.etsy_variant_id)

                    // Update inventory: remove shopify side, keep etsy-only
                    const { data: inv } = await adminSupabase
                        .from('inventory_items')
                        .select('id')
                        .eq('shop_id', shop.id)
                        .eq('shopify_variant_id', row.shopify_variant_id)
                        .maybeSingle()

                    if (inv) {
                        await adminSupabase
                            .from('inventory_items')
                            .update({
                                shopify_product_id: null,
                                shopify_variant_id: null,
                                shopify_inventory_item_id: null,
                                shopify_stock_snapshot: 0,
                                shopify_updated_at: null,
                                status: 'Matching',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', inv.id)
                    }
                } else {
                    // Not matched — just delete inventory row
                    await adminSupabase
                        .from('inventory_items')
                        .delete()
                        .eq('shop_id', shop.id)
                        .eq('shopify_variant_id', row.shopify_variant_id)
                }
            }

            // Delete staging rows
            await adminSupabase
                .from('staging_shopify_products')
                .delete()
                .eq('shop_id', shop.id)
                .eq('shopify_product_id', productId)

        } else {
            const { data: rows } = await adminSupabase
                .from('staging_etsy_products')
                .select('etsy_variant_id, shopify_variant_id')
                .eq('shop_id', shop.id)
                .eq('etsy_listing_id', productId)

            if (!rows?.length) return { success: false, message: 'Product not found' }

            for (const row of rows) {
                if (row.shopify_variant_id) {
                    await adminSupabase
                        .from('staging_shopify_products')
                        .update({ etsy_variant_id: null })
                        .eq('shop_id', shop.id)
                        .eq('shopify_variant_id', row.shopify_variant_id)

                    const { data: inv } = await adminSupabase
                        .from('inventory_items')
                        .select('id')
                        .eq('shop_id', shop.id)
                        .eq('etsy_variant_id', row.etsy_variant_id)
                        .maybeSingle()

                    if (inv) {
                        await adminSupabase
                            .from('inventory_items')
                            .update({
                                etsy_listing_id: null,
                                etsy_variant_id: null,
                                etsy_stock_snapshot: 0,
                                etsy_updated_at: null,
                                status: 'Matching',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', inv.id)
                    }
                } else {
                    await adminSupabase
                        .from('inventory_items')
                        .delete()
                        .eq('shop_id', shop.id)
                        .eq('etsy_variant_id', row.etsy_variant_id)
                }
            }

            await adminSupabase
                .from('staging_etsy_products')
                .delete()
                .eq('shop_id', shop.id)
                .eq('etsy_listing_id', productId)
        }

        return { success: true, message: 'Product removed from MercSync tracking' }
    } catch (err: any) {
        console.error('[deleteProduct]', err)
        return { success: false, message: err.message || 'Failed to delete' }
    }
}

// ─── Get Unmatched Products (for match modal) ───

export async function getUnmatchedProducts(
    platform: 'shopify' | 'etsy'
): Promise<UnmatchedListingGroup[]> {
    const { supabase, ownerId } = await getValidatedUserContext()
    if (!ownerId) return []

    const adminSupabase = createAdminClient()

    const { data: shop } = await adminSupabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle()

    if (!shop) return []

    if (platform === 'shopify') {
        const { data: rows } = await adminSupabase
            .from('staging_shopify_products')
            .select('shopify_product_id, product_title, image_url, sku, etsy_variant_id')
            .eq('shop_id', shop.id)

        if (!rows) return []

        // Group by product, filter to only fully unmatched products
        const groups: Record<string, { title: string; imageUrl: string | null; variants: number; sku: string | null; hasMatch: boolean }> = {}
        for (const r of rows) {
            const gid = r.shopify_product_id
            if (!groups[gid]) {
                groups[gid] = { title: r.product_title, imageUrl: r.image_url, variants: 0, sku: r.sku, hasMatch: false }
            }
            groups[gid].variants++
            if (r.etsy_variant_id) groups[gid].hasMatch = true
        }

        return Object.entries(groups)
            .filter(([_, g]) => !g.hasMatch)
            .map(([id, g]) => ({
                parentId: id,
                title: g.title,
                imageUrl: g.imageUrl,
                variantCount: g.variants,
                sku: g.sku
            }))
    } else {
        const { data: rows } = await adminSupabase
            .from('staging_etsy_products')
            .select('etsy_listing_id, product_title, image_url, sku, shopify_variant_id')
            .eq('shop_id', shop.id)

        if (!rows) return []

        const groups: Record<string, { title: string; imageUrl: string | null; variants: number; sku: string | null; hasMatch: boolean }> = {}
        for (const r of rows) {
            const gid = r.etsy_listing_id
            if (!groups[gid]) {
                groups[gid] = { title: r.product_title, imageUrl: r.image_url, variants: 0, sku: r.sku, hasMatch: false }
            }
            groups[gid].variants++
            if (r.shopify_variant_id) groups[gid].hasMatch = true
        }

        return Object.entries(groups)
            .filter(([_, g]) => !g.hasMatch)
            .map(([id, g]) => ({
                parentId: id,
                title: g.title,
                imageUrl: g.imageUrl,
                variantCount: g.variants,
                sku: g.sku
            }))
    }
}
