CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('shopify', 'etsy')),
    event_key TEXT NOT NULL,
    topic TEXT,
    shop_identifier TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS processed_webhook_events_created_at_idx
    ON public.processed_webhook_events (created_at DESC);

ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_event_type_check;
ALTER TABLE public.sync_logs ADD CONSTRAINT sync_logs_event_type_check
    CHECK (event_type IN (
        'stock_update', 'price_update', 'order', 'order_cancel', 'webhook', 'full_sync',
        'product_create', 'product_update', 'product_delete'
    ));
