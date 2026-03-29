'use server'

import { getValidatedUserContext } from '@/utils/supabase/admin';

export async function clearStagingData(): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext();
    if (!ownerId) return { success: false, message: 'Not authenticated' };

    try {
        const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', ownerId).maybeSingle();
        if (!shop) return { success: false, message: 'Shop not found' };

        await Promise.all([
            supabase.from('staging_shopify_products').delete().eq('shop_id', shop.id),
            supabase.from('staging_etsy_products').delete().eq('shop_id', shop.id)
        ]);

        return { success: true, message: 'Staging data cleared successfully' };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function resetMatches(): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext();
    if (!ownerId) return { success: false, message: 'Not authenticated' };

    try {
        const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', ownerId).maybeSingle();
        if (!shop) return { success: false, message: 'Shop not found' };

        // 1. Clear matches from inventory_items
        await supabase
            .from('inventory_items')
            .update({
                etsy_listing_id: null,
                etsy_variant_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('shop_id', shop.id);

        // 2. Clear matches from staging_shopify_products
        await supabase
            .from('staging_shopify_products')
            .update({ etsy_listing_id: null, etsy_variant_id: null })
            .eq('shop_id', shop.id);

        // 3. Clear matches from staging_etsy_products
        await supabase
            .from('staging_etsy_products')
            .update({ shopify_product_id: null, shopify_variant_id: null })
            .eq('shop_id', shop.id);

        return { success: true, message: 'All matches reset successfully' };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}
