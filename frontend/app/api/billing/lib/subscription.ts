import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlanId, type PlanId } from '@/config/plans';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

type ShopifySubscription = {
    id: string;
    name: string;
    status: string;
    createdAt: string;
};

export type BillingSyncResult = {
    status: 'active' | 'inactive' | 'unknown_plan';
    planType: PlanId | null;
    subscriptionName?: string | null;
};

export async function fetchCurrentBillingState(
    shopDomain: string,
    accessToken: string
): Promise<BillingSyncResult> {
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

    const graphqlUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        throw new Error(`Shopify billing query failed (${response.status})`);
    }

    const result = await response.json();
    const subscriptions: ShopifySubscription[] = result.data?.currentAppInstallation?.activeSubscriptions || [];

    const activeSub = subscriptions
        .filter((sub) => sub.status === 'ACTIVE')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!activeSub) {
        return { status: 'inactive', planType: null, subscriptionName: null };
    }

    const planType = normalizePlanId(activeSub.name);

    if (!planType) {
        return { status: 'unknown_plan', planType: null, subscriptionName: activeSub.name };
    }

    return {
        status: 'active',
        planType,
        subscriptionName: activeSub.name
    };
}

export async function syncShopPlanWithBilling(
    supabase: SupabaseClient,
    shopDomain: string,
    accessToken: string,
    currentPlanType?: string | null
): Promise<BillingSyncResult> {
    const billingState = await fetchCurrentBillingState(shopDomain, accessToken);

    if (billingState.status === 'active' && billingState.planType) {
        if (billingState.planType !== normalizePlanId(currentPlanType)) {
            await supabase
                .from('shops')
                .update({ plan_type: billingState.planType })
                .eq('shop_domain', shopDomain);
        }
        return billingState;
    }

    if (billingState.status === 'inactive') {
        const normalizedCurrentPlan = normalizePlanId(currentPlanType);
        if (normalizedCurrentPlan || currentPlanType === 'pending') {
            await supabase
                .from('shops')
                .update({ plan_type: 'guest' })
                .eq('shop_domain', shopDomain);
        }
    }

    return billingState;
}
