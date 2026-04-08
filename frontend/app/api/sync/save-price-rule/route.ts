import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * POST /api/sync/save-price-rule
 * Saves price rules during setup mode where session cookies may be unreliable.
 * Uses admin client with explicit owner_id to bypass session requirements.
 */
export async function POST(req: NextRequest) {
    const supabase = createAdminClient();

    try {
        const { owner_id, price_rules } = await req.json();

        if (!owner_id || !Array.isArray(price_rules)) {
            return NextResponse.json({ error: 'owner_id and price_rules are required' }, { status: 400 });
        }

        // Find the shop
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', owner_id)
            .maybeSingle();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        // Upsert settings with the new price_rules
        const { error } = await supabase
            .from('shop_settings')
            .upsert(
                {
                    shop_id: shop.id,
                    price_rules,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'shop_id' }
            );

        if (error) {
            console.error('[save-price-rule] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[save-price-rule] Fatal Error:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
