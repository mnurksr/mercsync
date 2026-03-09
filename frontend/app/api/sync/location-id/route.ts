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
        const { owner_id, shopify_location_id } = body;

        if (!owner_id || !shopify_location_id) {
            return NextResponse.json({ error: 'owner_id and shopify_location_id are required' }, { status: 400 });
        }

        console.log(`[API/sync/location-id] Updating stock for location ${shopify_location_id}, owner ${owner_id}`);

        // 1. Get Shop Data
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', owner_id)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

        // 2. Fetch inventory levels for this location
        const inventoryLevelsData = await shopifyApi.getInventoryLevels(creds, shopify_location_id);
        const levels = inventoryLevelsData.inventory_levels || [];

        console.log(`[API/sync/location-id] Found ${levels.length} levels for location ${shopify_location_id}`);

        // 3. Update Staging Products
        // We do this in small batches to avoid Supabase connection issues or timeouts
        const chunkSize = 50;
        for (let i = 0; i < levels.length; i += chunkSize) {
            const chunk = levels.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (level: any) => {
                const itemId = level.inventory_item_id.toString();
                const stock = level.available || 0;

                await supabase
                    .from('staging_shopify_products')
                    .update({
                        stock_quantity: stock,
                        updated_at: new Date().toISOString()
                    })
                    .eq('shopify_inventory_item_id', itemId);
            }));
        }

        return NextResponse.json({
            success: true,
            message: `Updated ${levels.length} inventory levels for location ${shopify_location_id}`
        });

    } catch (err: any) {
        console.error('[API/sync/location-id] Fatal Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
