/**
 * POST /api/sync/start
 *
 * Entry point — replaces the n8n webhook.
 * Creates sync_jobs record, responds immediately, then processes in background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { processSync } from '../lib/processor';

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
        await supabase
            .from('sync_jobs')
            .upsert({
                id: job_id,
                user_id,
                status: 'pending',
                current_step: 0,
                total_steps: 100,
                message: 'Starting process...'
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

    } catch (err: any) {
        console.error('[Sync API] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
