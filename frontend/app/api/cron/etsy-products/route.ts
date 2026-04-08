import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
import { cloneToShopify } from '../../sync/lib/processor';
import { createNotification } from '@/app/actions/notifications';
import { calculatePrice } from '../../sync/price-sync';

export const maxDuration = 300; // Allows up to 5 mins execution

export async function GET(req: NextRequest) {
    // 1. Validate Cron Secret
    const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || secret !== cronSecret) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const supabase = createAdminClient();

    try {
        console.log('[Etsy Products Cron] Starting routine sync');

        // 2. Find eligible shops
        const { data: shops } = await supabase
            .from('shops')
            .select(`
                id, 
                shop_domain, 
                owner_id, 
                etsy_shop_id, 
                etsy_access_token,
                access_token,
                shop_settings!inner (
                    auto_sync_enabled,
                    sync_direction,
                    auto_create_products,
                    auto_update_products,
                    auto_delete_products,
                    price_rules
                )
            `)
            .eq('is_active', true)
            .not('etsy_shop_id', 'is', null)
            .not('etsy_access_token', 'is', null)
            .eq('shop_settings.auto_sync_enabled', true);

        if (!shops || shops.length === 0) {
            console.log('[Etsy Products Cron] No eligible shops found for sync');
            return NextResponse.json({ success: true, message: 'No shops' });
        }

        let processedCount = 0;

        for (const shop of shops) {
            const settings = Array.isArray(shop.shop_settings) ? shop.shop_settings[0] : shop.shop_settings;
            if (!settings) continue;

            // Check direction
            const canPull = settings.sync_direction === 'bidirectional' || settings.sync_direction === 'etsy_to_shopify';
            if (!canPull) continue;

            const { auto_create_products, auto_update_products, auto_delete_products, price_rules } = settings;
            const shopifyPriceRules = price_rules || [];
            if (!auto_create_products && !auto_update_products && !auto_delete_products) continue;

            console.log(`[Etsy Products Cron] Processing shop ${shop.shop_domain} (${shop.etsy_shop_id})`);

            try {
                // Determine timestamps: fetch last 20 minutes to match 15-minute cron with safe overlap
                const timeThreshold = Math.floor(Date.now() / 1000) - (20 * 60);

                // We can't query by last_modified_tsz easily in standard getListingsByState without search params, 
                // but for MVP we will pull the first page of active AND draft listings and filter.
                // --- HANDLE UPDATES & CREATES (ACTIVE & DRAFT) ---
                const activeData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'active', 0, 100);
                const draftData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'draft', 0, 100);
                
                const combinedResults = [...(activeData?.results || []), ...(draftData?.results || [])];
                const etsyData = { results: combinedResults };

                if (etsyData && etsyData.results && etsyData.results.length > 0) {
                    const recentListings = etsyData.results.filter((l: any) => l.last_modified_timestamp >= timeThreshold);
                    console.log(`[Etsy Products Cron] Found ${recentListings.length} modified listings (active+draft) for ${shop.shop_domain}`);

                    for (const listing of recentListings) {
                        const listingId = listing.listing_id.toString();

                        // Match with DB
                        const { data: matched } = await supabase
                            .from('inventory_items')
                            .select('shopify_product_id, shopify_variant_id')
                            .eq('shop_id', shop.id)
                            .eq('etsy_listing_id', listingId)
                            .maybeSingle();

                        if (matched && auto_update_products) {
                            // Auto-Update only handles price changes (per spec).
                            // Title and description changes are NOT auto-synced.
                            const priceNode = listing.price;
                            const basePrice = priceNode?.amount ? (priceNode.amount / priceNode.divisor) : null;
                            const newPrice = basePrice ? calculatePrice(basePrice, shopifyPriceRules, 'shopify') || basePrice : null;

                            if (newPrice) {
                                try {
                                    console.log(`[Etsy Products Cron] Auto-Updating price on Shopify variant ${matched.shopify_variant_id} from Etsy ${listingId} (${basePrice} → ${newPrice})`);
                                    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

                                    await shopifyApi.updateVariant(creds, matched.shopify_variant_id, {
                                        id: matched.shopify_variant_id,
                                        price: newPrice.toString()
                                    });

                                    await supabase.from('sync_logs').insert({
                                        shop_id: shop.id,
                                        source: 'etsy',
                                        direction: 'etsy_to_shopify',
                                        event_type: 'price_update',
                                        status: 'success',
                                        metadata: { etsy_listing_id: listingId, shopify_variant_id: matched.shopify_variant_id, old_price: basePrice, new_price: newPrice },
                                        created_at: new Date().toISOString()
                                    });
                                } catch (e: any) {
                                    console.error(`[Etsy Products Cron] Failed to update Shopify variant price ${matched.shopify_variant_id}:`, e);
                                    await supabase.from('sync_logs').insert({
                                        shop_id: shop.id,
                                        source: 'etsy',
                                        direction: 'etsy_to_shopify',
                                        event_type: 'price_update',
                                        status: 'failed',
                                        error_message: e.message,
                                        metadata: { etsy_listing_id: listingId, shopify_variant_id: matched.shopify_variant_id },
                                        created_at: new Date().toISOString()
                                    });
                                    await createNotification(
                                        supabase,
                                        shop.id,
                                        'sync_failed',
                                        'Price Sync Failed',
                                        `Failed to update Shopify variant ${matched.shopify_variant_id} price from Etsy listing ${listingId}. Error: ${e.message}`
                                    );
                                }
                            }
                        } else if (!matched && auto_create_products) {
                            console.log(`[Etsy Products Cron] Auto-Creating Shopify Product from Etsy ${listingId}`);
                            let cPrice = 0;
                            if (listing.price) cPrice = listing.price.amount / listing.price.divisor;
                            const images = listing.images || [];
                            const imageUrl = images.length > 0 ? images[0].url_fullxfull : undefined;

                            try {
                                const cloneProduct = {
                                    source_id: listingId,
                                    title: listing.title,
                                    sku: listing.sku?.[0] || `ETSY-${listingId}`,
                                    price: cPrice,
                                    stock: listing.quantity || 1,
                                    image: imageUrl || '',
                                    description: listing.description,
                                    variants: [{
                                        source_variant_id: listingId,
                                        title: 'Default Title',
                                        sku: listing.sku?.[0] || `ETSY-${listingId}`,
                                        price: cPrice,
                                        stock: listing.quantity || 1,
                                        selected: true
                                    }],
                                    price_rule: shopifyPriceRules
                                };
                                const createdShopifyProduct = await cloneToShopify(shop, cloneProduct, 'cron-job');

                                if (createdShopifyProduct && createdShopifyProduct.variants && createdShopifyProduct.variants.length > 0) {
                                    const variant = createdShopifyProduct.variants[0];
                                    await supabase.from('inventory_items').insert({
                                        shop_id: shop.id,
                                        shopify_product_id: createdShopifyProduct.id.toString(),
                                        shopify_variant_id: variant.id.toString(),
                                        shopify_inventory_item_id: variant.inventory_item_id.toString(),
                                        etsy_listing_id: listingId,
                                        sku: variant.sku || cloneProduct.sku,
                                        name: createdShopifyProduct.title,
                                        master_stock: variant.inventory_quantity || cloneProduct.stock,
                                        shopify_stock_snapshot: variant.inventory_quantity || cloneProduct.stock,
                                        etsy_stock_snapshot: cloneProduct.stock,
                                        status: 'Matched'
                                    });
                                }

                                await supabase.from('sync_logs').insert({
                                    shop_id: shop.id,
                                    source: 'etsy',
                                    direction: 'etsy_to_shopify',
                                    event_type: 'product_create',
                                    status: 'success',
                                    metadata: { etsy_listing_id: listingId, title: listing.title },
                                    created_at: new Date().toISOString()
                                });
                            } catch (e: any) {
                                console.error(`[Etsy Products Cron] Failed to create Shopify Product for Etsy ${listingId}:`, e);
                                await supabase.from('sync_logs').insert({
                                    shop_id: shop.id,
                                    source: 'etsy',
                                    direction: 'etsy_to_shopify',
                                    event_type: 'product_create',
                                    status: 'failed',
                                    error_message: e.message,
                                    metadata: { etsy_listing_id: listingId, title: listing.title },
                                    created_at: new Date().toISOString()
                                });
                                await createNotification(
                                    supabase,
                                    shop.id,
                                    'sync_failed',
                                    'Auto-Create Failed',
                                    `Failed to automatically create Shopify product from Etsy listing ${listingId}. Error: ${e.message}`
                                );
                            }
                        }
                    }
                }

                // --- HANDLE PRODUCT DEACTIVATION (ETSY -> SHOPIFY) ---
                if (auto_delete_products) {
                    try {
                        const inactiveData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'inactive', 0, 100);
                        if (inactiveData?.results?.length > 0) {
                            const recentInactives = inactiveData.results.filter((l: any) => l.last_modified_timestamp >= timeThreshold);
                            console.log(`[Etsy Products Cron] Found ${recentInactives.length} recently in-activated listings for ${shop.shop_domain}`);

                            for (const listing of recentInactives) {
                                const lId = listing.listing_id.toString();
                                const { data: matchedItem } = await supabase
                                    .from('inventory_items')
                                    .select('shopify_product_id')
                                    .eq('shop_id', shop.id)
                                    .eq('etsy_listing_id', lId)
                                    .maybeSingle();

                                if (matchedItem?.shopify_product_id) {
                                    console.log(`[Etsy Products Cron] Auto-Archiving Shopify Product ${matchedItem.shopify_product_id} (Etsy ${lId} Inactive)`);
                                    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
                                    try {
                                        await shopifyApi.updateProduct(creds, matchedItem.shopify_product_id, {
                                            id: matchedItem.shopify_product_id,
                                            status: 'archived'
                                        });
                                        await supabase.from('sync_logs').insert({
                                            shop_id: shop.id,
                                            source: 'etsy',
                                            direction: 'etsy_to_shopify',
                                            event_type: 'product_delete',
                                            status: 'success',
                                            metadata: { etsy_listing_id: lId, shopify_product_id: matchedItem.shopify_product_id, action: 'archived' },
                                            created_at: new Date().toISOString()
                                        });
                                    } catch (err: any) {
                                        console.error(`[Etsy Products Cron] Failed to archive ${matchedItem.shopify_product_id}:`, err);
                                        await supabase.from('sync_logs').insert({
                                            shop_id: shop.id,
                                            source: 'etsy',
                                            direction: 'etsy_to_shopify',
                                            event_type: 'product_delete',
                                            status: 'failed',
                                            error_message: err.message,
                                            metadata: { etsy_listing_id: lId, shopify_product_id: matchedItem.shopify_product_id },
                                            created_at: new Date().toISOString()
                                        });
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`[Etsy Products Cron] Deactivation sync failed:`, e);
                    }
                }
                processedCount++;

            } catch (shopErr) {
                console.error(`[Etsy Products Cron] Error processing shop ${shop.shop_domain}:`, shopErr);
            }
        }

        return NextResponse.json({ success: true, processed: processedCount });
    } catch (e: any) {
        console.error('[Etsy Products Cron] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
