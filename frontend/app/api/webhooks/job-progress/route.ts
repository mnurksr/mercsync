import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Requires service role key to bypass RLS since n8n won't have a user session
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Expected payload from n8n:
        // {
        //   "job_id": "uuid",
        //   "user_id": "uuid", (Required on first call to set owner)
        //   "status": "processing" | "completed" | "failed",
        //   "current": 1,
        //   "total": 10,
        //   "message": "Processing product X..."
        // }
        const { job_id, user_id, status, current, total, message } = body;

        if (!job_id) {
            return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });
        }

        // Upsert the job status
        const updateData: any = {
            id: job_id,
            status: status || 'processing',
            updated_at: new Date().toISOString()
        };

        if (user_id) updateData.user_id = user_id;
        if (current !== undefined) updateData.current_step = current;
        if (total !== undefined) updateData.total_steps = total;
        if (message) updateData.message = message;

        const { error } = await supabaseAdmin
            .from('sync_jobs')
            .upsert(updateData, { onConflict: 'id' });

        if (error) {
            console.error('[Webhook] Failed to update sync_job:', error);
            return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true, timestamp: updateData.updated_at });
    } catch (err) {
        console.error('[Webhook] Internal error processing job progress:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
