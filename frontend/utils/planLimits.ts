import { SupabaseClient } from '@supabase/supabase-js';
import { getPlanConfig, PLAN_CONFIG } from '@/config/plans';

type LimitResult = {
    ok: boolean;
    planName: string;
    limit: number;
    current: number;
    message?: string;
};

async function getShopPlan(supabase: SupabaseClient, shopId: string) {
    const { data, error } = await supabase
        .from('shops')
        .select('plan_type')
        .eq('id', shopId)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return getPlanConfig(data?.plan_type) || PLAN_CONFIG.starter;
}

export async function checkMatchedItemLimit(
    supabase: SupabaseClient,
    shopId: string,
    proposedMatchedItems: number
): Promise<LimitResult> {
    const plan = await getShopPlan(supabase, shopId);
    const limit = plan.limits.matchedItems;

    if (proposedMatchedItems <= limit) {
        return {
            ok: true,
            planName: plan.name,
            limit,
            current: proposedMatchedItems,
        };
    }

    return {
        ok: false,
        planName: plan.name,
        limit,
        current: proposedMatchedItems,
        message: `${plan.name} plan allows up to ${limit.toLocaleString()} matched products. Your current selection would track ${proposedMatchedItems.toLocaleString()}. Please remove products or upgrade your plan.`,
    };
}

export async function canProcessMonthlyOrderSync(
    supabase: SupabaseClient,
    shopId: string
): Promise<LimitResult> {
    const plan = await getShopPlan(supabase, shopId);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
        .from('sync_logs')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .eq('event_type', 'order')
        .gte('created_at', monthStart.toISOString());

    if (error) throw new Error(error.message);

    const current = count || 0;
    const limit = plan.limits.monthlyOrderSyncs;
    const ok = current < limit;

    return {
        ok,
        planName: plan.name,
        limit,
        current,
        message: ok
            ? undefined
            : `${plan.name} plan includes ${limit.toLocaleString()} synced orders per month. Monthly order sync limit has been reached.`,
    };
}

