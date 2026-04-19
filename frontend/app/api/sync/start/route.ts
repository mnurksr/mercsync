/**
 * POST /api/sync/start
 *
 * Entry point — replaces the n8n webhook.
 * Creates sync_jobs record, responds immediately, then processes in background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { processSync } from '../lib/processor';
import { getPlanConfig, PLAN_CONFIG } from '@/config/plans';

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const { job_id, user_id } = payload;

        if (!job_id || !user_id) {
            return NextResponse.json(
                { error: 'job_id and user_id are required' },
                { status: 400 }
            );
        }

        // 1. Create (or update) sync_jobs record
        const supabase = createAdminClient();
        const { data: shop } = await supabase
            .from('shops')
            .select('plan_type')
            .eq('owner_id', user_id)
            .maybeSingle();

        const plan = getPlanConfig(shop?.plan_type) || PLAN_CONFIG.starter;
        const queuedClones = payload?.final_state?.queued_clones;
        const cloneCount = (queuedClones?.to_shopify?.length || 0) + (queuedClones?.to_etsy?.length || 0);

        if (cloneCount > 0 && !plan.capabilities.productCloning) {
            return NextResponse.json({
                error: `${plan.name} plan does not include product cloning. Please choose Growth or Pro to clone products between Shopify and Etsy.`,
                code: 'PLAN_PRODUCT_CLONING_REQUIRED',
                plan: plan.name
            }, { status: 402 });
        }

        await supabase
            .from('sync_jobs')
            .upsert({
                id: job_id,
                user_id,
                status: 'pending',
                current_step: 0,
                total_steps: 100,
            }, { onConflict: 'id' });

        // 2. Respond immediately (like n8n's "Respond to Frontend" node)
        const response = NextResponse.json({
            status: 'accepted',
            job_id,
            message: 'Sync process started'
        });

        // 3. Kick off background processing
        // We don't await this — it runs in the background
        processSync(payload).catch(err => {
            console.error('[Sync API] Background processing failed:', err);
        });

        return response;

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Sync API] Error:', err);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
