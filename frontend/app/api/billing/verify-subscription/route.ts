/**
 * POST /api/billing/verify-subscription
 *
 * Verifies a Shopify app subscription using the Admin GraphQL API.
 * Called when the user returns from the billing confirmation page with a charge_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizePlanId } from '@/config/plans';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

type ShopifySubscription = {
    name: string;
    status: string;
    createdAt: string;
};

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

        // 2. Query Shopify to verify the charge status
        // The charge_id from the URL is actually a global ID when querying via GraphQL in modern versions, 
        // but often it's just the numeric ID. We need the active subscriptions.

        const query = `
            query {
                currentAppInstallation {
                    activeSubscriptions {
                        id
                        name
                        status
                        createdAt
                    }
                }
            }
        `;

        const graphqlUrl = `https://${shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

        const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': shop.access_token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Shopify API error' }, { status: 502 });
        }

        const result = await response.json();
        const subscriptions: ShopifySubscription[] = result.data?.currentAppInstallation?.activeSubscriptions || [];

        // Check if there is an active subscription, sort by newest first
        const activeSub = subscriptions
            .filter((sub) => sub.status === 'ACTIVE')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (activeSub) {
            // e.g. "MercSync Growth" -> "growth"
            const planType = normalizePlanId(activeSub.name);

            if (!planType) {
                return NextResponse.json({ success: false, status: 'unknown_plan', planName: activeSub.name }, { status: 400 });
            }

            // Update local database to active plan
            await supabase
                .from('shops')
                .update({ plan_type: planType })
                .eq('shop_domain', shop_domain);

            return NextResponse.json({ success: true, status: 'active', plan: planType });
        } else {
            return NextResponse.json({ success: false, status: 'inactive' });
        }

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Billing Verify] Error:', err);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
