import type { SupabaseClient } from '@supabase/supabase-js';

const SHOP_DATA_TABLES = [
    'notifications',
    'shop_settings',
    'staging_shopify_products',
    'staging_etsy_products',
    'inventory_ledger',
    'inventory_levels',
    'inventory_items',
    'inventory_locations',
    'sync_logs',
] as const;

type CleanupResult = {
    ok: boolean;
    errors: string[];
};

type ShopRow = {
    id: string;
};

async function deleteShopRows(
    supabase: SupabaseClient,
    shopId: string,
    logPrefix: string
): Promise<string[]> {
    const errors: string[] = [];

    for (const table of SHOP_DATA_TABLES) {
        const { error } = await supabase.from(table).delete().eq('shop_id', shopId);
        if (error) {
            const message = `${table}: ${error.message}`;
            errors.push(message);
            console.error(`${logPrefix} Cleanup failed for ${message}`);
        }
    }

    return errors;
}

export async function clearOperationalShopData(
    supabase: SupabaseClient,
    shopId: string,
    logPrefix = '[Shopify Cleanup]'
): Promise<CleanupResult> {
    const errors = await deleteShopRows(supabase, shopId, logPrefix);
    return { ok: errors.length === 0, errors };
}

/**
 * app/uninstalled should immediately disable the integration and remove tokens.
 * We keep the shop row so billing/support history and later shop/redact lookup still work.
 */
export async function scrubShopAfterUninstall(
    supabase: SupabaseClient,
    shopDomain: string,
    logPrefix = '[Shopify Cleanup]'
): Promise<CleanupResult> {
    const { data: shops, error } = await supabase
        .from('shops')
        .update({
            is_active: false,
            shopify_connected: false,
            access_token: null,
            etsy_connected: false,
            etsy_access_token: null,
            etsy_refresh_token: null,
            etsy_token_expires_at: null,
            token_refresh_failed_at: null,
            token_refresh_error: null,
        })
        .eq('shop_domain', shopDomain)
        .select('id');

    if (error) {
        console.error(`${logPrefix} Failed to scrub shop ${shopDomain}:`, error.message);
        return { ok: false, errors: [error.message] };
    }

    if (!shops || shops.length === 0) {
        console.log(`${logPrefix} No shop record found for ${shopDomain}.`);
        return { ok: true, errors: [] };
    }

    const allErrors: string[] = [];

    for (const shop of shops as ShopRow[]) {
        const cleanupResult = await clearOperationalShopData(supabase, shop.id, logPrefix);
        if (!cleanupResult.ok) {
            allErrors.push(...cleanupResult.errors);
        }
    }

    if (allErrors.length > 0) {
        return { ok: false, errors: allErrors };
    }

    console.log(`${logPrefix} Scrubbed ${shops.length} shop record(s) for ${shopDomain}.`);
    return { ok: true, errors: [] };
}

/**
 * shop/redact is the permanent erasure webhook. It removes all shop-scoped data
 * and then deletes the shop row itself.
 */
export async function redactShopData(
    supabase: SupabaseClient,
    shopDomain: string,
    logPrefix = '[Shopify Cleanup]'
): Promise<CleanupResult> {
    const { data: shop, error: findError } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shopDomain)
        .maybeSingle();

    if (findError) {
        console.error(`${logPrefix} Failed to find shop ${shopDomain}:`, findError.message);
        return { ok: false, errors: [findError.message] };
    }

    if (!shop) {
        console.log(`${logPrefix} No shop record found for ${shopDomain}.`);
        return { ok: true, errors: [] };
    }

    const errors = await deleteShopRows(supabase, shop.id, logPrefix);
    if (errors.length > 0) return { ok: false, errors };

    const { error: deleteShopError } = await supabase.from('shops').delete().eq('id', shop.id);
    if (deleteShopError) {
        console.error(`${logPrefix} Failed to delete shop ${shopDomain}:`, deleteShopError.message);
        return { ok: false, errors: [deleteShopError.message] };
    }

    return { ok: true, errors: [] };
}
