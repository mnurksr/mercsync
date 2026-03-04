/**
 * Main Sync Processor
 * Replaces ALL 3 n8n sub-workflows:
 * - Sync Stocks
 * - Clone to Shopify
 * - Clone to Etsy
 */

import { createAdminClient } from '@/utils/supabase/admin';
import * as shopifyApi from './shopify';
import * as etsyApi from './etsy';
import { sendLog, sendStockSync, sendProductClone, markCompleted, markFailed } from './progress';

const supabase = createAdminClient();

// Delay helper (rate limiting)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type StockUpdate = {
    platform: 'shopify' | 'etsy';
    item_id: string;
    product_id: string;
    new_stock: number;
    sku: string;
    title: string;
};

type CloneProduct = {
    source_id: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    image: string;
    description?: string;
    variants: {
        source_variant_id: string;
        title: string;
        sku: string;
        price: number;
        stock: number;
        selected: boolean;
    }[];
};

type SyncPayload = {
    user_id: string;
    job_id: string;
    initial_state: any;
    final_state: any;
    timestamp: string;
};

type ParsedPayload = {
    job_id: string;
    user_id: string;
    stockUpdates: StockUpdate[];
    toShopify: CloneProduct[];
    toEtsy: CloneProduct[];
};

// ─────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────

export async function processSync(payload: SyncPayload) {
    const { job_id, user_id } = payload;

    try {
        // 1. Parse the payload (same logic as "Parse & Prepare Data1" in n8n)
        const parsed = parsePayload(payload);
        const totalSteps = parsed.stockUpdates.length + parsed.toShopify.length + parsed.toEtsy.length;

        console.log(`[Sync] Starting job ${job_id}: ${parsed.stockUpdates.length} stock updates, ${parsed.toShopify.length} to Shopify, ${parsed.toEtsy.length} to Etsy`);

        // 2. Get shop info from DB
        const { data: shop } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', user_id)
            .maybeSingle();

        if (!shop) {
            await markFailed(job_id, 'Shop not found');
            return;
        }

        await sendLog(job_id, 'Data analyzed. Starting sync...', 0, 100);

        let completedSteps = 0;

        // ── Phase 1: Sync Stocks ──
        if (parsed.stockUpdates.length > 0) {
            await sendLog(job_id, `Processing ${parsed.stockUpdates.length} stock updates...`, 5, 100);

            for (const update of parsed.stockUpdates) {
                try {
                    if (update.platform === 'shopify') {
                        await syncShopifyStock(shop, update);
                    } else {
                        await syncEtsyStock(shop, update, parsed.stockUpdates);
                    }

                    completedSteps++;
                    const progress = Math.round((completedSteps / totalSteps) * 40); // stocks = 0-40%

                    await sendStockSync(
                        job_id,
                        update.platform,
                        update.title,
                        0, // old stock unknown here
                        update.new_stock,
                        progress,
                        100,
                        update.sku
                    );
                } catch (err: any) {
                    console.error(`[Sync] Stock update failed for ${update.title}:`, err.message);
                    // Continue with next item — don't break the loop
                }

                await delay(1000); // Rate limiting
            }

            await sendLog(job_id, 'Stock sync completed ✓', 40, 100);
        }

        // ── Phase 2: Clone to Shopify ──
        if (parsed.toShopify.length > 0) {
            await sendLog(job_id, `Cloning ${parsed.toShopify.length} products to Shopify...`, 41, 100);

            for (let i = 0; i < parsed.toShopify.length; i++) {
                const product = parsed.toShopify[i];
                try {
                    await cloneToShopify(shop, product, job_id);

                    completedSteps++;
                    const progress = 40 + Math.round(((i + 1) / parsed.toShopify.length) * 30); // shopify = 40-70%

                    await sendProductClone(job_id, 'to_shopify', {
                        name: product.title,
                        price: product.price,
                        stock: product.stock,
                        image: product.image,
                        sku: product.sku
                    }, 'success', 'Product cloned to Shopify successfully', progress, 100);

                } catch (err: any) {
                    console.error(`[Sync] Clone to Shopify failed for ${product.title}:`, err.message);

                    await sendProductClone(job_id, 'to_shopify', {
                        name: product.title,
                        price: product.price,
                        stock: product.stock,
                        image: product.image,
                        sku: product.sku
                    }, 'failed', `Error: ${err.message}`, 0, 100);
                }

                await delay(1000);
            }
        }

        // ── Phase 3: Clone to Etsy ──
        if (parsed.toEtsy.length > 0) {
            await sendLog(job_id, `Cloning ${parsed.toEtsy.length} products to Etsy...`, 71, 100);

            // Pre-fetch shipping profile & readiness state (once)
            let shippingProfileId: number | null = null;
            let readinessStateId: number | null = null;

            if (shop.etsy_shop_id && shop.etsy_access_token) {
                shippingProfileId = await etsyApi.getOrCreateShippingProfile(shop.etsy_shop_id, shop.etsy_access_token);
                readinessStateId = await etsyApi.getOrCreateReadinessState(shop.etsy_shop_id, shop.etsy_access_token);
            }

            for (let i = 0; i < parsed.toEtsy.length; i++) {
                const product = parsed.toEtsy[i];
                try {
                    await sendProductClone(job_id, 'to_etsy', {
                        name: product.title,
                        price: product.price,
                        stock: product.stock,
                        image: product.image,
                        sku: product.sku
                    }, 'cloning', 'Cloning product to Etsy...', 0, 100);

                    await cloneToEtsy(shop, product, shippingProfileId, readinessStateId);

                    completedSteps++;
                    const progress = 70 + Math.round(((i + 1) / parsed.toEtsy.length) * 28); // etsy = 70-98%

                    await sendProductClone(job_id, 'to_etsy', {
                        name: product.title,
                        price: product.price,
                        stock: product.stock,
                        image: product.image,
                        sku: product.sku
                    }, 'success', 'Product cloned to Etsy successfully', progress, 100);

                } catch (err: any) {
                    console.error(`[Sync] Clone to Etsy failed for ${product.title}:`, err.message);

                    await sendProductClone(job_id, 'to_etsy', {
                        name: product.title,
                        price: product.price,
                        stock: product.stock,
                        image: product.image,
                        sku: product.sku
                    }, 'failed', `Error: ${err.message}`, 0, 100);
                }

                await delay(1500); // Etsy rate limit is stricter
            }
        }

        // ── Done ──
        await markCompleted(job_id);
        console.log(`[Sync] Job ${job_id} completed successfully`);

    } catch (err: any) {
        console.error(`[Sync] Fatal error in job ${job_id}:`, err);
        await markFailed(job_id, err.message || 'Unknown error');
    }
}

// ─────────────────────────────────────────────
// Parse Payload (replaces "Parse & Prepare Data1")
// ─────────────────────────────────────────────

function parsePayload(payload: SyncPayload): ParsedPayload {
    const { job_id, user_id, initial_state, final_state } = payload;

    const initialMatched = initial_state?.matched_inventory || [];
    const finalMatched = final_state?.matched_inventory || [];

    const initialMap: Record<string, any> = {};
    initialMatched.forEach((item: any) => {
        initialMap[item.shopify_variant_id] = item;
    });

    const stockUpdates: StockUpdate[] = [];

    finalMatched.forEach((finalItem: any) => {
        const initItem = initialMap[finalItem.shopify_variant_id];
        if (initItem) {
            if (finalItem.shopify_stock !== initItem.shopify_stock) {
                stockUpdates.push({
                    platform: 'shopify',
                    item_id: finalItem.shopify_variant_id,
                    product_id: finalItem.shopify_id,
                    new_stock: finalItem.shopify_stock,
                    sku: finalItem.sku,
                    title: finalItem.title
                });
            }
            if (finalItem.etsy_stock !== initItem.etsy_stock) {
                stockUpdates.push({
                    platform: 'etsy',
                    item_id: finalItem.etsy_variant_id,
                    product_id: finalItem.etsy_id,
                    new_stock: finalItem.etsy_stock,
                    sku: finalItem.sku,
                    title: finalItem.title
                });
            }
        }
    });

    return {
        job_id,
        user_id,
        stockUpdates,
        toShopify: final_state?.queued_clones?.to_shopify || [],
        toEtsy: final_state?.queued_clones?.to_etsy || []
    };
}

// ─────────────────────────────────────────────
// Phase 1: Stock sync helpers
// ─────────────────────────────────────────────

async function syncShopifyStock(shop: any, update: StockUpdate) {
    // Get inventory_item_id from staging table
    const { data: stagingRow } = await supabase
        .from('staging_shopify_products')
        .select('shopify_inventory_item_id')
        .eq('shopify_variant_id', update.item_id)
        .eq('shop_id', shop.id)
        .maybeSingle();

    if (!stagingRow?.shopify_inventory_item_id) {
        throw new Error(`Shopify inventory item not found for variant ${update.item_id}`);
    }

    // Call Shopify API
    await shopifyApi.setInventoryLevel(
        { shopDomain: shop.shop_domain, accessToken: shop.access_token },
        shop.main_location_id,
        stagingRow.shopify_inventory_item_id,
        update.new_stock
    );

    // Update staging table
    await supabase
        .from('staging_shopify_products')
        .update({ stock_quantity: update.new_stock })
        .eq('shopify_variant_id', update.item_id);
}

async function syncEtsyStock(shop: any, update: StockUpdate, allUpdates: StockUpdate[]) {
    // Group all etsy updates for the same product_id
    const sameProductUpdates = allUpdates.filter(
        u => u.platform === 'etsy' && u.product_id === update.product_id
    );

    // Only process once per listing (skip if not the first variant of this listing)
    if (sameProductUpdates[0].item_id !== update.item_id) return;

    // Get Etsy access token
    const { data: stagingRow } = await supabase
        .from('staging_etsy_products')
        .select('*')
        .eq('etsy_variant_id', update.item_id)
        .maybeSingle();

    if (!stagingRow) {
        throw new Error(`Etsy product not found for variant ${update.item_id}`);
    }

    // 1. GET current inventory
    const currentInventory = await etsyApi.getInventory(update.product_id, shop.etsy_access_token);

    // 2. Merge new stock values
    const variantUpdates = sameProductUpdates.map(u => ({
        item_id: u.item_id,
        new_stock: u.new_stock
    }));

    const mergedPayload = etsyApi.mergeStockUpdate(currentInventory, variantUpdates);

    // 3. PUT updated inventory
    const result = await etsyApi.updateInventory(update.product_id, shop.etsy_access_token, mergedPayload);

    // 4. Update staging table for each variant
    if (result.products) {
        for (const product of result.products) {
            await supabase
                .from('staging_etsy_products')
                .update({ stock_quantity: product.offerings[0].quantity })
                .eq('etsy_variant_id', product.product_id.toString());
        }
    }
}

// ─────────────────────────────────────────────
// Phase 2: Clone to Shopify
// ─────────────────────────────────────────────

async function cloneToShopify(shop: any, product: CloneProduct, jobId: string) {
    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };

    // 1. Get source product from staging_etsy_products
    const { data: dbRows } = await supabase
        .from('staging_etsy_products')
        .select('*')
        .eq('etsy_listing_id', product.source_id);

    if (!dbRows || dbRows.length === 0) {
        throw new Error(`Source Etsy product not found: ${product.source_id}`);
    }

    // 2. Build Shopify product payload
    const { product: shopifyPayload, originalStocks } = shopifyApi.buildProductPayload(product, dbRows);

    // 3. Create product on Shopify
    const created = await shopifyApi.createProduct(creds, shopifyPayload);
    const shopifyProduct = created.product;

    // 4. Set inventory levels for each variant
    for (let i = 0; i < shopifyProduct.variants.length; i++) {
        const variant = shopifyProduct.variants[i];
        const stock = originalStocks[i] || 0;

        await delay(1000);

        try {
            await shopifyApi.setInventoryLevel(
                creds,
                shop.main_location_id,
                variant.inventory_item_id,
                stock
            );
        } catch (e: any) {
            console.warn(`[Sync] Failed to set stock for variant ${variant.id}:`, e.message);
        }
    }

    // 5. Insert into staging_shopify_products
    for (let i = 0; i < shopifyProduct.variants.length; i++) {
        const variant = shopifyProduct.variants[i];
        const stock = originalStocks[i] || 0;
        const locMap = shop.main_location_id
            ? [{ location_id: shop.main_location_id, available: stock }]
            : [];

        await supabase
            .from('staging_shopify_products')
            .upsert({
                shop_id: shop.id,
                shopify_product_id: shopifyProduct.id.toString(),
                shopify_variant_id: variant.id.toString(),
                shopify_inventory_item_id: variant.inventory_item_id.toString(),
                name: `${shopifyProduct.title} - ${variant.title}`,
                sku: variant.sku || null,
                price: parseFloat(variant.price || 0),
                image_url: shopifyProduct.images?.[0]?.src || null,
                status: shopifyProduct.status,
                stock_quantity: stock,
                product_title: shopifyProduct.title,
                variant_title: variant.title,
                description: shopifyProduct.body_html || '',
                location_inventory_map: JSON.stringify(locMap)
            }, { onConflict: 'shopify_inventory_item_id' });
    }
}

// ─────────────────────────────────────────────
// Phase 3: Clone to Etsy
// ─────────────────────────────────────────────

async function cloneToEtsy(
    shop: any,
    product: CloneProduct,
    shippingProfileId: number | null,
    readinessStateId: number | null
) {
    // 1. GET live Shopify product data
    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
    const liveData = await shopifyApi.getProduct(creds, product.source_id);
    const shopifyProduct = liveData.product;

    // 2. Get stock quantities from staging DB
    const { data: dbStocks } = await supabase
        .from('staging_shopify_products')
        .select('shopify_variant_id, stock_quantity')
        .eq('shopify_product_id', product.source_id);

    // 3. Build Etsy payloads
    const { listingPayload, inventoryPayload } = etsyApi.buildListingPayload(
        shopifyProduct,
        dbStocks || [],
        shippingProfileId,
        readinessStateId
    );

    // 4. Create listing on Etsy
    const etsyListing = await etsyApi.createListing(
        shop.etsy_shop_id,
        shop.etsy_access_token,
        listingPayload
    );

    // 5. Set inventory (variants + stock)
    const etsyInventory = await etsyApi.updateInventory(
        etsyListing.listing_id,
        shop.etsy_access_token,
        inventoryPayload
    );

    // 6. Upload images
    const images = shopifyProduct.images || [];
    const uploadedImages: any[] = [];

    for (const img of images.slice(0, 10)) {
        try {
            const imageBuffer = await etsyApi.downloadImage(img.src);
            if (imageBuffer) {
                const uploaded = await etsyApi.uploadImage(
                    shop.etsy_shop_id,
                    etsyListing.listing_id,
                    shop.etsy_access_token,
                    imageBuffer,
                    `image_${img.id}.jpg`
                );
                uploadedImages.push({ ...uploaded, shopify_image_id: img.id });
                await delay(500);
            }
        } catch (e: any) {
            console.warn(`[Sync] Failed to upload image:`, e.message);
        }
    }

    // 7. Set variation images (if variants have different images)
    if (uploadedImages.length > 0 && etsyInventory.products?.length > 1) {
        try {
            const imageMap: Record<string, number> = {};
            uploadedImages.forEach(u => {
                if (u.shopify_image_id) {
                    imageMap[u.shopify_image_id.toString()] = u.listing_image_id;
                }
            });

            const variationImages: { property_id: number; value_id: number; image_id: number }[] = [];
            const seenValues = new Set<number>();

            shopifyProduct.variants.forEach((variant: any) => {
                if (variant.image_id && imageMap[variant.image_id.toString()]) {
                    const sku = variant.sku || `SKU-${variant.id}`;
                    const etsyProduct = etsyInventory.products.find((p: any) => p.sku === sku);

                    if (etsyProduct?.property_values?.length > 0) {
                        const prop = etsyProduct.property_values[0];
                        const valueId = prop.value_ids[0];

                        if (!seenValues.has(valueId)) {
                            seenValues.add(valueId);
                            variationImages.push({
                                property_id: prop.property_id,
                                value_id: valueId,
                                image_id: imageMap[variant.image_id.toString()]
                            });
                        }
                    }
                }
            });

            if (variationImages.length > 0) {
                await etsyApi.setVariationImages(
                    shop.etsy_shop_id,
                    etsyListing.listing_id,
                    shop.etsy_access_token,
                    variationImages
                );
            }
        } catch (e: any) {
            console.warn(`[Sync] Variation images failed:`, e.message);
        }
    }

    // 8. Insert into staging_etsy_products
    const mainImageUrl = shopifyProduct.images?.[0]?.src || '';

    for (const etsyProduct of (etsyInventory.products || [])) {
        const offering = etsyProduct.offerings[0];
        const actualPrice = typeof offering.price === 'object'
            ? offering.price.amount / offering.price.divisor
            : offering.price;

        let variantTitle = 'Default';
        if (etsyProduct.property_values?.length > 0) {
            variantTitle = etsyProduct.property_values.map((p: any) => p.values[0]).join(' / ');
        }

        await supabase
            .from('staging_etsy_products')
            .upsert({
                shop_id: shop.id,
                etsy_listing_id: etsyListing.listing_id.toString(),
                etsy_variant_id: etsyProduct.product_id.toString(),
                name: etsyListing.title,
                sku: etsyProduct.sku || null,
                price: actualPrice,
                currency: offering.price?.currency_code || 'USD',
                image_url: mainImageUrl,
                stock_quantity: offering.quantity,
                status: etsyListing.state,
                product_title: etsyListing.title,
                variant_title: variantTitle,
                description: etsyListing.description,
                has_variations: etsyInventory.products.length > 1,
                url: etsyListing.url
            }, { onConflict: 'etsy_variant_id' });
    }
}
