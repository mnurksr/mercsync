/**
 * POST /api/billing/verify-subscription
 *
 * Verifies a Shopify app subscription using the Admin GraphQL API.
 * Called when the user returns from the billing confirmation page with a charge_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncShopPlanWithBilling } from '../lib/subscription';

export async function POST(req: NextRequest) {
    try {
        const { charge_id, shop_domain } = await req.json();

        if (!charge_id || !shop_domain) {
            return NextResponse.json(
                { error: 'charge_id and shop_domain are required' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Get shop credentials
        const { data: shop } = await supabase
            .from('shops')
            .select('access_token, plan_type')
            .eq('shop_domain', shop_domain)
            .single();

        if (!shop?.access_token) {
            return NextResponse.json({ error: 'Shop credentials not found' }, { status: 404 });
        }

        // If it's already active on a paid plan, we can technically skip, 
        // but it's safer to just re-verify in case they changed plans.
        // For simplicity, we just proceed to sync with Shopify.

        const billingState = await syncShopPlanWithBilling(
            supabase,
            shop_domain,
            shop.access_token,
            shop.plan_type
        );

        if (billingState.status === 'active' && billingState.planType) {
            return NextResponse.json({ success: true, status: 'active', plan: billingState.planType });
        }

        if (billingState.status === 'unknown_plan') {
            return NextResponse.json(
                { success: false, status: 'unknown_plan', planName: billingState.subscriptionName },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: false, status: 'inactive' });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Billing Verify] Error:', err);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
