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
    target_id?: string; // If set, append variants to existing product instead of creating new
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
    finalMatched: any[];
};

// ─────────────────────────────────────────────
// Entry Point
import fs from 'fs';

export async function processSync(payload: SyncPayload) {
    const { job_id, user_id, initial_state, final_state } = payload;
    console.log(`[Sync] processSync started for job ${job_id} with user ${user_id}`);
    try {
        fs.writeFileSync('/tmp/payload.json', JSON.stringify(payload, null, 2));
    } catch (e) { }
    console.dir({ initial_state, final_state }, { depth: null }); // DEBUG LOG

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

        // ── Phase 1.5: Save Staging Matches ──
        await sendLog(job_id, 'Saving variant matches to staging tables...', 10, 100);
        await saveStagingMatches(shop.id, parsed.finalMatched);
        await sendLog(job_id, 'Variant matches saved.', 15, 100);

        // ── Phase 2: Stock Syncs ──
        if (parsed.stockUpdates.length > 0) {
            await sendLog(job_id, 'Synchronizing inventory levels across platforms...', 5, 100);

            for (const update of parsed.stockUpdates) {
                try {
                    if (update.platform === 'shopify') {
                        await syncShopifyStock(shop, update);
                    } else {
                        await syncEtsyStock(shop, update, parsed.stockUpdates);
                    }

                    completedSteps++;
                    const progress = Math.round((completedSteps / totalSteps) * 40); // stocks = 0-40%

                    console.log(`[Sync] Updated stock for ${update.title} on ${update.platform}`);
                } catch (err: any) {
                    console.error(`[Sync] Stock update failed for ${update.title}:`, err.message);
                    // Continue with next item — don't break the loop
                }

                await delay(1000); // Rate limiting
            }

            await sendLog(job_id, 'Inventory levels successfully synchronized. ✓', 40, 100);
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

        // ── Phase 4: Finalize Inventory Records ──
        await sendLog(job_id, 'Finalizing inventory records...', 98, 100);
        await finalizeInventory(shop, payload);
        await sendLog(job_id, 'All operations completed successfully! ✓', 100, 100);

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
        toEtsy: final_state?.queued_clones?.to_etsy || [],
        finalMatched: finalMatched // Pass this along for saveStagingMatches
    };
}

// ─────────────────────────────────────────────
// Phase 1.5: Save Matched Variants to Staging
// ─────────────────────────────────────────────

async function saveStagingMatches(shopId: string, finalMatched: any[]) {
    if (!finalMatched || finalMatched.length === 0) return;

    for (const item of finalMatched) {
        if (!item.shopify_variant_id || !item.etsy_variant_id) continue;

        // Update Shopify Staging Product
        const { error: shEr } = await supabase
            .from('staging_shopify_products')
            .update({ etsy_variant_id: item.etsy_variant_id })
            .eq('shop_id', shopId)
            .eq('shopify_variant_id', item.shopify_variant_id);

        if (shEr) console.error(`[Sync] Failed to link Shopify variant ${item.shopify_variant_id} to Etsy ${item.etsy_variant_id}:`, shEr.message);

        // Update Etsy Staging Product
        const { error: etEr } = await supabase
            .from('staging_etsy_products')
            .update({ shopify_variant_id: item.shopify_variant_id })
            .eq('shop_id', shopId)
            .eq('etsy_variant_id', item.etsy_variant_id);

        if (etEr) console.error(`[Sync] Failed to link Etsy variant ${item.etsy_variant_id} to Shopify ${item.shopify_variant_id}:`, etEr.message);
    }
}

// ─────────────────────────────────────────────
// Finalize Inventory (Save user-approved matches)
// ─────────────────────────────────────────────

async function finalizeInventory(shop: any, payload: SyncPayload) {
    // 1. Resolve Location ID.
    let mainLocationId = shop.main_location_id;
    if (!mainLocationId) {
        const { data: locs } = await supabase.from('inventory_locations').select('id').eq('shop_id', shop.id).limit(1);
        if (locs && locs.length > 0) {
            mainLocationId = locs[0].id;
        } else {
            console.log(`[Sync] Creating default inventory location for shop ${shop.id}`);
            const { data: newLoc } = await supabase.from('inventory_locations').insert({
                shop_id: shop.id,
                name: 'Main Location',
                type: 'warehouse',
                is_active: true
            }).select('id').single();
            if (newLoc) mainLocationId = newLoc.id;
        }
    }

    // 2. Fetch all staging products for this shop
    const { data: shopifyProducts, error: shErr } = await supabase.from('staging_shopify_products').select('*').eq('shop_id', shop.id);
    const { data: etsyProducts, error: etErr } = await supabase.from('staging_etsy_products').select('*').eq('shop_id', shop.id);

    if (shErr) console.error('[Sync] Error fetching shopify staging:', shErr.message);
    if (etErr) console.error('[Sync] Error fetching etsy staging:', etErr.message);

    const sProds = shopifyProducts || [];
    const eProds = etsyProducts || [];

    const processedEtsyVariantIds = new Set<string>();

    const upsertInvItem = async (sku: string, title: string, sId: string | null, sVarId: string | null, eId: string | null, eVarId: string | null) => {
        let invItemId = null;
        try {
            const { data: existingItem } = await supabase.from('inventory_items').select('id').eq('sku', sku).maybeSingle();
            const payload = { shop_id: shop.id, sku, name: title, shopify_product_id: sId, shopify_variant_id: sVarId, etsy_listing_id: eId, etsy_variant_id: eVarId };

            if (existingItem) {
                const { error } = await supabase.from('inventory_items').update(payload).eq('id', existingItem.id);
                if (error) console.error(`[Sync] Failed to update inventory item ${sku}:`, error.message);
                invItemId = existingItem.id;
            } else {
                const { data: newItem, error } = await supabase.from('inventory_items').insert(payload).select('id').single();
                if (error) {
                    console.error(`[Sync] Failed to insert inventory item ${sku}:`, error.message);
                } else if (newItem) {
                    invItemId = newItem.id;
                }
            }
        } catch (err: any) {
            console.error(`[Sync] Caught error upserting item ${sku}:`, err.message);
        }
        return invItemId;
    };

    const upsertInvLevel = async (invItemId: string, market: 'SHOPIFY' | 'ETSY', stock: number) => {
        if (!invItemId || !mainLocationId) return;
        const { error } = await supabase.from('inventory_levels').upsert({
            inventory_item_id: invItemId,
            location_id: mainLocationId,
            shop_id: shop.id,
            market_iso: market,
            available_stock: stock || 0
        }, { onConflict: 'inventory_item_id,location_id,market_iso' });
        if (error) console.error(`[Sync] Failed to upsert ${market} level:`, error.message);
    };

    // 3. Process Shopify products
    for (const sp of sProds) {
        const title = sp.name || sp.product_title || 'Unknown Product';

        if (sp.etsy_variant_id) {
            // Matched via Shopify staging
            const ep = eProds.find(e => e.etsy_variant_id === sp.etsy_variant_id);
            const sku = sp.sku || ep?.sku || `SKU-${sp.shopify_variant_id}`;
            const invItemId = await upsertInvItem(sku, title, sp.shopify_product_id, sp.shopify_variant_id, ep?.etsy_listing_id || null, sp.etsy_variant_id);

            if (invItemId) {
                await upsertInvLevel(invItemId, 'SHOPIFY', sp.stock_quantity);
                if (ep) {
                    await upsertInvLevel(invItemId, 'ETSY', ep.stock_quantity);
                    processedEtsyVariantIds.add(ep.etsy_variant_id);
                }
            }
        } else {
            // Unmatched Shopify
            const sku = sp.sku || `SKU-${sp.shopify_variant_id}`;
            const invItemId = await upsertInvItem(sku, title, sp.shopify_product_id, sp.shopify_variant_id, null, null);
            if (invItemId) {
                await upsertInvLevel(invItemId, 'SHOPIFY', sp.stock_quantity);
            }
        }
    }

    // 4. Process remaining Etsy products
    for (const ep of eProds) {
        if (processedEtsyVariantIds.has(ep.etsy_variant_id)) continue;

        const title = ep.name || ep.product_title || 'Unknown Product';
        const sku = ep.sku || `SKU-${ep.etsy_variant_id}`;

        // Usually, these are unmatched. If there's an anomaly where shopify_variant_id exists but wasn't caught above, include it.
        const invItemId = await upsertInvItem(sku, title, null, ep.shopify_variant_id || null, ep.etsy_listing_id, ep.etsy_variant_id);
        if (invItemId) {
            await upsertInvLevel(invItemId, 'ETSY', ep.stock_quantity);
        }
    }
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
    try {
        await shopifyApi.setInventoryLevel(
            { shopDomain: shop.shop_domain, accessToken: shop.access_token },
            shop.main_location_id,
            stagingRow.shopify_inventory_item_id,
            update.new_stock
        );
    } catch (e: any) {
        if (e.message && e.message.includes('Inventory item does not have inventory tracking enabled')) {
            console.log(`[Sync] Auto-enabling inventory tracking for item ${stagingRow.shopify_inventory_item_id}`);
            await shopifyApi.enableInventoryTracking(
                { shopDomain: shop.shop_domain, accessToken: shop.access_token },
                stagingRow.shopify_inventory_item_id
            );
            // Retry setting inventory
            await shopifyApi.setInventoryLevel(
                { shopDomain: shop.shop_domain, accessToken: shop.access_token },
                shop.main_location_id,
                stagingRow.shopify_inventory_item_id,
                update.new_stock
            );
        } else {
            throw e;
        }
    }

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

    // Build selected variant data from clone payload
    const cloneVariants = product.variants?.length > 0
        ? product.variants.filter(v => v.selected !== false)
        : undefined;

    // === VARIANT INJECTION: Append to existing product ===
    if (product.target_id) {
        console.log(`[Sync] Variant injection: appending to Shopify product ${product.target_id}`);

        // Use clone variant data directly (has correct title/sku/price/stock from user)
        const variantsToProcess = cloneVariants || product.variants || [];

        for (const cv of variantsToProcess) {
            const variantPayload = {
                option1: cv.title || 'Default Title',
                price: cv.price ? cv.price.toString() : '0.00',
                sku: cv.sku || '',
                inventory_management: 'shopify',
                requires_shipping: true
            };

            try {
                const result = await shopifyApi.addVariantToProduct(creds, product.target_id, variantPayload);
                const variant = result.variant;

                // Set inventory level
                await delay(1000);
                try {
                    await shopifyApi.setInventoryLevel(
                        creds,
                        shop.main_location_id,
                        variant.inventory_item_id,
                        cv.stock || 0
                    );
                } catch (e: any) {
                    if (e.message && e.message.includes('Inventory item does not have inventory tracking enabled')) {
                        console.log(`[Sync] Auto-enabling inventory tracking for injected variant ${variant.inventory_item_id}`);
                        await shopifyApi.enableInventoryTracking(creds, variant.inventory_item_id);
                        await shopifyApi.setInventoryLevel(
                            creds,
                            shop.main_location_id,
                            variant.inventory_item_id,
                            cv.stock || 0
                        );
                    } else {
                        throw e;
                    }
                }

                // Insert into staging table
                const locMap = shop.main_location_id
                    ? [{ location_id: shop.main_location_id, available: cv.stock || 0 }]
                    : [];

                await supabase
                    .from('staging_shopify_products')
                    .upsert({
                        shop_id: shop.id,
                        shopify_product_id: product.target_id,
                        shopify_variant_id: variant.id.toString(),
                        shopify_inventory_item_id: variant.inventory_item_id.toString(),
                        name: `${product.title} - ${cv.title || 'Default'}`,
                        sku: variant.sku || null,
                        price: parseFloat(variant.price || 0),
                        image_url: product.image || null,
                        status: 'active',
                        stock_quantity: cv.stock || 0,
                        product_title: product.title,
                        variant_title: cv.title || 'Default',
                        description: product.description || '',
                        location_inventory_map: JSON.stringify(locMap),
                        etsy_variant_id: cv.source_variant_id // Link back to source
                    }, { onConflict: 'shopify_inventory_item_id' });
            } catch (e: any) {
                console.warn(`[Sync] Failed to add variant ${cv.title}:`, e.message);
            }

            await delay(1000);
        }
        return;
    }

    // === STANDARD CLONE: Create new product ===
    // 2. Build Shopify product payload (using clone variant data if available)
    const { product: shopifyPayload, originalStocks } = shopifyApi.buildProductPayload(product, dbRows, cloneVariants);

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
            if (e.message && e.message.includes('Inventory item does not have inventory tracking enabled')) {
                console.log(`[Sync] Auto-enabling inventory tracking for cloned variant ${variant.inventory_item_id}`);
                await shopifyApi.enableInventoryTracking(creds, variant.inventory_item_id);
                try {
                    await shopifyApi.setInventoryLevel(
                        creds,
                        shop.main_location_id,
                        variant.inventory_item_id,
                        stock
                    );
                } catch (retryErr: any) {
                    console.warn(`[Sync] Failed to set stock for variant ${variant.id} after enabling tracking:`, retryErr.message);
                }
            } else {
                console.warn(`[Sync] Failed to set stock for variant ${variant.id}:`, e.message);
            }
        }
    }

    // 5. Insert into staging_shopify_products
    for (let i = 0; i < shopifyProduct.variants.length; i++) {
        const variant = shopifyProduct.variants[i];
        const stock = originalStocks[i] || 0;
        const cv = cloneVariants ? cloneVariants[i] : null; // Get source mapping if available
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
                location_inventory_map: JSON.stringify(locMap),
                etsy_variant_id: cv ? cv.source_variant_id : dbRows[i]?.etsy_variant_id // Link back to source
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

    // Build selected variant data from clone payload
    const cloneVariants = product.variants?.length > 0
        ? product.variants.filter(v => v.selected !== false)
        : undefined;

    // === VARIANT INJECTION: Append to existing Etsy listing ===
    if (product.target_id) {
        console.log(`[Sync] Variant injection: appending to Etsy listing ${product.target_id}`);

        // Get current inventory
        const currentInventory = await etsyApi.getInventory(product.target_id, shop.etsy_access_token);

        // Use clone variants directly (user-verified data)
        const variantsToAdd = cloneVariants || product.variants || [];

        const optionName = shopifyProduct.options?.[0]?.name || 'Variation';

        // Merge existing products with new
        const existingProducts = (currentInventory.products || []).map((p: any) => ({
            sku: p.sku || '',
            property_values: (p.property_values || []).map((prop: any) => {
                const cleaned: any = {
                    property_id: prop.property_id,
                    value_ids: prop.value_ids,
                    property_name: prop.property_name,
                    values: prop.values
                };
                if (prop.scale_id !== null) cleaned.scale_id = prop.scale_id;
                return cleaned;
            }),
            offerings: (p.offerings || []).map((off: any) => {
                let priceVal = off.price;
                if (typeof priceVal === 'object' && priceVal.amount !== undefined) {
                    priceVal = priceVal.amount / priceVal.divisor;
                }
                return {
                    price: priceVal,
                    quantity: off.quantity,
                    is_enabled: off.is_enabled,
                    readiness_state_id: off.readiness_state_id
                };
            })
        }));

        const newProducts = variantsToAdd.map((cv: any) => {
            const stock = Math.max(1, cv.stock || 1);
            const offering: any = {
                price: parseFloat(cv.price || 0),
                quantity: stock,
                is_enabled: true
            };
            if (readinessStateId) offering.readiness_state_id = readinessStateId;

            return {
                sku: cv.sku || `SKU-${Date.now()}`,
                property_values: [{
                    property_id: 513,
                    property_name: optionName === 'Title' ? 'Variation' : optionName,
                    values: [cv.title || 'Default']
                }],
                offerings: [offering]
            };
        });

        const mergedProducts = [...existingProducts, ...newProducts];
        const activeProperties = mergedProducts.some(p => p.property_values.length > 0) ? [513] : [];

        const mergedPayload = {
            products: mergedProducts,
            price_on_property: activeProperties,
            quantity_on_property: activeProperties,
            sku_on_property: activeProperties
        };

        const etsyInventory = await etsyApi.updateInventory(product.target_id, shop.etsy_access_token, mergedPayload);

        // Insert new variants into staging_etsy_products
        const mainImageUrl = shopifyProduct.images?.[0]?.src || '';
        for (let i = 0; i < (etsyInventory.products || []).length; i++) {
            const etsyProduct = etsyInventory.products[i];
            const cv = variantsToAdd[i]; // Get the source variant match

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
                    etsy_listing_id: product.target_id,
                    etsy_variant_id: etsyProduct.product_id.toString(),
                    name: product.title,
                    sku: etsyProduct.sku || null,
                    price: actualPrice,
                    currency: offering.price?.currency_code || 'USD',
                    image_url: mainImageUrl,
                    stock_quantity: offering.quantity,
                    status: 'active',
                    product_title: product.title,
                    variant_title: variantTitle,
                    description: product.description || '',
                    has_variations: etsyInventory.products.length > 1,
                    shopify_variant_id: cv ? cv.source_variant_id : undefined // Link back to source
                }, { onConflict: 'etsy_variant_id' });
        }
        return;
    }

    // === STANDARD CLONE: Create new listing ===
    // 3. Build Etsy payloads (using clone variant data if available)
    const { listingPayload, inventoryPayload } = etsyApi.buildListingPayload(
        shopifyProduct,
        dbStocks || [],
        shippingProfileId,
        readinessStateId,
        cloneVariants
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

    for (let i = 0; i < (etsyInventory.products || []).length; i++) {
        const etsyProduct = etsyInventory.products[i];

        // Find matching source variant from payload or assume index match
        const cv = cloneVariants ? cloneVariants[i] : (shopifyProduct.variants[i] ? { source_variant_id: shopifyProduct.variants[i].id.toString() } : null);

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
                url: etsyListing.url,
                shopify_variant_id: cv ? cv.source_variant_id : undefined // Link back to source
            }, { onConflict: 'etsy_variant_id' });
    }
}
