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
import { getPlanConfig, PLAN_ORDER } from '@/config/plans';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

export async function POST(req: NextRequest) {
    try {
        const { plan, user_id, shop_domain } = await req.json();

        if (!plan || (!user_id && !shop_domain)) {
            return NextResponse.json(
                { error: 'plan and (user_id or shop_domain) are required' },
                { status: 400 }
            );
        }

        const planConfig = getPlanConfig(plan);
        if (!planConfig) {
            return NextResponse.json(
                { error: `Invalid plan: ${plan}. Must be one of: ${PLAN_ORDER.join(', ')}` },
                { status: 400 }
            );
        }

        // Get shop credentials from DB — lookup by shop_domain first, fallback to owner_id
        const supabase = createAdminClient();
        let shopQuery = supabase.from('shops').select('shop_domain, access_token, owner_id');
        if (shop_domain) {
            shopQuery = shopQuery.eq('shop_domain', shop_domain);
        } else {
            shopQuery = shopQuery.eq('owner_id', user_id);
        }
        const { data: shop } = await shopQuery.maybeSingle();

        if (!shop?.shop_domain || !shop?.access_token) {
            return NextResponse.json(
                { error: 'Shop not found or missing credentials' },
                { status: 404 }
            );
        }

        // We use the App Handle for the return URL since Shopify uses the handle in its admin routing path.
        const appHandle = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || "mercsync-1";
        const shopifyAppUrl = `https://admin.shopify.com/store/${shop.shop_domain.replace('.myshopify.com', '')}/apps/${appHandle}`;
        const returnUrl = `${shopifyAppUrl}/billing?shop=${shop.shop_domain}`;

        const mutation = `
            mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
                appSubscriptionCreate(
                    name: $name,
                    returnUrl: $returnUrl,
                    test: $test,
                    trialDays: $trialDays,
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
            test: true,
            trialDays: planConfig.trialDays,
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
                { error: subscriptionData.userErrors.map((e: { message: string }) => e.message).join(', ') },
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

        // We don't update the DB here since there is no billing_status column.
        // The plan_type will be updated to the chosen plan in the /verify-subscription route 
        // after the user approves the charge and returns to the dashboard.

        return NextResponse.json({
            confirmationUrl,
            plan: planConfig.name,
            price: planConfig.price
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Billing] Error:', err);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
