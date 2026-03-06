/**
 * POST /api/billing/verify-subscription
 *
 * Verifies a Shopify app subscription using the Admin GraphQL API.
 * Called when the user returns from the billing confirmation page with a charge_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const SHOPIFY_API_VERSION = '2024-01';

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
            .select('access_token, billing_status')
            .eq('shop_domain', shop_domain)
            .single();

        if (!shop?.access_token) {
            return NextResponse.json({ error: 'Shop credentials not found' }, { status: 404 });
        }

        // If it's already active, skip verification (idempotency)
        if (shop.billing_status === 'active') {
            return NextResponse.json({ success: true, status: 'active', skipped: true });
        }

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
        const subscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];

        // Check if there is an active subscription
        const hasActiveSub = subscriptions.some((sub: any) => sub.status === 'ACTIVE');

        if (hasActiveSub) {
            // Update local database to active
            await supabase
                .from('shops')
                .update({ billing_status: 'active' })
                .eq('shop_domain', shop_domain);

            return NextResponse.json({ success: true, status: 'active' });
        } else {
            return NextResponse.json({ success: false, status: 'inactive' });
        }

    } catch (err: any) {
        console.error('[Billing Verify] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
