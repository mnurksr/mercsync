-- Align notification types with the application notification service.
-- Older installs only allowed sync_error/system_alert/billing, which blocks
-- stock_zero, sync_failed, oversell_risk, and token_expiring inserts.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

UPDATE notifications
SET type = 'sync_failed'
WHERE type = 'sync_error';

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'stock_zero',
        'sync_failed',
        'oversell_risk',
        'token_expiring',
        'system_alert',
        'billing'
    ));

CREATE OR REPLACE FUNCTION trigger_notify_on_sync_failure()
RETURNS TRIGGER AS $$
DECLARE
    item_name TEXT;
    settings_row RECORD;
BEGIN
    IF NEW.status = 'failed' THEN
        SELECT notification_channels, notification_events
        INTO settings_row
        FROM shop_settings
        WHERE shop_id = NEW.shop_id;

        IF COALESCE((settings_row.notification_events ->> 'sync_failed')::boolean, true)
           AND COALESCE((settings_row.notification_channels ->> 'in_app')::boolean, true) THEN
            SELECT name INTO item_name FROM inventory_items WHERE id = NEW.inventory_item_id;

            INSERT INTO notifications (shop_id, type, title, message, action_url)
            VALUES (
                NEW.shop_id,
                'sync_failed',
                CASE
                    WHEN item_name IS NOT NULL THEN 'Sync Failed: ' || item_name
                    ELSE 'System Sync Error'
                END,
                COALESCE(NEW.error_message, 'Unknown sync error occurred.'),
                '/dashboard/history'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
