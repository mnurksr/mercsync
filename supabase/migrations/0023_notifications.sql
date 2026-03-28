-- =============================================
-- Faz 3: Notifications Table & Trigger
-- Automatically creates notifications for sync failures
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('sync_error', 'system_alert', 'billing')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(shop_id, is_read) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

-- Trigger to auto-create notification on sync_logs failure
CREATE OR REPLACE FUNCTION trigger_notify_on_sync_failure()
RETURNS TRIGGER AS $$
DECLARE
    item_name TEXT;
BEGIN
    IF NEW.status = 'failed' THEN
        -- Try to get product name if available
        SELECT name INTO item_name FROM inventory_items WHERE id = NEW.inventory_item_id;
        
        IF item_name IS NOT NULL THEN
            INSERT INTO notifications (shop_id, type, title, message, action_url)
            VALUES (
                NEW.shop_id,
                'sync_error',
                'Sync Failed: ' || item_name,
                COALESCE(NEW.error_message, 'Unknown error occurred during sync.'),
                '/dashboard/history'
            );
        ELSE
            INSERT INTO notifications (shop_id, type, title, message, action_url)
            VALUES (
                NEW.shop_id,
                'sync_error',
                'System Sync Error',
                COALESCE(NEW.error_message, 'Unknown system error occurred.'),
                '/dashboard/history'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_sync_failure_notify ON sync_logs;
CREATE TRIGGER on_sync_failure_notify
    AFTER INSERT OR UPDATE ON sync_logs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_notify_on_sync_failure();
