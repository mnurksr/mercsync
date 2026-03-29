import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
import { cloneToShopify } from '../../sync/lib/processor';

export const maxDuration = 300; // Allows up to 5 mins execution

export async function GET(req: NextRequest) {
    // 1. Validate Cron Secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
                    auto_delete_products
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

            const { auto_create_products, auto_update_products, auto_delete_products } = settings;
            if (!auto_create_products && !auto_update_products && !auto_delete_products) continue;

            console.log(`[Etsy Products Cron] Processing shop ${shop.shop_domain} (${shop.etsy_shop_id})`);

            try {
                // Determine timestamps: fetch last 2 hours to be safe against overlaps
                const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60);

                // We can't query by last_modified_tsz easily in standard getListingsByState without search params, 
                // but for MVP we will pull the first page of active listings and filter. 
                // In production we should use the Receipt or precise search endpoints, or store a high-water mark.
                // --- HANDLE UPDATES & CREATES (ACTIVE) ---
                const etsyData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'active', 0, 100);
                
                if (etsyData && etsyData.results) {
                    const recentListings = etsyData.results.filter((l: any) => l.last_modified_timestamp >= twoHoursAgo);
                    console.log(`[Etsy Products Cron] Found ${recentListings.length} modified active listings for ${shop.shop_domain}`);

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
                            try {
                                console.log(`[Etsy Products Cron] Auto-Updating Shopify Product ${matched.shopify_product_id} from Etsy ${listingId}`);
                                const priceNode = listing.price;
                                const newPrice = priceNode?.amount ? (priceNode.amount / priceNode.divisor).toString() : null;
                                const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

                                await shopifyApi.updateProduct(creds, matched.shopify_product_id, {
                                    id: matched.shopify_product_id,
                                    title: listing.title,
                                    body_html: listing.description
                                });

                                if (newPrice) {
                                    await shopifyApi.updateVariant(creds, matched.shopify_variant_id, {
                                        id: matched.shopify_variant_id,
                                        price: newPrice
                                    });
                                }
                            } catch(e) {
                                console.error(`[Etsy Products Cron] Failed to update Shopify Product ${matched.shopify_product_id}:`, e);
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
                                    }]
                                };
                                await cloneToShopify(shop, cloneProduct, 'cron-job');
                            } catch(e) {
                                console.error(`[Etsy Products Cron] Failed to create Shopify Product for Etsy ${listingId}:`, e);
                            }
                        }
                    }
                }

                // --- HANDLE PRODUCT DEACTIVATION (ETSY -> SHOPIFY) ---
                if (auto_delete_products) {
                    try {
                        const inactiveData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'inactive', 0, 100);
                        if (inactiveData?.results?.length > 0) {
                            const recentInactives = inactiveData.results.filter((l: any) => l.last_modified_timestamp >= twoHoursAgo);
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
                                    } catch (err) {
                                        console.error(`[Etsy Products Cron] Failed to archive ${matchedItem.shopify_product_id}:`, err);
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
