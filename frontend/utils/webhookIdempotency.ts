import { SupabaseClient } from '@supabase/supabase-js';

export async function claimWebhookEvent(
    supabase: SupabaseClient,
    provider: 'shopify' | 'etsy',
    eventKey: string,
    topic?: string | null,
    shopIdentifier?: string | null
): Promise<boolean> {
    const { error } = await supabase
        .from('processed_webhook_events')
        .insert({
            provider,
            event_key: eventKey,
            topic: topic || null,
            shop_identifier: shopIdentifier || null,
        });

    if (!error) {
        return true;
    }

    if ((error as { code?: string }).code === '23505') {
        return false;
    }

    throw new Error(error.message);
}
