import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { shop_id, matches } = body; // shop_id is actually owner_id from client

        if (!shop_id) {
            return NextResponse.json({ error: 'Missing shop_id' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // 1. Get Shop Info (Location IDs)
        const { data: shops } = await supabase
            .from('shops')
            .select('id, selected_location_ids, main_location_id')
            .eq('owner_id', shop_id)
            .limit(1);

        if (!shops || shops.length === 0) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        const realShopId = shops[0].id;
        const selectedLocIds: string[] = Array.isArray(shops[0].selected_location_ids) 
            ? shops[0].selected_location_ids 
            : [];
        
        const mainLocId = shops[0].main_location_id ? shops[0].main_location_id.toString().split(',')[0].trim() : null;

        // 2. Perform Matching Pass (Update Staging Tables)
        if (matches && Array.isArray(matches)) {
            for (const item of matches) {
                if (!item.shopify_variant_id || !item.etsy_variant_id) continue;

                await supabase
                    .from('staging_shopify_products')
                    .update({ etsy_variant_id: item.etsy_variant_id })
                    .eq('shop_id', realShopId)
                    .eq('shopify_variant_id', item.shopify_variant_id);

                await supabase
                    .from('staging_etsy_products')
                    .update({ shopify_variant_id: item.shopify_variant_id })
                    .eq('shop_id', realShopId)
                    .eq('etsy_variant_id', item.etsy_variant_id);
            }
        }

        // 3. Fetch ALL Staging Products for Persistence
        const { data: sStaging } = await supabase.from('staging_shopify_products').select('*').eq('shop_id', realShopId);
        const { data: eStaging } = await supabase.from('staging_etsy_products').select('*').eq('shop_id', realShopId);

        const shopifyMap = new Map();
        const etsyMap = new Map();

        sStaging?.forEach(s => shopifyMap.set(s.shopify_variant_id, s));
        eStaging?.forEach(e => etsyMap.set(e.etsy_variant_id, e));

        const processedShopifyVariants = new Set();
        const processedEtsyVariants = new Set();

        // 4. Process into inventory_items
        const finalSelectedLocs = selectedLocIds.length > 0 ? selectedLocIds : (mainLocId ? [mainLocId] : []);

        // 4.1. Process All Shopify Staging (Including Matched)
        for (const sItem of (sStaging || [])) {
            processedShopifyVariants.add(sItem.shopify_variant_id);
            
            const matchedEtsy = sItem.etsy_variant_id ? etsyMap.get(sItem.etsy_variant_id) : null;
            if (matchedEtsy) processedEtsyVariants.add(matchedEtsy.etsy_variant_id);

            // Calculate Shopify Stock from Selected Locations
            let sStock = 0;
            const locMap = typeof sItem.location_inventory_map === 'string' 
                ? JSON.parse(sItem.location_inventory_map) 
                : (sItem.location_inventory_map || {});

            if (selectedLocIds.length > 0) {
                selectedLocIds.forEach(locId => {
                    const stock = locMap[locId] ?? 0;
                    sStock += parseInt(stock.toString());
                });
            } else {
                sStock = sItem.stock_quantity ?? 0;
            }

            const eStock = matchedEtsy?.stock_quantity ?? 0;
            
            // STATUS & MASTER STOCK LOGIC
            // If they match -> Synced, Master = Stock
            // If they dont match -> MISMATCH, Master = 0
            // If single sided -> Marketplace Only, Master = Stock
            let status = 'Marketplace Only';
            let masterStock = sStock;

            if (matchedEtsy) {
                if (sStock === eStock) {
                    status = 'Synced';
                    masterStock = sStock;
                } else {
                    status = 'MISMATCH';
                    masterStock = 0; // Forced 0 as per user request if not equal
                }
            }

            const inventoryPayload = {
                shop_id: realShopId,
                sku: sItem.sku || matchedEtsy?.sku || 'NO-SKU',
                name: sItem.name || matchedEtsy?.name || 'Unknown Product',
                status: status,
                shopify_product_id: sItem.shopify_product_id,
                shopify_variant_id: sItem.shopify_variant_id,
                shopify_inventory_item_id: sItem.shopify_inventory_item_id,
                etsy_listing_id: matchedEtsy?.etsy_listing_id || null,
                etsy_variant_id: matchedEtsy?.etsy_variant_id || null,
                image_url: sItem.image_url || matchedEtsy?.image_url,
                master_stock: masterStock,
                shopify_stock_snapshot: sStock,
                etsy_stock_snapshot: matchedEtsy ? eStock : null,
                location_inventory_map: locMap,
                selected_location_ids: finalSelectedLocs,
                updated_at: new Date().toISOString()
            };

            // Enhanced lookup to ensure we identify existing items across platforms
            const { data: existing } = await supabase.from('inventory_items')
                .select('id')
                .eq('shop_id', realShopId)
                .or(`shopify_variant_id.eq.${sItem.shopify_variant_id}${matchedEtsy ? `,etsy_variant_id.eq.${matchedEtsy.etsy_variant_id}` : ''}`)
                .maybeSingle();

            if (existing) {
                await supabase.from('inventory_items').update(inventoryPayload).eq('id', existing.id);
            } else {
                await supabase.from('inventory_items').insert(inventoryPayload);
            }
        }

        // 4.2. Process Etsy-Only Staging (not matched above)
        for (const eItem of (eStaging || [])) {
            if (processedEtsyVariants.has(eItem.etsy_variant_id)) continue;

            const inventoryPayload = {
                shop_id: realShopId,
                sku: eItem.sku || 'NO-SKU',
                name: eItem.name || 'Unknown Etsy Product',
                status: 'Marketplace Only',
                shopify_product_id: null,
                shopify_variant_id: null,
                shopify_inventory_item_id: null,
                etsy_listing_id: eItem.etsy_listing_id,
                etsy_variant_id: eItem.etsy_variant_id,
                image_url: eItem.image_url,
                master_stock: eItem.stock_quantity ?? 0,
                shopify_stock_snapshot: null,
                etsy_stock_snapshot: eItem.stock_quantity ?? 0,
                location_inventory_map: {},
                selected_location_ids: finalSelectedLocs,
                updated_at: new Date().toISOString()
            };

            const { data: existing } = await supabase.from('inventory_items')
                .select('id')
                .eq('shop_id', realShopId)
                .eq('etsy_variant_id', eItem.etsy_variant_id)
                .maybeSingle();

            if (existing) {
                await supabase.from('inventory_items').update(inventoryPayload).eq('id', existing.id);
            } else {
                await supabase.from('inventory_items').insert(inventoryPayload);
            }
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Match save API error:', e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}
