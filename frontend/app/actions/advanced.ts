'use server'

import { getValidatedUserContext } from '@/utils/supabase/admin';

export async function wipeAllAppData(): Promise<{ success: boolean; message: string }> {
    const { supabase, ownerId } = await getValidatedUserContext();
    if (!ownerId) return { success: false, message: 'Not authenticated' };

    try {
        const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', ownerId).maybeSingle();
        if (!shop) return { success: false, message: 'Shop not found' };

        // Delete all data in parallel
        await Promise.all([
            // 1. Delete staging data
            supabase.from('staging_shopify_products').delete().eq('shop_id', shop.id),
            supabase.from('staging_etsy_products').delete().eq('shop_id', shop.id),
            // 2. Delete all matches and items
            supabase.from('inventory_items').delete().eq('shop_id', shop.id)
        ]);

        return { success: true, message: 'All application data has been wiped successfully.' };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}
