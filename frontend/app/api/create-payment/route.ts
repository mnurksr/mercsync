import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const PLANS: Record<string, { name: string; price: number }> = {
    starter: { name: 'Starter', price: 29 },
    professional: { name: 'Professional', price: 79 },
    enterprise: { name: 'Enterprise', price: 199 }
};

const SHOPIFY_API_VERSION = '2024-01';

/**
 * POST /api/create-payment
 * Replaces: https://api.mercsync.com/webhook/generate-payment-link
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, product_id } = body;

        console.log('[API/create-payment] Received request for:', { user_id, product_id });

        if (!user_id || !product_id) {
            return NextResponse.json({ error: 'user_id and product_id are required' }, { status: 400 });
        }

        const planKey = (product_id || 'starter').toLowerCase();
        const planConfig = PLANS[planKey] || PLANS.starter;

        const supabase = createAdminClient();

        // Lookup shop credentials
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('*')
            .eq('owner_id', user_id)
            .maybeSingle();

        if (shopError || !shop || !shop.access_token || !shop.shop_domain) {
            console.error('[API/create-payment] Shop not found or not connected:', shopError);
            return NextResponse.json({ error: 'Shop not found or Shopify not connected' }, { status: 404 });
        }

        // Prepare return URL
        const appHandle = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || "mercsync-1";
        const shopifyAppUrl = `https://admin.shopify.com/store/${shop.shop_domain.replace('.myshopify.com', '')}/apps/${appHandle}`;
        const returnUrl = `${shopifyAppUrl}/dashboard?shop=${shop.shop_domain}`;

        const mutation = `
            mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
                appSubscriptionCreate(
                    name: $name,
                    returnUrl: $returnUrl,
                    test: $test,
                    lineItems: $lineItems
                ) {
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
            test: process.env.NODE_ENV !== 'production', // Use test mode outside production
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
            return NextResponse.json({ error: `Shopify API error: ${response.status}`, details: errorText }, { status: 502 });
        }

        const result = await response.json();
        const confirmationUrl = result.data?.appSubscriptionCreate?.confirmationUrl;

        if (!confirmationUrl) {
            const errors = result.data?.appSubscriptionCreate?.userErrors;
            console.error('[API/create-payment] Shopify User Errors:', errors);
            return NextResponse.json({
                error: 'Could not generate confirmation URL',
                details: errors
            }, { status: 500 });
        }

        return NextResponse.json({ url: confirmationUrl });

    } catch (error: any) {
        console.error('[API/create-payment] Internal Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
