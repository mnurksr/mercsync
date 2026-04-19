import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkMatchedItemLimit } from '@/utils/planLimits';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { matches, owner_id } = body;

        console.log(`[API/save-matches] Received ${matches?.length || 0} matches for owner ${owner_id}`);

        if (!matches || !Array.isArray(matches) || !owner_id) {
            return NextResponse.json({ error: 'Missing matches array or owner_id' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // 1. Get Shop ID
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', owner_id)
            .maybeSingle();

        if (shopError || !shop) {
            console.error('[API/save-matches] Shop not found:', shopError);
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        const shopId = shop.id;

        const { count: existingMatchedCount, error: countError } = await supabase
            .from('inventory_items')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .not('shopify_variant_id', 'is', null)
            .not('etsy_variant_id', 'is', null);

        if (countError) {
            return NextResponse.json({ error: countError.message }, { status: 500 });
        }

        let additionalMatchedItems = 0;
        for (const match of matches) {
            if (!match.shopify_variant_id || !match.etsy_variant_id) continue;

            const { data: alreadyMatched } = await supabase
                .from('inventory_items')
                .select('id')
                .eq('shop_id', shopId)
                .eq('shopify_variant_id', match.shopify_variant_id)
                .eq('etsy_variant_id', match.etsy_variant_id)
                .maybeSingle();

            if (!alreadyMatched) additionalMatchedItems += 1;
        }

        const planLimit = await checkMatchedItemLimit(supabase, shopId, (existingMatchedCount || 0) + additionalMatchedItems);
        if (!planLimit.ok) {
            return NextResponse.json({
                error: planLimit.message,
                code: 'PLAN_MATCHED_ITEM_LIMIT',
                plan: planLimit.planName,
                limit: planLimit.limit,
                current: planLimit.current
            }, { status: 402 });
        }

        // 2. Process Matches
        const results = [];
        for (const match of matches) {
            const { shopify_variant_id, etsy_variant_id, shopify_product_id, etsy_listing_id } = match;

            if (!shopify_variant_id || !etsy_variant_id) {
                console.warn('[API/save-matches] Skipping partial match:', match);
                continue;
            }

            // A. Update Staging Tables
            const updateShopify = supabase
                .from('staging_shopify_products')
                .update({
                    etsy_variant_id,
                    etsy_listing_id,
                    is_matched: true
                })
                .eq('shop_id', shopId)
                .eq('shopify_variant_id', shopify_variant_id);

            const updateEtsy = supabase
                .from('staging_etsy_products')
                .update({
                    shopify_variant_id,
                    shopify_product_id,
                    is_matched: true
                })
                .eq('shop_id', shopId)
                .eq('etsy_variant_id', etsy_variant_id);

            // B. Upsert Inventory Item
            // We look for an existing item that has either of these variant IDs
            const { data: existingItems } = await supabase
                .from('inventory_items')
                .select('id, shopify_variant_id, etsy_variant_id, shopify_product_id, etsy_listing_id')
                .eq('shop_id', shopId)
                .or(`shopify_variant_id.eq.${shopify_variant_id},etsy_variant_id.eq.${etsy_variant_id}`);

            if (existingItems && existingItems.length > 0) {
                // Update the first found record
                const existingItem = existingItems[0];
                const targetId = existingItem.id;
                const existingSId = existingItem.shopify_product_id;
                const existingEId = existingItem.etsy_listing_id;

                await supabase
                    .from('inventory_items')
                    .update({
                        shopify_variant_id,
                        etsy_variant_id,
                        shopify_product_id: shopify_product_id || existingSId,
                        etsy_listing_id: etsy_listing_id || existingEId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', targetId);
            } else {
                // Create new inventory item
                // Pull details from both staging tables to seed the inventory item correctly
                const { data: sProd } = await supabase
                    .from('staging_shopify_products')
                    .select('name, sku, stock_quantity, location_inventory_map, selected_location_ids, image_url, shopify_inventory_item_id')
                    .eq('shopify_variant_id', shopify_variant_id)
                    .maybeSingle();
                    
                const { data: eProd } = await supabase
                    .from('staging_etsy_products')
                    .select('stock_quantity, image_url')
                    .eq('etsy_variant_id', etsy_variant_id)
                    .maybeSingle();

                await supabase
                    .from('inventory_items')
                    .insert({
                        shop_id: shopId,
                        owner_id: owner_id,
                        sku: sProd?.sku || `auto-${Date.now()}`,
                        name: sProd?.name || 'Synced Product',
                        shopify_variant_id,
                        etsy_variant_id,
                        shopify_product_id,
                        etsy_listing_id,
                        shopify_inventory_item_id: sProd?.shopify_inventory_item_id,
                        shopify_stock_snapshot: sProd?.stock_quantity || 0,
                        etsy_stock_snapshot: eProd?.stock_quantity || 0,
                        location_inventory_map: sProd?.location_inventory_map || [],
                        selected_location_ids: sProd?.selected_location_ids || [],
                        image_url: sProd?.image_url || eProd?.image_url || null,
                        status: 'Matching',
                        updated_at: new Date().toISOString()
                    });
            }

            await Promise.all([updateShopify, updateEtsy]);
            results.push({ shopify_variant_id, etsy_variant_id, status: 'success' });
        }

        return NextResponse.json({
            success: true,
            processedCount: results.length,
            message: 'Matches saved successfully'
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('[API/save-matches] Internal Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
