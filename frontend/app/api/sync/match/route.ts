import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { shop_id, matches } = body;

        if (!shop_id) {
            return NextResponse.json({ error: 'Missing shop_id' }, { status: 400 });
        }

        if (!matches || !Array.isArray(matches)) {
            return NextResponse.json({ error: 'Invalid matches payload' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Get actual shop ID
        const { data: shops } = await supabase
            .from('shops')
            .select('id, main_location_id')
            .eq('owner_id', shop_id)
            .limit(1);

        if (!shops || shops.length === 0) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        const realShopId = shops[0].id;
        const mainLocId = shops[0].main_location_id ? shops[0].main_location_id.toString().split(',')[0].trim() : null;

        const results = [];
        
        for (const item of matches) {
            if (!item.shopify_variant_id || !item.etsy_variant_id) continue;

            // 1. Update Staging Tables (Cross-Link)
            const { error: shEr } = await supabase
                .from('staging_shopify_products')
                .update({ etsy_variant_id: item.etsy_variant_id })
                .eq('shop_id', realShopId)
                .eq('shopify_variant_id', item.shopify_variant_id);

            const { error: etEr } = await supabase
                .from('staging_etsy_products')
                .update({ shopify_variant_id: item.shopify_variant_id })
                .eq('shop_id', realShopId)
                .eq('etsy_variant_id', item.etsy_variant_id);

            // 2. Fetch full staging data to populate inventory_items
            const { data: sData } = await supabase.from('staging_shopify_products').select('*').eq('shop_id', realShopId).eq('shopify_variant_id', item.shopify_variant_id).maybeSingle();
            const { data: eData } = await supabase.from('staging_etsy_products').select('*').eq('shop_id', realShopId).eq('etsy_variant_id', item.etsy_variant_id).maybeSingle();

            if (sData || eData) {
                const sku = sData?.sku || eData?.sku || 'NO-SKU';
                const title = sData?.title || eData?.title || 'Unknown Product';
                
                // Lookup existing inventory item to prevent duplication
                const { data: existing } = await supabase.from('inventory_items')
                    .select('id')
                    .eq('shop_id', realShopId)
                    .or(`shopify_variant_id.eq.${item.shopify_variant_id},etsy_variant_id.eq.${item.etsy_variant_id}`)
                    .maybeSingle();

                const inventoryPayload = {
                    shop_id: realShopId,
                    sku,
                    name: title,
                    shopify_product_id: sData?.shopify_product_id,
                    shopify_variant_id: item.shopify_variant_id,
                    etsy_listing_id: eData?.etsy_listing_id,
                    etsy_variant_id: item.etsy_variant_id,
                    image_url: sData?.image_url || eData?.image_url,
                    master_stock: sData?.stock ?? eData?.stock ?? 0,
                    shopify_stock_snapshot: sData?.stock,
                    etsy_stock_snapshot: eData?.stock,
                    selected_location_ids: mainLocId ? [mainLocId] : [],
                    updated_at: new Date().toISOString()
                };

                if (existing) {
                    await supabase.from('inventory_items').update(inventoryPayload).eq('id', existing.id);
                } else {
                    await supabase.from('inventory_items').insert(inventoryPayload);
                }
            }

            results.push({ variant: item.shopify_variant_id, error: shEr || etEr });
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        console.error('Match save API error:', e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}
