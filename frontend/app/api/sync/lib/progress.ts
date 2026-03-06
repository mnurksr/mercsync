import { createAdminClient } from '@/utils/supabase/admin';

const supabase = createAdminClient();

type ProgressUpdate = {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    current?: number;
    total?: number;
    message?: string;
};

/**
 * Update sync_jobs record — triggers Supabase Realtime for the UI.
 * The `message` column stores a JSON array of all events so no events are lost.
 */
export async function updateProgress(jobId: string, data: ProgressUpdate) {
    const updateData: any = {
        updated_at: new Date().toISOString()
    };

    if (data.status) updateData.status = data.status;
    if (data.current !== undefined) updateData.current_step = data.current;
    if (data.total !== undefined) updateData.total_steps = data.total;

    if (data.message !== undefined) {
        // Fetch current message array and append
        const { data: existing } = await supabase
            .from('sync_jobs')
            .select('message')
            .eq('id', jobId)
            .single();

        let events: string[] = [];
        if (existing?.message) {
            try {
                const parsed = JSON.parse(existing.message);
                if (Array.isArray(parsed)) events = parsed;
            } catch {
                // Old format (single string) — wrap it
                events = [existing.message];
            }
        }
        events.push(data.message);
        updateData.message = JSON.stringify(events);
    }

    const { error } = await supabase
        .from('sync_jobs')
        .update(updateData)
        .eq('id', jobId);

    if (error) {
        console.error('[Progress] Failed to update sync_jobs:', error);
    }
}

/**
 * Send a simple log message
 */
export async function sendLog(jobId: string, text: string, current?: number, total?: number) {
    await updateProgress(jobId, {
        status: 'processing',
        message: text,
        current,
        total
    });
}

/**
 * Send a stock sync event (shows as a compact row in the UI)
 */
export async function sendStockSync(
    jobId: string,
    platform: 'shopify' | 'etsy',
    productName: string,
    oldStock: number,
    newStock: number,
    current?: number,
    total?: number,
    sku?: string
) {
    const event = JSON.stringify({
        type: 'stock_sync',
        platform,
        product: { name: productName, old_stock: oldStock, new_stock: newStock, sku },
        text: `${platform === 'shopify' ? 'Shopify' : 'Etsy'} stock updated`
    });

    await updateProgress(jobId, {
        status: 'processing',
        message: event,
        current,
        total
    });
}

/**
 * Send a product clone event (shows as a rich card in the UI)
 */
export async function sendProductClone(
    jobId: string,
    direction: 'to_shopify' | 'to_etsy',
    product: { name: string; price: number; stock: number; image?: string; sku?: string },
    cloneStatus: 'cloning' | 'success' | 'failed',
    text: string,
    current?: number,
    total?: number
) {
    const event = JSON.stringify({
        type: 'product_clone',
        direction,
        product,
        status: cloneStatus,
        text
    });

    await updateProgress(jobId, {
        status: 'processing',
        message: event,
        current,
        total
    });
}

/**
 * Mark job as completed
 */
export async function markCompleted(jobId: string) {
    await updateProgress(jobId, {
        status: 'completed',
        current: 100,
        total: 100,
        message: 'All operations completed successfully!'
    });
}

/**
 * Mark job as failed
 */
export async function markFailed(jobId: string, errorMessage: string) {
    await updateProgress(jobId, {
        status: 'failed',
        message: `Error: ${errorMessage}`
    });
}
