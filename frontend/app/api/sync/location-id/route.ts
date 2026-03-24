import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as shopifyApi from '../lib/shopify';

/**
 * POST /api/sync/location-id
 * Updates staging products with stock levels from a specific Shopify location.
 */
export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const body = await req.json();
        const { owner_id, shopify_location_ids } = body;

        // Backward compatibility for single ID
        const locationIds = Array.isArray(shopify_location_ids)
            ? shopify_location_ids
            : [body.shopify_location_id].filter(Boolean);

        if (!owner_id || locationIds.length === 0) {
            return NextResponse.json({ error: 'owner_id and shopify_location_ids are required' }, { status: 400 });
        }

        console.log(`[API/sync/location-id] Updating stock for locations ${locationIds.join(', ')}, owner ${owner_id}`);

        // 1. Get Shop Data
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', owner_id)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        // Only save the PRIMARY location to main_location_id
        const primaryLocationId = locationIds[0];
        
        await supabase
            .from('shops')
            .update({ main_location_id: primaryLocationId })
            .eq('id', shop.id);

        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

        // 2. Fetch inventory levels for all selected locations
        const inventoryLevelsData = await shopifyApi.getInventoryLevels(creds, locationIds);
        const levels = inventoryLevelsData.inventory_levels || [];

        console.log(`[API/sync/location-id] Found ${levels.length} levels for locations ${locationIds.join(',')}`);

        // 3. Aggregate stock by inventory_item_id
        const stockMap: Record<string, number> = {};
        levels.forEach((level: any) => {
            const itemId = level.inventory_item_id.toString();
            const available = level.available || 0;
            stockMap[itemId] = (stockMap[itemId] || 0) + available;
        });

        const aggregatedItems = Object.keys(stockMap);

        // 4. Update Staging Products
        const chunkSize = 50;
        for (let i = 0; i < aggregatedItems.length; i += chunkSize) {
            const chunk = aggregatedItems.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (itemId: string) => {
                const totalStock = stockMap[itemId];

                await supabase
                    .from('staging_shopify_products')
                    .update({
                        stock_quantity: totalStock,
                        selected_location_ids: locationIds,
                        updated_at: new Date().toISOString()
                    })
                    .eq('shopify_inventory_item_id', itemId);
            }));
        }

        return NextResponse.json({
            success: true,
            message: `Updated stock levels for ${aggregatedItems.length} items across ${locationIds.length} locations.`
        });

    } catch (err: any) {
        console.error('[API/sync/location-id] Fatal Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
