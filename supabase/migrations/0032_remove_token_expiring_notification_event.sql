-- Remove token-expiring as a merchant-facing notification.
-- Token refresh failures still surface as sync_failed, which is actionable.

UPDATE public.shop_settings
SET notification_events = notification_events - 'token_expiring'
WHERE notification_events ? 'token_expiring';

ALTER TABLE public.shop_settings
ALTER COLUMN notification_events SET DEFAULT
    '{"stock_zero": true, "sync_failed": true, "oversell_risk": true, "new_order": false}'::jsonb;

DELETE FROM public.notifications
WHERE type = 'token_expiring';

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
        'sync_error',
        'stock_zero',
        'sync_failed',
        'oversell_risk',
        'system_alert',
        'billing'
    ]::text[])
);
