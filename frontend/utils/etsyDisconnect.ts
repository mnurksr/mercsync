import type { SupabaseClient } from '@supabase/supabase-js';

type CleanupOptions = {
    clearShopIdentity?: boolean;
};

export async function clearEtsyConnectionData(
    supabase: SupabaseClient,
    shopId: string,
    options: CleanupOptions = {}
) {
    const { clearShopIdentity = true } = options;

    const inventoryUpdate: Record<string, string | number | null> = {
        etsy_variant_id: null,
        etsy_listing_id: null,
        etsy_stock_snapshot: 0,
        etsy_updated_at: null,
        updated_at: new Date().toISOString(),
        status: 'Matching'
    };

    const shopUpdate: Record<string, string | boolean | null> = {
        etsy_connected: false,
        etsy_access_token: null,
        etsy_refresh_token: null,
        etsy_token_expires_at: null,
        last_etsy_order_check_at: null,
        token_refresh_failed_at: null,
        token_refresh_error: null
    };

    if (clearShopIdentity) {
        shopUpdate.etsy_shop_id = null;
        shopUpdate.etsy_currency = null;
    }

    const [stagingResult, inventoryResult, shopResult] = await Promise.all([
        supabase
            .from('staging_etsy_products')
            .delete()
            .eq('shop_id', shopId),
        supabase
            .from('inventory_items')
            .update(inventoryUpdate)
            .eq('shop_id', shopId)
            .not('etsy_variant_id', 'is', null),
        supabase
            .from('shops')
            .update(shopUpdate)
            .eq('id', shopId)
    ]);

    const errors = [
        stagingResult.error,
        inventoryResult.error,
        shopResult.error
    ].filter(Boolean);

    return {
        ok: errors.length === 0,
        errors
    };
}
