import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as etsyApi from '../../sync/lib/etsy';
import * as shopifyApi from '../../sync/lib/shopify';
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
                    price_sync_enabled,
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

            const { price_sync_enabled, price_rules } = settings;
            const shopifyPriceRules = price_rules || [];

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

                        // 1. Update DB staging tables and inventory names
                        const stagingPayload = {
                            shop_id: shop.id,
                            etsy_listing_id: listingId,
                            title: listing.title || '',
                            status: listing.state || 'active',
                            updated_at: new Date().toISOString(),
                            raw_data: listing
                        };
                        
                        await supabase
                            .from('staging_etsy_products')
                            .upsert(stagingPayload, { onConflict: 'shop_id, etsy_listing_id' });

                        // Update inventory_items name if changed (only if it doesn't have a Shopify mapping, as Shopify is usually master for name. We'll skip for now or just trust Shopify. Wait, Etsy name might be useful. We'll leave inventory_items alone unless it's strictly Etsy only, but safe to just update it if there's no Shopify ID.)
                        if (!matched?.shopify_product_id) {
                             await supabase
                                .from('inventory_items')
                                .update({ name: listing.title, updated_at: new Date().toISOString() })
                                .eq('shop_id', shop.id)
                                .eq('etsy_listing_id', listingId)
                                .is('shopify_product_id', null);
                        }

                        if (matched && matched.shopify_variant_id && price_sync_enabled) {
                            // Price sync (Title and description changes are NOT auto-synced to opposite platform)
                            const priceNode = listing.price;
                            const basePrice = priceNode?.amount ? (priceNode.amount / priceNode.divisor) : null;
                            const newPrice = basePrice ? calculatePrice(basePrice, shopifyPriceRules, 'shopify') || basePrice : null;

                            if (newPrice) {
                                try {
                                    console.log(`[Etsy Products Cron] Auto-Updating price on Shopify variant ${matched.shopify_variant_id} from Etsy ${listingId} (${basePrice} → ${newPrice})`);
                                    
                                    // TEMPORARILY DISABLED: To prevent infinite price loop ping-pong!
                                    // When Shopify syncs to Etsy, Etsy's last_modified updates. This cron then saw the new Etsy price
                                    // and pushed it BACK to Shopify, creating a never-ending loop of price changes due to rule calculations.
                                    // We will implement a proper "last_synced_hash" or disable bidirectional price sync to solve this cleanly.
                                    
                                    /*
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
                                    */
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
                                }
                            }
                        }
                    }
                }

                // --- HANDLE PRODUCT DEACTIVATION (ETSY INACTIVE/DELETED) ---
                try {
                        const inactiveData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'inactive', 0, 100);
                        if (inactiveData?.results?.length > 0) {
                            const recentInactives = inactiveData.results.filter((l: any) => l.last_modified_timestamp >= timeThreshold);
                            console.log(`[Etsy Products Cron] Found ${recentInactives.length} recently in-activated listings for ${shop.shop_domain}`);

                            for (const listing of recentInactives) {
                                const lId = listing.listing_id.toString();
                                
                                // Update staging state
                                await supabase
                                    .from('staging_etsy_products')
                                    .update({ status: 'inactive' })
                                    .eq('shop_id', shop.id)
                                    .eq('etsy_listing_id', lId);

                                const { data: matchedItem } = await supabase
                                    .from('inventory_items')
                                    .select('id, shopify_product_id')
                                    .eq('shop_id', shop.id)
                                    .eq('etsy_listing_id', lId)
                                    .maybeSingle();

                                if (matchedItem?.id) {
                                    console.log(`[Etsy Products Cron] Unlinking Etsy Listing ${lId} (Inactive)`);
                                    try {
                                        await supabase
                                            .from('inventory_items')
                                            .update({
                                                etsy_listing_id: null,
                                                etsy_variant_id: null,
                                                master_stock: 0,
                                                etsy_stock_snapshot: 0,
                                                status: 'Matching', // Unlinked from this side
                                                updated_at: new Date().toISOString()
                                            })
                                            .eq('id', matchedItem.id);

                                        // Unlink pointers in staging_shopify_products
                                        await supabase
                                            .from('staging_shopify_products')
                                            .update({ etsy_listing_id: null, etsy_variant_id: null })
                                            .eq('shop_id', shop.id)
                                            .eq('etsy_listing_id', lId);

                                    } catch (err: any) {
                                        console.error(`[Etsy Products Cron] Failed to unlink ${lId}:`, err);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`[Etsy Products Cron] Deactivation sync failed:`, e);
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
