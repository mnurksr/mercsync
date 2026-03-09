import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

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
                const targetId = existingItems[0].id;
                const existingSId = (existingItems[0] as any).shopify_product_id;
                const existingEId = (existingItems[0] as any).etsy_listing_id;

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
                // We'll try to pull some detail from staging to give it a name
                const { data: sProd } = await supabase
                    .from('staging_shopify_products')
                    .select('name, sku')
                    .eq('shopify_variant_id', shopify_variant_id)
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

    } catch (error: any) {
        console.error('[API/save-matches] Internal Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
