import dotenv from 'dotenv';
dotenv.config({ path: './frontend/.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectPayloads() {
    // Let's get the latest sync_jobs to see the payload that frontend sent
    const { data: jobs, error } = await supabase
        .from('sync_jobs')
        .select('payload')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !jobs || jobs.length === 0) {
        console.error("Could not fetch job payload", error);
        return;
    }

    const payload = jobs[0].payload;
    console.log("MATCHED PAYLOAD (first item):");
    console.dir(payload.final_state?.matched_inventory?.[0], { depth: null });

    console.log("\nUNMATCHED PAYLOAD (first item):");
    console.dir(payload.initial_state?.unmatched_inventory?.[0], { depth: null });
}

inspectPayloads();
