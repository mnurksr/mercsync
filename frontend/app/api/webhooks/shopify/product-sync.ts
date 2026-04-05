import { SupabaseClient } from '@supabase/supabase-js';
import * as etsyApi from '../../sync/lib/etsy';
import { calculatePrice } from '../../sync/price-sync';

// ─── Sync Logger ─────────────────────────────
async function logSyncEvent(
    supabase: SupabaseClient,
    shopId: string,
    eventType: 'product_create' | 'product_update' | 'product_delete',
    status: 'success' | 'failed' | 'skipped',
    metadata: Record<string, any>,
    errorMessage?: string
) {
    try {
        await supabase.from('sync_logs').insert({
            shop_id: shopId,
            source: 'shopify',
            direction: 'shopify_to_etsy',
            event_type: eventType,
            status,
            error_message: errorMessage || null,
            metadata,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.error('[ProductSync] Failed to write sync log:', e);
    }
}

export async function handleProductSync(payload: any, topic: 'products/create' | 'products/update' | 'products/delete', shopDomain: string, supabase: SupabaseClient) {
    console.log(`[ProductSync] Handling ${topic} for shop ${shopDomain}`);

    try {
        // 1. Get the shop
        const { data: shop } = await supabase
            .from('shops')
            .select('id, owner_id, etsy_shop_id, etsy_access_token')
            .eq('shop_domain', shopDomain)
            .maybeSingle();

        if (!shop || !shop.etsy_shop_id || !shop.etsy_access_token) {
            console.log(`[ProductSync] Shop not found or not connected to Etsy`);
            return { status: 'skipped', message: 'Shop not ready for sync' };
        }

        // 2. Get shop settings
        const { data: settings } = await supabase
            .from('shop_settings')
            .select('auto_create_products, auto_update_products, auto_delete_products, sync_direction, price_rules')
            .eq('shop_id', shop.id)
            .maybeSingle();

        if (!settings) {
            console.log(`[ProductSync] Settings not found for shop`);
            return { status: 'skipped', message: 'No settings' };
        }

        const canSyncToEtsy = settings.sync_direction === 'bidirectional' || settings.sync_direction === 'shopify_to_etsy';
        if (!canSyncToEtsy) {
            return { status: 'skipped', message: 'Sync direction prevents Shopify -> Etsy pushes' };
        }

        const productId = payload.id?.toString();
        const productTitle = payload.title || 'Unknown Product';
        if (!productId) return { status: 'error', message: 'No product ID in payload' };

        // --- HANDLE DELETE ---
        if (topic === 'products/delete') {
            if (!settings.auto_delete_products) {
                return { status: 'skipped', message: 'Auto-Delete disabled' };
            }

            const { data: matchedItems } = await supabase
                .from('inventory_items')
                .select('etsy_listing_id')
                .eq('shop_id', shop.id)
                .eq('shopify_product_id', productId)
                .not('etsy_listing_id', 'is', null);

            if (matchedItems && matchedItems.length > 0) {
                for (const item of matchedItems) {
                    try {
                        if (item.etsy_listing_id) {
                            console.log(`[ProductSync] Auto-Deleting Etsy Listing ${item.etsy_listing_id}`);
                            await etsyApi.deleteListing(item.etsy_listing_id, shop.etsy_access_token);
                            await logSyncEvent(supabase, shop.id, 'product_delete', 'success', {
                                shopify_product_id: productId,
                                etsy_listing_id: item.etsy_listing_id,
                                title: productTitle
                            });
                        }
                    } catch (e: any) {
                        console.error(`[ProductSync] Failed to delete Etsy listing ${item.etsy_listing_id}:`, e);
                        await logSyncEvent(supabase, shop.id, 'product_delete', 'failed', {
                            shopify_product_id: productId,
                            etsy_listing_id: item.etsy_listing_id,
                            title: productTitle
                        }, e.message);
                    }
                }
            }
            return { status: 'success', message: 'Delete processed' };
        }

        // --- HANDLE CREATE / UPDATE ---
        const isUpdate = topic === 'products/update';

        if (!isUpdate && !settings.auto_create_products) {
            return { status: 'skipped', message: 'Auto-Create disabled' };
        }

        if (isUpdate && !settings.auto_update_products) {
            return { status: 'skipped', message: 'Auto-Update disabled' };
        }

        // For Create/Update, we need the product details to push
        const title = payload.title;
        const description = payload.body_html || '';
        const tags = payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [];
        const variant = payload.variants?.[0]; // Simplified for MVP: take first variant
        if (!variant) return { status: 'skipped', message: 'No variants found' };

        // Apply price rules if enabled
        let finalPrice = parseFloat(variant.price);
        const calculatedPrice = calculatePrice(finalPrice, settings.price_rules, 'etsy');
        if (calculatedPrice !== null) {
            finalPrice = calculatedPrice;
        }

        // Check if item is already matched
        const { data: matchedItem } = await supabase
            .from('inventory_items')
            .select('etsy_listing_id')
            .eq('shop_id', shop.id)
            .eq('shopify_product_id', productId)
            .maybeSingle();

        if (isUpdate) {
            // Only update IF we have a match
            if (matchedItem?.etsy_listing_id) {
                console.log(`[ProductSync] Auto-Updating Etsy Listing ${matchedItem.etsy_listing_id}`);
                try {
                    await etsyApi.updateListing(shop.etsy_shop_id, matchedItem.etsy_listing_id.toString(), shop.etsy_access_token, {
                        title: title.substring(0, 140),
                        description: description.replace(/<[^>]*>?/gm, '').substring(0, 5000) || title,
                        price: finalPrice,
                        who_made: 'i_did',
                        when_made: '2020_2026',
                        is_supply: false
                    });
                    await logSyncEvent(supabase, shop.id, 'product_update', 'success', {
                        shopify_product_id: productId,
                        etsy_listing_id: matchedItem.etsy_listing_id,
                        title: productTitle,
                        price: finalPrice
                    });
                    return { status: 'success', message: 'Etsy listing updated' };
                } catch (e: any) {
                    console.error('[ProductSync] Update failed', e);
                    await logSyncEvent(supabase, shop.id, 'product_update', 'failed', {
                        shopify_product_id: productId,
                        etsy_listing_id: matchedItem.etsy_listing_id,
                        title: productTitle
                    }, e.message);
                    return { status: 'error', message: 'Update failed' };
                }
            } else {
                return { status: 'skipped', message: 'No mapping found for update' };
            }
        } else {
            // Create -> Auto Create Flow (Clone logic)
            if (matchedItem?.etsy_listing_id) {
                return { status: 'skipped', message: 'Product already mapped' };
            }

            console.log(`[ProductSync] Auto-Creating Etsy Draft Listing for ${productId}`);
            try {
                // We use createListing with minimum payload
                const draft = await etsyApi.createListing(shop.etsy_shop_id, shop.etsy_access_token, {
                    title: title.substring(0, 140),
                    description: description.replace(/<[^>]*>?/gm, '').substring(0, 5000) || title,
                    price: finalPrice,
                    quantity: variant.inventory_quantity || 1,
                    who_made: 'i_did',
                    when_made: '2020_2026',
                    is_supply: false,
                    taxonomy_id: 1 // Default accessory/other, will need mapping for prod
                });

                if (draft?.listing_id) {
                    // Save matching record
                    await supabase.from('inventory_items').insert({
                        shop_id: shop.id,
                        shopify_product_id: productId,
                        shopify_variant_id: variant.id.toString(),
                        shopify_inventory_item_id: variant.inventory_item_id.toString(),
                        etsy_listing_id: draft.listing_id.toString(),
                        sku: variant.sku || `SKU-${productId}`,
                        name: title,
                        master_stock: variant.inventory_quantity || 0,
                        shopify_stock_snapshot: variant.inventory_quantity || 0,
                        etsy_stock_snapshot: variant.inventory_quantity || 0,
                        status: 'Matching'
                    });
                    await logSyncEvent(supabase, shop.id, 'product_create', 'success', {
                        shopify_product_id: productId,
                        etsy_listing_id: draft.listing_id.toString(),
                        title: productTitle,
                        price: finalPrice,
                        stock: variant.inventory_quantity || 0
                    });
                    return { status: 'success', message: 'Etsy listing drafted and mapped' };
                }
            } catch (e: any) {
                console.error('[ProductSync] Create failed', e);
                await logSyncEvent(supabase, shop.id, 'product_create', 'failed', {
                    shopify_product_id: productId,
                    title: productTitle
                }, e.message);
                return { status: 'error', message: `Create failed: ${e.message}` };
            }
        }

        return { status: 'success', message: 'Done' };
    } catch (e: any) {
        console.error(`[ProductSync] Error handling ${topic}:`, e);
        return { status: 'error', message: e.message };
    }
}
