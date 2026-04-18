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

                // Fetch ALL active AND draft listings from Etsy
                const activeData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'active', 0, 100);
                const draftData = await etsyApi.getListingsByState(shop.etsy_shop_id, shop.etsy_access_token, 'draft', 0, 100);
                
                const allActiveListings = [...(activeData?.results || []), ...(draftData?.results || [])];
                
                // Collect all listing IDs that currently exist on Etsy (for deletion detection later)
                const etsyLiveListingIds = new Set(allActiveListings.map((l: any) => l.listing_id.toString()));

                // --- HANDLE UPDATES & CREATES ---
                const recentListings = allActiveListings.filter((l: any) => l.last_modified_timestamp >= timeThreshold);
                console.log(`[Etsy Products Cron] Found ${recentListings.length} modified listings (active+draft) for ${shop.shop_domain}`);

                for (const listing of recentListings) {
                    const listingId = listing.listing_id.toString();

                    // Extract base price from listing
                    const priceNode = listing.price;
                    const etsyBasePrice = priceNode?.amount ? (priceNode.amount / priceNode.divisor) : null;

                    // ── 1. Update staging_etsy_products ──
                    // The staging table is keyed per-variant (etsy_variant_id), but we get listing-level data.
                    // Use .update() by etsy_listing_id to update ALL variant rows for this listing.
                    const stagingUpdate: any = {
                        name: listing.title || '',
                        product_title: listing.title || '',
                        status: listing.state || 'active',
                        updated_at: new Date().toISOString(),
                    };
                    if (etsyBasePrice !== null) stagingUpdate.price = etsyBasePrice;
                    if (listing.skus && listing.skus.length > 0) stagingUpdate.sku = listing.skus[0];
                    if (listing.quantity !== undefined) stagingUpdate.stock_quantity = listing.quantity;
                    if (listing.description !== undefined) stagingUpdate.description = listing.description;

                    const { error: stagingErr } = await supabase
                        .from('staging_etsy_products')
                        .update(stagingUpdate)
                        .eq('shop_id', shop.id)
                        .eq('etsy_listing_id', listingId);

                    if (stagingErr) {
                        console.error(`[Etsy Products Cron] Staging update error for ${listingId}:`, stagingErr.message);
                    }

                    // ── 2. Update inventory_items ──
                    // Match with DB — fetch fields for smarter updates
                    const { data: matchedItems } = await supabase
                        .from('inventory_items')
                        .select('id, shopify_product_id, shopify_variant_id, last_synced_etsy_price, etsy_stock_snapshot')
                        .eq('shop_id', shop.id)
                        .eq('etsy_listing_id', listingId);

                    if (matchedItems && matchedItems.length > 0) {
                        for (const matched of matchedItems) {
                            const invUpdate: any = {
                                updated_at: new Date().toISOString(),
                                etsy_updated_at: new Date().toISOString()
                            };

                            // Only update name if Etsy-only (Shopify is master for name on matched items)
                            if (!matched.shopify_product_id) {
                                invUpdate.name = listing.title;
                            }

                            // Update etsy_stock_snapshot if stock changed
                            if (listing.quantity !== undefined) {
                                const currentSnapshot = matched.etsy_stock_snapshot || 0;
                                if (currentSnapshot !== listing.quantity) {
                                    invUpdate.etsy_stock_snapshot = listing.quantity;
                                    console.log(`[Etsy Products Cron] Stock changed for listing ${listingId}: ${currentSnapshot} → ${listing.quantity}`);
                                }
                            }

                            await supabase
                                .from('inventory_items')
                                .update(invUpdate)
                                .eq('id', matched.id);

                            // ── 3. Price Sync: Etsy → Shopify (with ping-pong protection) ──
                            if (matched.shopify_variant_id && price_sync_enabled && etsyBasePrice !== null) {
                                const lastSyncedPrice = matched.last_synced_etsy_price ? parseFloat(matched.last_synced_etsy_price) : null;

                                // GUARD: If Etsy price matches what WE last pushed → skip
                                if (lastSyncedPrice !== null && Math.abs(lastSyncedPrice - etsyBasePrice) < 0.02) {
                                    console.log(`[Etsy Products Cron] Price unchanged from our sync (${etsyBasePrice} ≈ ${lastSyncedPrice}). Skipping for listing ${listingId}.`);
                                    continue;
                                }

                                // Genuine change. Calculate and push to Shopify.
                                const hasShopifyRule = shopifyPriceRules.some((r: any) => r.platform === 'shopify');
                                const newPrice = hasShopifyRule 
                                    ? calculatePrice(etsyBasePrice, shopifyPriceRules, 'shopify') || etsyBasePrice 
                                    : etsyBasePrice;

                                if (newPrice) {
                                    try {
                                        console.log(`[Etsy Products Cron] Manual Etsy price change detected! Syncing to Shopify variant ${matched.shopify_variant_id}: ${etsyBasePrice} → ${newPrice}`);
                                        const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

                                        await shopifyApi.updateVariant(creds, matched.shopify_variant_id, {
                                            id: matched.shopify_variant_id,
                                            price: newPrice.toString()
                                        });

                                        // CRITICAL: Save what we pushed TO Shopify so Shopify webhook won't bounce it back
                                        await supabase.from('inventory_items').update({
                                            last_synced_shopify_price: newPrice
                                        }).eq('id', matched.id);

                                        await supabase.from('sync_logs').insert({
                                            shop_id: shop.id,
                                            source: 'etsy',
                                            direction: 'etsy_to_shopify',
                                            event_type: 'price_update',
                                            status: 'success',
                                            metadata: { etsy_listing_id: listingId, shopify_variant_id: matched.shopify_variant_id, old_price: etsyBasePrice, new_price: newPrice },
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
                                    }
                                }
                            }
                        }
                    }
                }

                // --- HANDLE DELETED PRODUCTS (not just inactive) ---
                // Compare our staging table against what Etsy actually has.
                // If a listing is in our staging but NOT in Etsy's live listings, it was deleted.
                try {
                    const { data: ourStagingRows } = await supabase
                        .from('staging_etsy_products')
                        .select('etsy_listing_id')
                        .eq('shop_id', shop.id);

                    if (ourStagingRows && ourStagingRows.length > 0) {
                        // Find unique listing IDs in our staging that are NOT in Etsy's live set
                        const ourListingIds = [...new Set(ourStagingRows.map(r => r.etsy_listing_id))];
                        const deletedIds = ourListingIds.filter(id => !etsyLiveListingIds.has(id));

                        if (deletedIds.length > 0) {
                            console.log(`[Etsy Products Cron] Found ${deletedIds.length} deleted/missing listings: ${deletedIds.join(', ')}`);

                            for (const deletedId of deletedIds) {
                                // Also check inactive state before assuming deletion
                                // (might just be deactivated, which we handle the same way)

                                // Remove from staging
                                await supabase
                                    .from('staging_etsy_products')
                                    .delete()
                                    .eq('shop_id', shop.id)
                                    .eq('etsy_listing_id', deletedId);

                                // Unlink from inventory_items
                                const { data: linkedItems } = await supabase
                                    .from('inventory_items')
                                    .select('id, shopify_variant_id, etsy_variant_id')
                                    .eq('shop_id', shop.id)
                                    .eq('etsy_listing_id', deletedId);

                                if (linkedItems && linkedItems.length > 0) {
                                    for (const linkedItem of linkedItems) {
                                        await supabase
                                            .from('inventory_items')
                                            .update({
                                                etsy_listing_id: null,
                                                etsy_variant_id: null,
                                                master_stock: 0,
                                                etsy_stock_snapshot: 0,
                                                status: linkedItem.shopify_variant_id ? 'Matching' : 'Action Required',
                                                updated_at: new Date().toISOString()
                                            })
                                            .eq('id', linkedItem.id);

                                        // Clear cross-platform pointers in shopify staging
                                        // staging_shopify_products uses shopify_variant_id as key, NOT etsy_listing_id
                                        if (linkedItem.shopify_variant_id) {
                                            await supabase
                                                .from('staging_shopify_products')
                                                .update({ etsy_variant_id: null })
                                                .eq('shop_id', shop.id)
                                                .eq('shopify_variant_id', linkedItem.shopify_variant_id);
                                        }

                                        console.log(`[Etsy Products Cron] ✅ Unlinked deleted Etsy listing ${deletedId} (variant ${linkedItem.etsy_variant_id})`);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Etsy Products Cron] Deletion detection failed:`, e);
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
