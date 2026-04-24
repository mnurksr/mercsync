import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const shopDomain = cookieStore.get('mercsync_shop')?.value || null;

        if (!shopDomain) {
            return NextResponse.json({ shopDomain: null });
        }

        const supabase = createAdminClient();
        const { data: shop } = await supabase
            .from('shops')
            .select('shop_domain, plan_type')
            .eq('shop_domain', shopDomain)
            .maybeSingle();

        return NextResponse.json({
            shopDomain: shop?.shop_domain || shopDomain,
            planType: shop?.plan_type || null
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Shop Current] Error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
