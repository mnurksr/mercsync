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
        const events: any[] = [];

        const { error: startError } = await supabase.from('sync_jobs').update({
            status: 'processing',
            message: `Starting bulk sync for ${totalSteps} items...`,
            current_step: 0,
            total_steps: totalSteps,
            updated_at: new Date().toISOString()
        }).eq('id', job_id);

        if (startError) console.error('[Sync API] Failed to start job:', startError);

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
                const result = await updateInventoryStock(item.id, targetStock);
                if (!result?.success) throw new Error(result?.message || 'Update failed');

                events.push({
                    type: 'stock_sync',
                    product: { name: item.name, old_stock: item.master_stock, new_stock: targetStock, sku: item.sku },
                    status: 'success',
                    text: `Successfully synchronized ${item.sku || 'product'} to ${targetStock} units.`
                });
            } catch (err: any) {
                events.push({
                    type: 'stock_sync',
                    product: { name: item.name, old_stock: item.master_stock, new_stock: targetStock, sku: item.sku },
                    status: 'failed',
                    text: `Failed to sync ${item.sku || 'product'}: ${err.message}`
                });
            }

            completedSteps++;
            const progress = Math.round((completedSteps / totalSteps) * 100);

            // Update progress in sync_jobs
            const { error: progError } = await supabase.from('sync_jobs').update({
                current_step: progress,
                message: JSON.stringify(events),
                updated_at: new Date().toISOString()
            }).eq('id', job_id);

            if (progError) console.error('[Sync API] Progress update failed:', progError);

            // Sleep slightly to prevent rate limiting
            await new Promise(res => setTimeout(res, 500));
        }

        // Finish job
        const { error: finishError } = await supabase.from('sync_jobs').update({
            status: 'completed',
            message: JSON.stringify(events),
            current_step: 100,
            updated_at: new Date().toISOString()
        }).eq('id', job_id);

        if (finishError) console.error('[Sync API] Finish update failed:', finishError);

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

        if (!job_id || !itemIds || !strategy || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json(
                { error: 'Invalid payload components' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        
        let target_user_id = user_id;
        if (!target_user_id) {
            // Fallback: If client-side Supabase user object was lost due to Shopify iFrame 3rd party cookie blocking, look it up securely.
            const { data: itemData } = await supabase
                .from('inventory_items')
                .select('shop_id, shop:shops(owner_id)')
                .eq('id', itemIds[0])
                .single();
                
            if (itemData?.shop && (itemData.shop as any).owner_id) {
                target_user_id = (itemData.shop as any).owner_id;
            } else {
                return NextResponse.json({ error: 'Cannot determine valid user tracking context' }, { status: 400 });
            }
        }
        const { error: upsertError } = await supabase
            .from('sync_jobs')
            .upsert({
                id: job_id,
                user_id: target_user_id,
                status: 'pending',
                current_step: 0,
                total_steps: 100,
            }, { onConflict: 'id' });

        if (upsertError) {
            console.error('[Sync API] Initial upsert error:', upsertError);
            return NextResponse.json({ error: 'Database error creating sync job' }, { status: 500 });
        }

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
