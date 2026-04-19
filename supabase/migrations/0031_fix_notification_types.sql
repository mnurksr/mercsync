-- Expand notification types without changing the existing sync_logs trigger.
-- The current production trigger still writes sync_error, while the app-level
-- notification service writes stock_zero/sync_failed/oversell_risk/token_expiring.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'sync_error',
        'stock_zero',
        'sync_failed',
        'oversell_risk',
        'token_expiring',
        'system_alert',
        'billing'
    ));
