import { SupabaseClient } from '@supabase/supabase-js';
import { getInventory, updateInventory } from './lib/etsy';
import { convertCurrency } from '@/utils/currency';

/**
 * Calculates a target price based on a base price and a set of rules.
 */
export function calculatePrice(basePrice: number, rules: any[], targetPlatform: 'etsy' | 'shopify'): number | null {
    // Find the rule where the target is the requested platform
    const rule = rules.find(r => r.platform === targetPlatform);
    if (!rule) return null; // No rule defined for this target

    let newPrice = basePrice;
    
    // 1. Apply formula
    if (rule.type === 'percentage') {
        newPrice = newPrice * (1 + (rule.value / 100));
    } else if (rule.type === 'fixed') {
        newPrice = newPrice + rule.value;
    }

    // 2. Apply rounding
    if (rule.rounding === 'nearest_99') {
        newPrice = Math.floor(newPrice) + 0.99;
    } else if (rule.rounding === 'nearest_95') {
        newPrice = Math.floor(newPrice) + 0.95;
    } else if (rule.rounding === 'round_up') {
        newPrice = Math.ceil(newPrice);
    } else {
        // 'none' - just round to 2 decimals for currency
        newPrice = Math.round(newPrice * 100) / 100;
    }

    // Ensure price isn't negative
    return Math.max(0, newPrice);
}

/**
 * Merges new prices into an existing Etsy inventory payload.
 * Similar to mergeStockUpdate, but only updates the price fields.
 */
function mergePriceUpdate(currentInventory: any, priceUpdates: { item_id: string; new_price: number }[]): any {
    const updateMap: Record<string, number> = {};
    priceUpdates.forEach(u => {
        updateMap[u.item_id] = u.new_price;
    });

    const cleanProducts = (currentInventory.products || []).map((product: any) => {
        const variantId = product.product_id.toString();

        // Apply new price if this variant is in the update list
        let newPrice = null;
        if (updateMap[variantId] !== undefined) {
            newPrice = updateMap[variantId];
        }

        // Clean property_values (Etsy requires them exactly as they were returned)
        const cleanProps = (product.property_values || []).map((prop: any) => {
            const p: any = {
                property_id: prop.property_id,
                value_ids: prop.value_ids,
                property_name: prop.property_name,
                values: prop.values
            };
            if (prop.scale_id !== null) p.scale_id = prop.scale_id;
            return p;
        });

        // Clean offerings and update price
        const cleanOfferings = (product.offerings || []).map((off: any) => {
            let priceVal = off.price;
            let currentFloatPrice = 0;
            
            // Extract current numeric price
            if (typeof priceVal === 'object' && priceVal.amount !== undefined) {
                currentFloatPrice = priceVal.amount / priceVal.divisor;
            } else {
                currentFloatPrice = parseFloat(priceVal);
            }

            return {
                price: newPrice !== null ? newPrice : currentFloatPrice,
                quantity: off.quantity,
                is_enabled: off.is_enabled,
                readiness_state_id: off.readiness_state_id
            };
        });

        return {
            sku: product.sku || '',
            property_values: cleanProps,
            offerings: cleanOfferings
        };
    });

    return {
        products: cleanProducts,
        price_on_property: currentInventory.price_on_property || [],
        quantity_on_property: currentInventory.quantity_on_property || [],
        sku_on_property: currentInventory.sku_on_property || []
    };
}

/**
 * Main handler: Processes a Shopify product update, calculates prices, and syncs to Etsy.
 */
export async function handlePriceUpdate(
    shopifyPayload: any,
    shopDomain: string,
    supabase: SupabaseClient
) {
    const startTime = Date.now();
    let errorLog = null;
    let status = 'skipped';
    const oldPrices: Record<string, number> = {};
    const newPrices: Record<string, number> = {};
    let itemRecordId = null;
    let numericShopId = null;

    try {
        // 1. Validate connection and retrieve internal shop_id
        const { data: shops } = await supabase
            .from('shops')
            .select('id, etsy_shop_id, etsy_token, etsy_token_expires_at, is_active, shopify_connected, etsy_connected, shopify_currency, etsy_currency')
            .eq('shop_domain', shopDomain)
            .limit(1);

        const shop = shops?.[0];
        if (!shop || !shop.is_active || !shop.shopify_connected || !shop.etsy_connected) {
            return { status: 'skipped', message: 'Shop inactive or disconnected' };
        }
        numericShopId = shop.id;

        // 2. Fetch Shop Settings
        const { data: settings } = await supabase
            .from('shop_settings')
            .select('price_sync_enabled, price_rules')
            .eq('shop_id', shop.id)
            .maybeSingle();

        if (!settings || !settings.price_sync_enabled || !settings.price_rules || settings.price_rules.length === 0) {
            return { status: 'skipped', message: 'Price sync disabled or no rules configured' };
        }

        // Check if there is a rule targeting Etsy
        const hasEtsyRule = settings.price_rules.some((r: any) => r.platform === 'etsy');
        if (!hasEtsyRule) {
             return { status: 'skipped', message: 'No price sync rules targeting Etsy' };
        }

        // 3. Find the connected product in inventory_items
        const shopifyProductId = shopifyPayload.id.toString();
        
        const { data: inventoryItem } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('shop_id', shop.id)
            .eq('shopify_product_id', shopifyProductId)
            .maybeSingle();

        if (!inventoryItem || !inventoryItem.etsy_listing_id) {
            return { status: 'skipped', message: 'Product is not mapped to an Etsy listing' };
        }

        itemRecordId = inventoryItem.id;
        const etsyListingId = inventoryItem.etsy_listing_id;

        // 4. Fetch the mapping for variants
        const { data: variantMappings } = await supabase
            .from('inventory_variants')
            .select('*')
            .eq('inventory_item_id', inventoryItem.id)
            .not('etsy_variant_id', 'is', null);

        if (!variantMappings || variantMappings.length === 0) {
            return { status: 'skipped', message: 'No mapped variants found for this product' };
        }

        // 5. Calculate new prices for mapped variants
        const priceUpdates: { item_id: string, new_price: number }[] = [];
        const shopifyVariants = shopifyPayload.variants || [];

        for (const mapping of variantMappings) {
            const shVariant = shopifyVariants.find((v: any) => v.id.toString() === mapping.shopify_variant_id);
            if (!shVariant || !shVariant.price) continue;

            const basePrice = parseFloat(shVariant.price);
            
            // Apply Currency Conversion first if needed
            const convertedPrice = convertCurrency(basePrice, shop.shopify_currency, shop.etsy_currency);
            
            // Then apply local pricing rules
            const calculatedTargetPrice = calculatePrice(convertedPrice, settings.price_rules, 'etsy');

            if (calculatedTargetPrice !== null) {
                priceUpdates.push({
                    item_id: mapping.etsy_variant_id!,
                    new_price: calculatedTargetPrice
                });
                
                // Track for logging
                oldPrices[mapping.etsy_variant_id!] = basePrice; // Track original Shopify price
                newPrices[mapping.etsy_variant_id!] = calculatedTargetPrice; // Track calculated Etsy price
            }
        }

        if (priceUpdates.length === 0) {
            return { status: 'skipped', message: 'No prices needed updating based on rules' };
        }

        // 6. Fetch the current Etsy Inventory (Required to build the exact PUT payload)
        console.log(`[Price Sync] Fetching current Etsy inventory for listing ${etsyListingId}...`);
        const currentInventory = await getInventory(etsyListingId, shop.etsy_token);

        // 7. Merge the new prices into the inventory payload
        const updatedInventoryPayload = mergePriceUpdate(currentInventory, priceUpdates);

        // 8. PUT to Etsy using the unified function
        console.log(`[Price Sync] Updating prices on Etsy for listing ${etsyListingId}...`);
        await updateInventory(etsyListingId, shop.etsy_token, updatedInventoryPayload);

        status = 'success';
        return { status: 'success', message: 'Successfully updated Etsy prices' };

    } catch (error: any) {
        console.error('[Price Sync Error]:', error);
        status = 'failed';
        errorLog = error.message;
        return { status: 'failed', message: error.message };
    } finally {
        if (status !== 'skipped' && itemRecordId) { // Only log success/fails, not skips (too noisy)
            const duration = Date.now() - startTime;
            
            // Format stock columns by just stringifying the price objects. 
            // We use stock columns because the sync history page reads them, but we'll adapt the display if needed. 
            // For now, storing average price in old_stock/new_stock or just 0 is fine.
            const avgOldPrice = Object.values(oldPrices).length > 0 ? Object.values(oldPrices)[0] : 0;
            const avgNewPrice = Object.values(newPrices).length > 0 ? Object.values(newPrices)[0] : 0;

            await supabase.from('sync_logs').insert({
                shop_id: numericShopId,
                inventory_item_id: itemRecordId,
                source: 'shopify',
                direction: 'shopify_to_etsy',
                event_type: 'price_update',
                status: status as any,
                error_message: errorLog,
                metadata: {
                    duration_ms: duration,
                    old_prices_base: oldPrices,
                    new_prices_calculated: newPrices
                },
                old_stock: Math.round(avgOldPrice), // Use stock fields to hold rounded prices for History UI
                new_stock: Math.round(avgNewPrice)
            });
        }
    }
}
