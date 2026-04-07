import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Normalizes a string for comparison (N8N Aligned)
 */
function normalize(str: string) {
    return (str || "").toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculates similarity score between two strings (Enhance E-Commerce Matcher)
 */
function getSimilarity(s1: string, s2: string) {
    const n1 = normalize(s1);
    const n2 = normalize(s2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 100;

    // 1. Substring Match (handles simple appended words perfectly)
    if (n1.includes(n2) || n2.includes(n1)) {
        const smaller = n1.length < n2.length ? n1 : n2;
        // If the substring is reasonably substantial, give it a very high score
        if (smaller.length > 10) return 92;
    }

    const set1 = new Set(n1.split(' ').filter(Boolean));
    const set2 = new Set(n2.split(' ').filter(Boolean));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    // 2. Word-based Dice Coefficient (more forgiving than Jaccard for suffixes)
    // Formula: (2 * intersection) / (set1 + set2)
    const diceCoefficient = (2.0 * intersection.size) / (set1.size + set2.size) * 100;

    // 3. Longest Common Prefix check (handles "Product A version 1" vs "Product A version 2")
    let lcpLength = 0;
    const minLen = Math.min(n1.length, n2.length);
    for (let i = 0; i < minLen; i++) {
        if (n1[i] === n2[i]) lcpLength++;
        else break;
    }
    const prefixRatio = (lcpLength / Math.max(n1.length, n2.length)) * 100;

    // We take the best meaningful score
    return Math.max(diceCoefficient, prefixRatio > 50 ? prefixRatio : 0);
}

export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const { user_id } = await req.json();
        if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

        // 1. Get Shop
        const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', user_id).single();
        if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });

        // 2. Fetch Staging Products
        const [sRes, eRes] = await Promise.all([
            supabase.from('staging_shopify_products').select('*').eq('shop_id', shop.id),
            supabase.from('staging_etsy_products').select('*').eq('shop_id', shop.id)
        ]);

        const sItems = sRes.data || [];
        const eItems = eRes.data || [];

        // 3. Group by Parent
        const sGroups: Record<string, any[]> = {};
        sItems.forEach(item => {
            const gid = item.shopify_product_id;
            if (!sGroups[gid]) sGroups[gid] = [];
            sGroups[gid].push(item);
        });

        const eGroups: Record<string, any[]> = {};
        eItems.forEach(item => {
            const gid = item.etsy_listing_id;
            if (!eGroups[gid]) eGroups[gid] = [];
            eGroups[gid].push(item);
        });

        const linked_products: any[] = [];
        const usedEtsyGids = new Set<string>();
        const usedShopifyGids = new Set<string>();

        // 4. Perform Matching
        for (const sGid in sGroups) {
            const sVariants = sGroups[sGid];
            const sTitle = sVariants[0]?.product_title || sVariants[0]?.name || '';

            let bestMatchEgid: string | null = null;
            let bestScore = 0;

            // Simple SKU check first (if any variant has SKU)
            const sSkus = new Set(sVariants.map(v => v.sku).filter(sku => sku && sku !== 'NO-SKU'));

            for (const eGid in eGroups) {
                if (usedEtsyGids.has(eGid)) continue;
                const eVariants = eGroups[eGid];

                // Check SKU overlap
                const eSkus = new Set(eVariants.map(v => v.sku).filter(sku => sku && sku !== 'NO-SKU'));
                const intersection = new Set([...sSkus].filter(x => eSkus.has(x)));

                if (intersection.size > 0) {
                    bestMatchEgid = eGid;
                    bestScore = 1000; // Boost SKU match
                    break;
                }

                // Check Title similarity
                const eTitle = eVariants[0]?.product_title || eVariants[0]?.name || '';
                const score = getSimilarity(sTitle, eTitle);
                if (score > bestScore && score > 60) {
                    bestScore = score;
                    bestMatchEgid = eGid;
                }
            }

            if (bestMatchEgid) {
                usedEtsyGids.add(bestMatchEgid);
                usedShopifyGids.add(sGid);

                const eVariants = eGroups[bestMatchEgid];
                const variantMatches: any[] = [];
                const matchedSVarIds = new Set<string>();
                const matchedEVarIds = new Set<string>();

                // Match variants within group (N8N Aligned)
                for (const sVar of sVariants) {
                    const sVarId = sVar.shopify_variant_id;
                    const sFullName = normalize(sVar.name || sVar.product_title || '');

                    let bestMatch: any = null;
                    let highestScore = 0;
                    let matchReason = "";

                    // 1. SKU Match (Highest Priority)
                    if (sVar.sku && sVar.sku !== 'NO-SKU') {
                        const eVar = eVariants.find(ev => ev.sku === sVar.sku && !matchedEVarIds.has(ev.etsy_variant_id));
                        if (eVar) {
                            bestMatch = eVar;
                            highestScore = 1000; // Force SKU match
                            matchReason = "SKU Match";
                        }
                    }

                    // 2. Similarity Match (Exact or Jaccard)
                    if (!bestMatch) {
                        for (const eVar of eVariants) {
                            if (matchedEVarIds.has(eVar.etsy_variant_id)) continue;

                            const eFullName = normalize(eVar.name || '');
                            if (sFullName === eFullName) {
                                bestMatch = eVar;
                                highestScore = 100;
                                matchReason = "Exact Title Match";
                                break;
                            }

                            const score = getSimilarity(sFullName, eFullName);
                            if (score > highestScore && score >= 60) {
                                highestScore = score;
                                bestMatch = eVar;
                                matchReason = "Semantic Title Match";
                            }
                        }
                    }

                    // 3. Single Variant Fallback
                    if (!bestMatch && sVariants.length === 1 && eVariants.length === 1) {
                        bestMatch = eVariants[0];
                        matchReason = "Single Variant Fallback";
                    }

                    if (bestMatch) {
                        variantMatches.push({
                            type: 'MATCHED',
                            s_variant_id: sVarId,
                            e_variant_id: bestMatch.etsy_variant_id,
                            reason: matchReason
                        });
                        matchedSVarIds.add(sVarId);
                        matchedEVarIds.add(bestMatch.etsy_variant_id);
                    }
                }

                linked_products.push({
                    s_product_id: sGid,
                    e_listing_id: bestMatchEgid,
                    name: sTitle,
                    variants: variantMatches
                });
            }
        }

        // Shopify Only
        const shopify_only_products = Object.keys(sGroups)
            .filter(gid => !usedShopifyGids.has(gid))
            .map(gid => ({
                s_id: gid,
                name: sGroups[gid][0]?.product_title || sGroups[gid][0]?.name
            }));

        // Etsy Only
        const etsy_only_products = Object.keys(eGroups)
            .filter(gid => !usedEtsyGids.has(gid))
            .map(gid => ({
                e_id: gid,
                name: eGroups[gid][0]?.product_title || eGroups[gid][0]?.name
            }));

        return NextResponse.json({
            linked_products,
            shopify_only_products,
            etsy_only_products
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
