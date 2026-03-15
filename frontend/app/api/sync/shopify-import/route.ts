import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as shopifyApi from '../lib/shopify';

export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const body = await req.json();
        const { ownerId, options = { shopify: ['active'] } } = body;

        if (!ownerId) {
            return NextResponse.json({ error: 'ownerId is required' }, { status: 400 });
        }

        // 1. Get Shop Data
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', ownerId)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        if (!shop.access_token || !shop.shop_domain) {
            return NextResponse.json({ error: 'Shopify not connected for this shop' }, { status: 400 });
        }

        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
        const dbShopId = shop.id;
        const statusFilters = options.shopify || ['active'];

        console.log(`[Shopify Import] Starting for owner ${ownerId}, shop ${shop.shop_domain}, filters: ${statusFilters}`);

        // 2. Sync Locations
        console.log('[Shopify Import] Syncing locations...');
        const locationsData = await shopifyApi.getLocations(creds);
        const locations = locationsData.locations || [];

        if (locations.length > 0) {
            const locationRows = locations.map((loc: any) => ({
                shop_id: dbShopId,
                shopify_location_id: loc.id.toString(),
                name: loc.name,
                is_active: loc.active,
                type: 'warehouse',
                updated_at: new Date().toISOString()
            }));

            const { error: locError } = await supabase
                .from('inventory_locations')
                .upsert(locationRows, { onConflict: 'shop_id,shopify_location_id' });

            if (locError) {
                console.error('[Shopify Import] Location sync error:', locError);
            }
        }

        // 3. Fetch Products (Paginated)
        let allProducts: any[] = [];
        for (const status of statusFilters) {
            let pageInfo: string | null = null;
            do {
                const result = await shopifyApi.getProducts(creds, { status, limit: 250, page_info: pageInfo || undefined });
                allProducts = allProducts.concat(result.products);
                pageInfo = result.nextPageInfo;
            } while (pageInfo);
        }

        console.log(`[Shopify Import] Total products fetched: ${allProducts.length}`);

        // Default to the locations the user chose during setup
        const defaultLocationIds = shop.main_location_id ? shop.main_location_id.split(',').map((id: string) => id.trim()) : [];

        // 4. Transform and Upsert Products to Staging
        const stagingRows: any[] = [];
        allProducts.forEach(product => {
            const productImage = product.image ? product.image.src : (product.images?.[0]?.src || null);
            const description = product.body_html || '';

            product.variants.forEach((variant: any) => {
                let finalImage = productImage;
                if (variant.image_id && product.images) {
                    const foundImage = product.images.find((img: any) => img.id === variant.image_id);
                    if (foundImage) finalImage = foundImage.src;
                }

                const fullName = variant.title === "Default Title"
                    ? product.title
                    : `${product.title} - ${variant.title}`;

                stagingRows.push({
                    shop_id: dbShopId,
                    shopify_product_id: product.id.toString(),
                    shopify_variant_id: variant.id.toString(),
                    shopify_inventory_item_id: variant.inventory_item_id.toString(),
                    product_title: product.title,
                    variant_title: variant.title,
                    name: fullName,
                    sku: variant.sku || 'NO-SKU',
                    price: parseFloat(variant.price) || 0,
                    image_url: finalImage,
                    description: description,
                    status: product.status,
                    stock_quantity: variant.inventory_quantity || 0,
                    selected_location_ids: defaultLocationIds,
                    updated_at: new Date().toISOString()
                });
            });
        });

        if (stagingRows.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < stagingRows.length; i += chunkSize) {
                const chunk = stagingRows.slice(i, i + chunkSize);
                const { error: upsertError } = await supabase
                    .from('staging_shopify_products')
                    .upsert(chunk, { onConflict: 'shopify_inventory_item_id' });

                if (upsertError) {
                    console.error('[Shopify Import] Product upsert error:', upsertError);
                    throw upsertError;
                }
            }
        }

        // 5. Sync Inventory Levels (Stock aggregation)
        console.log('[Shopify Import] Syncing inventory levels...');
        const activeLocationIds = locations.filter((l: any) => l.active).map((l: any) => l.id);

        if (activeLocationIds.length > 0) {
            const inventoryLevelsData = await shopifyApi.getInventoryLevels(creds, activeLocationIds);
            const levels = inventoryLevelsData.inventory_levels || [];

            // Aggregate by inventory_item_id
            const aggregated: Record<string, { total: number, locations: any[], latest_update: string }> = {};
            levels.forEach((level: any) => {
                const itemId = level.inventory_item_id.toString();
                if (!aggregated[itemId]) {
                    aggregated[itemId] = { total: 0, locations: [], latest_update: '0' };
                }
                const stock = level.available || 0;
                aggregated[itemId].total += stock;

                if (level.updated_at && (aggregated[itemId].latest_update === '0' || level.updated_at > aggregated[itemId].latest_update)) {
                    aggregated[itemId].latest_update = level.updated_at;
                }

                aggregated[itemId].locations.push({
                    location_id: level.location_id.toString(),
                    stock: stock,
                    updated_at: level.updated_at
                });
            });

            // Update staging table with aggregated stock
            const itemIds = Object.keys(aggregated);
            for (let i = 0; i < itemIds.length; i += 10) { // Batch updates
                const batchIds = itemIds.slice(i, i + 10);
                await Promise.all(batchIds.map(async (itemId) => {
                    const data = aggregated[itemId];
                    await supabase
                        .from('staging_shopify_products')
                        .update({
                            stock_quantity: data.total,
                            location_inventory_map: data.locations,
                            shopify_updated_at: data.latest_update !== '0' ? data.latest_update : new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('shopify_inventory_item_id', itemId);
                }));
            }
        }

        return NextResponse.json({
            success: true,
            imported_count: stagingRows.length,
            status: 'completed'
        });

    } catch (err: any) {
        console.error('[Shopify Import] Fatal Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
