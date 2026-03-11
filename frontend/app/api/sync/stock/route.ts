import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { updateInventoryStock } from '@/app/actions/inventory';

// Background processor for bulk stock changes
async function processBulkStock(job_id: string, user_id: string, itemIds: string[], strategy: 'shopify' | 'etsy' | 'latest') {
    const supabase = createAdminClient();
    try {
        const { data: items } = await supabase
            .from('inventory_items')
            .select('*')
            .in('id', itemIds);

        if (!items || items.length === 0) {
            await supabase.from('sync_jobs').update({
                status: 'failed',
                message: 'No items found for sync.',
                updated_at: new Date().toISOString()
            }).eq('id', job_id);
            return;
        }

        const totalSteps = items.length;
        let completedSteps = 0;

        await supabase.from('sync_jobs').update({
            status: 'processing',
            message: `Starting bulk sync for ${totalSteps} items...`,
            current_step: 0,
            total_steps: totalSteps,
            updated_at: new Date().toISOString()
        }).eq('id', job_id);

        for (const item of items) {
            let targetStock = item.master_stock;

            if (strategy === 'shopify') {
                targetStock = item.shopify_stock_snapshot || 0;
            } else if (strategy === 'etsy') {
                targetStock = item.etsy_stock_snapshot || 0;
            } else if (strategy === 'latest') {
                const sTime = item.shopify_updated_at ? new Date(item.shopify_updated_at).getTime() : 0;
                const eTime = item.etsy_updated_at ? new Date(item.etsy_updated_at).getTime() : 0;
                targetStock = sTime >= eTime ? (item.shopify_stock_snapshot || 0) : (item.etsy_stock_snapshot || 0);
            }

            try {
                // Call the existing function which handles Platform APIs (Shopify/Etsy)
                await updateInventoryStock(item.id, targetStock);

                // Add success log
                await supabase.from('sync_logs').insert({
                    job_id,
                    level: 'info',
                    message: `Successfully synchronized ${item.sku || 'product'} to ${targetStock} units.`,
                    timestamp: new Date().toISOString()
                });
            } catch (err: any) {
                // Add error log
                await supabase.from('sync_logs').insert({
                    job_id,
                    level: 'error',
                    message: `Failed to sync ${item.sku || 'product'}: ${err.message}`,
                    timestamp: new Date().toISOString()
                });
            }

            completedSteps++;
            const progress = Math.round((completedSteps / totalSteps) * 100);

            // Update progress in sync_jobs
            await supabase.from('sync_jobs').update({
                current_step: progress,
                message: `Synced ${completedSteps} of ${totalSteps} items...`,
                updated_at: new Date().toISOString()
            }).eq('id', job_id);

            // Sleep slightly to prevent rate limiting
            await new Promise(res => setTimeout(res, 500));
        }

        // Finish job
        await supabase.from('sync_jobs').update({
            status: 'completed',
            message: 'Bulk sync completed successfully.',
            current_step: 100,
            updated_at: new Date().toISOString()
        }).eq('id', job_id);

    } catch (err: any) {
        console.error('[Sync API] Fatal background error:', err);
        await supabase.from('sync_jobs').update({
            status: 'failed',
            message: `Background process failed: ${err.message}`,
            updated_at: new Date().toISOString()
        }).eq('id', job_id);
    }
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const { job_id, user_id, itemIds, strategy } = payload;

        if (!job_id || !user_id || !itemIds || !strategy) {
            return NextResponse.json(
                { error: 'Invalid payload components' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        await supabase
            .from('sync_jobs')
            .upsert({
                id: job_id,
                user_id,
                status: 'pending',
                current_step: 0,
                total_steps: 100,
            }, { onConflict: 'id' });

        const response = NextResponse.json({
            status: 'accepted',
            job_id,
            message: 'Bulk stock sync started'
        });

        // Kick off background processing
        processBulkStock(job_id, user_id, itemIds, strategy).catch((err) => {
            console.error('[BulkSync API] Fire-and-forget failed:', err);
        });

        return response;

    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
