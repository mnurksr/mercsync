import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncShopPlanWithBilling } from '../lib/subscription';

export async function POST(req: NextRequest) {
    try {
        const { shop_domain } = await req.json();

        if (!shop_domain) {
            return NextResponse.json({ error: 'shop_domain is required' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data: shop } = await supabase
            .from('shops')
            .select('access_token, plan_type')
            .eq('shop_domain', shop_domain)
            .single();

        if (!shop?.access_token) {
            return NextResponse.json({ error: 'Shop credentials not found' }, { status: 404 });
        }

        const billingState = await syncShopPlanWithBilling(
            supabase,
            shop_domain,
            shop.access_token,
            shop.plan_type
        );

        return NextResponse.json({
            success: billingState.status === 'active',
            status: billingState.status,
            plan: billingState.planType,
            subscriptionName: billingState.subscriptionName || null
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Billing Sync] Error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
