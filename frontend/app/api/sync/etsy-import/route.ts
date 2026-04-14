import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../lib/etsy';

export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const body = await req.json();
        const { owner_id, filters = ['active'] } = body;

        if (!owner_id) {
            return NextResponse.json({ error: 'owner_id is required' }, { status: 400 });
        }

        // 1. Get Shop Data
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', owner_id)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        if (!shop.etsy_access_token || !shop.etsy_shop_id) {
            return NextResponse.json({ error: 'Etsy not connected for this shop' }, { status: 400 });
        }

        console.log(`[Etsy Import] Starting for owner ${owner_id}, shop ${shop.etsy_shop_id}, filters: ${filters}`);

        const results = [];
        const shopId = shop.etsy_shop_id;
        const accessToken = shop.etsy_access_token;
        const dbShopId = shop.id;

        // 2. Iterate through filters
        for (const state of filters) {
            console.log(`[Etsy Import] Fetching listings for state: ${state}`);
            const listingsData = await etsyApi.getListingsByState(shopId, accessToken, state);
            const listings = listingsData.results || [];

            console.log(`[Etsy Import] Found ${listings.length} listings for ${state}`);

            // 3. For each listing, fetch inventory and flatten
            for (const listing of listings) {
                try {
                    const inventory = await etsyApi.getInventory(listing.listing_id, accessToken);

                    if (inventory.products && inventory.products.length > 0) {
                        for (const variant of inventory.products) {
                            // Build variant title
                            let variantTitleParts: string[] = [];
                            if (variant.property_values) {
                                variant.property_values.forEach((prop: any) => {
                                    if (prop.values && prop.values.length > 0) {
                                        variantTitleParts.push(prop.values[0]);
                                    }
                                });
                            }
                            const variantTitle = variantTitleParts.length > 0 ? variantTitleParts.join(" - ") : "Default Title";

                            // Get price and quantity from offerings
                            let price = listing.price ? (listing.price.amount / listing.price.divisor) : 0;
                            let currency = listing.price ? listing.price.currency_code : 'USD';
                            let quantity = listing.quantity || 0;

                            if (variant.offerings && variant.offerings.length > 0) {
                                const offering = variant.offerings[0];
                                quantity = offering.quantity;
                                price = offering.price.amount / offering.price.divisor;
                                currency = offering.price.currency_code;
                            }

                            // Prepare flat product
                            const flatProduct = {
                                shop_id: dbShopId,
                                etsy_listing_id: listing.listing_id.toString(),
                                etsy_variant_id: variant.product_id.toString(),
                                name: variantTitle === "Default Title" ? listing.title : `${listing.title} - ${variantTitle}`,
                                sku: variant.sku || listing.skus?.[0] || null,
                                price: price,
                                currency: currency,
                                image_url: listing.images?.[0]?.url_fullxfull || null,
                                stock_quantity: quantity,
                                status: listing.state,
                                product_title: listing.title,
                                variant_title: variantTitle,
                                description: listing.description || "",
                                has_variations: listing.has_variations,
                                is_digital: listing.is_digital === true,
                                url: listing.url,
                                etsy_updated_at: listing.updated_timestamp ? new Date(listing.updated_timestamp * 1000).toISOString() : new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };

                            results.push(flatProduct);
                        }
                    } else {
                        // No variants, fallback to listing data
                        results.push({
                            shop_id: dbShopId,
                            etsy_listing_id: listing.listing_id.toString(),
                            etsy_variant_id: listing.listing_id.toString(),
                            name: listing.title,
                            sku: listing.skus?.[0] || null,
                            price: listing.price ? (listing.price.amount / listing.price.divisor) : 0,
                            currency: listing.price ? listing.price.currency_code : 'USD',
                            image_url: listing.Images?.[0]?.url_fullxfull || null,
                            stock_quantity: listing.quantity || 0,
                            status: listing.state,
                            product_title: listing.title,
                            variant_title: "Default Title",
                            description: listing.description || "",
                            has_variations: listing.has_variations,
                            is_digital: listing.is_digital === true,
                            url: listing.url,
                            etsy_updated_at: listing.updated_timestamp ? new Date(listing.updated_timestamp * 1000).toISOString() : new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    }
                } catch (listingErr) {
                    console.error(`[Etsy Import] Error processing listing ${listing.listing_id}:`, listingErr);
                }
            }
        }

        console.log(`[Etsy Import] Total variants to upsert: ${results.length}`);

        // 4. Batch Upsert to Staging Table
        if (results.length > 0) {
            // Split into chunks of 100 to avoid large payload errors
            const chunkSize = 100;
            for (let i = 0; i < results.length; i += chunkSize) {
                const chunk = results.slice(i, i + chunkSize);
                const { error: upsertError } = await supabase
                    .from('staging_etsy_products')
                    .upsert(chunk, { onConflict: 'etsy_variant_id' });

                if (upsertError) {
                    console.error(`[Etsy Import] Upsert chunk error:`, upsertError);
                    throw upsertError;
                }
            }
        }

        return NextResponse.json({
            success: true,
            imported_count: results.length,
            status: 'completed'
        });

    } catch (err: any) {
        console.error('[Etsy Import] Fatal Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
