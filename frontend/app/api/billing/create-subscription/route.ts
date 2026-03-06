/**
 * POST /api/billing/create-subscription
 *
 * Creates a Shopify app subscription using the Admin GraphQL API.
 * Uses appSubscriptionCreate mutation with test: true for development.
 *
 * Returns: { confirmationUrl: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const PLANS: Record<string, { name: string; price: number }> = {
    starter: { name: 'Starter', price: 29 },
    professional: { name: 'Professional', price: 79 },
    enterprise: { name: 'Enterprise', price: 199 }
};

const SHOPIFY_API_VERSION = '2024-01';

export async function POST(req: NextRequest) {
    try {
        const { plan, user_id } = await req.json();

        if (!plan || !user_id) {
            return NextResponse.json(
                { error: 'plan and user_id are required' },
                { status: 400 }
            );
        }

        const planConfig = PLANS[plan];
        if (!planConfig) {
            return NextResponse.json(
                { error: `Invalid plan: ${plan}. Must be one of: starter, professional, enterprise` },
                { status: 400 }
            );
        }

        // Get shop credentials from DB
        const supabase = createAdminClient();
        const { data: shop } = await supabase
            .from('shops')
            .select('shop_domain, access_token')
            .eq('owner_id', user_id)
            .maybeSingle();

        if (!shop?.shop_domain || !shop?.access_token) {
            return NextResponse.json(
                { error: 'Shop not found or missing credentials' },
                { status: 404 }
            );
        }

        // Build the GraphQL mutation
        const returnUrl = `https://${shop.shop_domain}/admin/apps/mercsync`;

        const mutation = `
            mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
                appSubscriptionCreate(
                    name: $name,
                    returnUrl: $returnUrl,
                    test: $test,
                    lineItems: $lineItems
                ) {
                    appSubscription {
                        id
                        status
                    }
                    confirmationUrl
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const variables = {
            name: `MercSync ${planConfig.name}`,
            returnUrl,
            test: true, // Development mode — remove for production
            lineItems: [
                {
                    plan: {
                        appRecurringPricingDetails: {
                            price: {
                                amount: planConfig.price,
                                currencyCode: 'USD'
                            },
                            interval: 'EVERY_30_DAYS'
                        }
                    }
                }
            ]
        };

        // Call Shopify Admin GraphQL API
        const graphqlUrl = `https://${shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

        const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': shop.access_token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: mutation, variables })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Billing] Shopify API error:', errorText);
            return NextResponse.json(
                { error: `Shopify API error (${response.status})` },
                { status: 502 }
            );
        }

        const result = await response.json();
        const subscriptionData = result.data?.appSubscriptionCreate;

        if (subscriptionData?.userErrors?.length > 0) {
            console.error('[Billing] User errors:', subscriptionData.userErrors);
            return NextResponse.json(
                { error: subscriptionData.userErrors.map((e: any) => e.message).join(', ') },
                { status: 400 }
            );
        }

        const confirmationUrl = subscriptionData?.confirmationUrl;

        if (!confirmationUrl) {
            return NextResponse.json(
                { error: 'No confirmation URL returned from Shopify' },
                { status: 500 }
            );
        }

        // Update shop record with plan info
        await supabase
            .from('shops')
            .update({
                plan: plan,
                plan_name: planConfig.name,
                billing_status: 'pending'
            })
            .eq('owner_id', user_id);

        return NextResponse.json({
            confirmationUrl,
            plan: planConfig.name,
            price: planConfig.price
        });

    } catch (err: any) {
        console.error('[Billing] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
