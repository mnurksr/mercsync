/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { validateWebhookHMAC } from '../../../auth/shopify/utils';
import { createAdminClient } from '@/utils/supabase/admin';
import { handleInventoryUpdate, handleShopifyOrder } from '../inventory-sync';
import { handlePriceUpdate } from '../../../sync/price-sync';
import { scrubShopAfterUninstall } from '../cleanup';

export async function POST(req: NextRequest) {
    const supabase = createAdminClient();
    try {
        const hmac = req.headers.get('x-shopify-hmac-sha256');
        const topic = req.headers.get('x-shopify-topic');
        const shop = req.headers.get('x-shopify-shop-domain');

        if (!hmac || !topic || !shop) {
            return new Response('Missing headers', { status: 400 });
        }

        const rawBody = await req.text();
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

        if (!clientSecret) {
            console.error('[Shopify Webhook] SHOPIFY_CLIENT_SECRET not configured');
            return new Response('Secret not configured', { status: 500 });
        }

        const isValid = validateWebhookHMAC(rawBody, hmac, clientSecret);
        if (!isValid) {
            console.warn('[Shopify Webhook] HMAC validation failed');
            return new Response('Unauthorized', { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        console.log(`[Shopify Webhook] Received topic ${topic} from ${shop}`);

        // Handle specific topics
        switch (topic) {
            case 'app/uninstalled':
                console.log(`[Shopify Webhook] App uninstalled for ${shop}`);
                {
                    const cleanupResult = await scrubShopAfterUninstall(supabase, shop, '[Shopify Webhook]');
                    if (!cleanupResult.ok) {
                        console.error(`[Shopify Webhook] Uninstall cleanup failed for ${shop}:`, cleanupResult.errors);
                        return new Response('Cleanup failed', { status: 500 });
                    }
                }
                break;

            case 'shop/update':
                // Update shop details if needed
                break;

            case 'products/create':
            case 'products/update':
                console.log(`[Shopify Webhook] Product ${topic} for ${shop}: ${payload.id}`);

                // Update staging table and inventory names
                const { data: theShopData } = await supabase.from('shops').select('id').eq('shop_domain', shop).maybeSingle();
                if (theShopData && payload.id) {
                    // (Status and product_title have been moved into the variant loop below for guaranteed targeting)
                    
                    // Update inventory_items name/image/sku at variant level
                    const variants = payload.variants || [];
                    const imageUrl = payload.images?.[0]?.src || null;
                    let hasActualPriceChange = false;

                    if (topic === 'products/update' && variants.length > 0) {
                        const variantIds = variants.map((v: any) => v.id?.toString()).filter(Boolean);
                        const { data: stagingVariants } = await supabase
                            .from('staging_shopify_products')
                            .select('shopify_variant_id, price')
                            .eq('shop_id', theShopData.id)
                            .in('shopify_variant_id', variantIds);

                        const previousPriceMap = new Map<string, number>();
                        for (const row of stagingVariants || []) {
                            previousPriceMap.set(row.shopify_variant_id?.toString(), Number(row.price || 0));
                        }

                        hasActualPriceChange = variants.some((v: any) => {
                            const variantId = v.id?.toString();
                            if (!variantId || !previousPriceMap.has(variantId)) return false;
                            const previousPrice = previousPriceMap.get(variantId) || 0;
                            const incomingPrice = Number(v.price || 0);
                            return Math.abs(previousPrice - incomingPrice) > 0.009;
                        });
                    }
                    
                    for (const v of variants) {
                        const variantTitlePart = v.title === 'Default Title' ? '' : ` - ${v.title}`;
                        const fullName = `${payload.title || ''}${variantTitlePart}`;
                        const variantSku = v.sku || 'NO-SKU';
                        
                        await supabase
                            .from('inventory_items')
                            .update({
                                name: fullName,
                                sku: variantSku,
                                ...(imageUrl ? { image_url: imageUrl } : {}),
                                updated_at: new Date().toISOString()
                            })
                            .eq('shop_id', theShopData.id)
                            .eq('shopify_variant_id', v.id.toString());
                            
                        // Also proactively update variant specific info in staging
                        await supabase
                            .from('staging_shopify_products')
                            .update({
                                name: fullName,
                                variant_title: v.title,
                                sku: variantSku,
                                price: parseFloat(v.price) || 0,
                                status: payload.status || 'draft',
                                product_title: payload.title || '',
                                updated_at: new Date().toISOString()
                            })
                            .eq('shop_id', theShopData.id)
                            .eq('shopify_variant_id', v.id.toString());
                    }

                    if (topic === 'products/update' && hasActualPriceChange) {
                        handlePriceUpdate(payload, shop, supabase).then((result: any) => {
                            console.log(`[Shopify Webhook] Price sync result: ${result.status} — ${result.message}`);
                        }).catch((err: any) => {
                            console.error(`[Shopify Webhook] Price sync error:`, err);
                        });
                    }
                }
                break;

            case 'products/delete':
                console.log(`[Shopify Webhook] Product deleted on Shopify: ${payload.id}`);
                
                // Find shop to get ID
                const { data: deleteShop } = await supabase.from('shops').select('id').eq('shop_domain', shop).maybeSingle();
                
                if (deleteShop) {
                    const productId = payload.id.toString();
                    
                    // First get the variant IDs associated with this product
                    const { data: linkedItems } = await supabase
                        .from('inventory_items')
                        .select('shopify_variant_id')
                        .eq('shop_id', deleteShop.id)
                        .eq('shopify_product_id', productId);
                        
                    const variantIds = linkedItems?.map(i => i.shopify_variant_id).filter(Boolean) || [];
                    
                    // Remove from staging
                    await supabase
                        .from('staging_shopify_products')
                        .delete()
                        .eq('shop_id', deleteShop.id)
                        .eq('shopify_product_id', productId);
                    
                    // Unlink from inventory_items instead of delete to make it Etsy-only
                    await supabase
                        .from('inventory_items')
                        .update({
                            shopify_product_id: null,
                            shopify_variant_id: null,
                            shopify_inventory_item_id: null,
                            master_stock: 0,
                            shopify_stock_snapshot: 0,
                            status: 'Matching', // It's no longer matched
                            updated_at: new Date().toISOString()
                        })
                        .eq('shop_id', deleteShop.id)
                        .eq('shopify_product_id', productId);
                        
                    // Unlink pointers in staging_etsy_products using the known variant IDs
                    // staging_etsy_products only has shopify_variant_id, not shopify_product_id
                    if (variantIds.length > 0) {
                        const { error: unlinkErr } = await supabase
                            .from('staging_etsy_products')
                            .update({ shopify_variant_id: null })
                            .eq('shop_id', deleteShop.id)
                            .in('shopify_variant_id', variantIds);
                            
                        if (unlinkErr) console.error(`[Shopify Webhook] Unlink staging_etsy_products error:`, unlinkErr.message);
                    }

                    console.log(`[Shopify Webhook] Unlinked DB records for deleted product ${productId}`);
                }
                break;

            case 'orders/create':
                console.log(`[Shopify Webhook] Order ${topic} for ${shop}: ${payload.id}`);
                handleShopifyOrder(payload, shop, supabase).then(result => {
                    console.log(`[Shopify Webhook] Order sync result: ${result.status} — ${result.message}`);
                }).catch((err: any) => {
                    console.error(`[Shopify Webhook] Order sync error:`, err);
                });
                break;

            case 'orders/updated':
                console.log(`[Shopify Webhook] Ignoring ${topic} for ${shop}: ${payload.id}`);
                break;

            case 'inventory_levels/update':
                console.log(`[Shopify Webhook] Inventory update for ${shop}: item=${payload.inventory_item_id}, location=${payload.location_id}, available=${payload.available}`);
                
                // Fire-and-forget: don't block webhook response
                handleInventoryUpdate(payload, shop, supabase).then(result => {
                    console.log(`[Shopify Webhook] Inventory sync result: ${result.status} — ${result.message}`);
                }).catch(err => {
                    console.error(`[Shopify Webhook] Inventory sync error:`, err);
                });
                break;

            default:
                console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
        }

        // Always respond 200 quickly — Shopify retries if we're too slow
        return new Response('OK', { status: 200 });
    } catch (err: any) {
        console.error('[Shopify Webhook] Internal Error:', err);
        return new Response('Server Error', { status: 500 });
    }
}
