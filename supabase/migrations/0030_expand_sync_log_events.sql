-- Expand sync_logs event_type to support product sync events
ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_event_type_check;
ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_event_type_check
    CHECK (event_type IN (
        'stock_update', 'price_update', 'order', 'webhook', 'full_sync',
        'product_create', 'product_update', 'product_delete'
    ));
