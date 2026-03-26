-- =============================================
-- Faz 1: Sync Logs Table
-- Records every sync event for audit/debugging
-- =============================================

CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('shopify', 'etsy', 'system')),
    event_type TEXT NOT NULL CHECK (event_type IN ('stock_update', 'price_update', 'order', 'webhook', 'full_sync')),
    direction TEXT CHECK (direction IN ('shopify_to_etsy', 'etsy_to_shopify', 'bidirectional')),
    old_stock INTEGER,
    new_stock INTEGER,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast shop-based queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_shop_id ON sync_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status) WHERE status = 'failed';

-- RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
    ON sync_logs FOR SELECT
    USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));
