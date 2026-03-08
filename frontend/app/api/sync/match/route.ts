import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { shop_id, matches } = body;

        if (!shop_id) {
            return NextResponse.json({ error: 'Missing shop_id' }, { status: 400 });
        }

        if (!matches || !Array.isArray(matches)) {
            return NextResponse.json({ error: 'Invalid matches payload' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // 1. Get the Shop ID matching this user if owner_id was passed, or just use shop_id
        // Assuming shop_id passed here is actually the user's shop id. Let's verify that.
        // Wait, the client only has currentUserId (owner_id).
        // Let's lookup shop_id from owner_id to be safe.
        const { data: shops } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', shop_id) // Here shop_id from client is actually the owner_id
            .limit(1);

        if (!shops || shops.length === 0) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        const realShopId = shops[0].id;

        // Save matched variants
        const results = [];
        for (const item of matches) {
            if (!item.shopify_variant_id || !item.etsy_variant_id) continue;

            const { error: shEr } = await supabase
                .from('staging_shopify_products')
                .update({ etsy_variant_id: item.etsy_variant_id })
                .eq('shop_id', realShopId)
                .eq('shopify_variant_id', item.shopify_variant_id);

            const { error: etEr } = await supabase
                .from('staging_etsy_products')
                .update({ shopify_variant_id: item.shopify_variant_id })
                .eq('shop_id', realShopId)
                .eq('etsy_variant_id', item.etsy_variant_id);

            results.push({ variant: item.shopify_variant_id, error: shEr || etEr });
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        console.error('Match save API error:', e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}
