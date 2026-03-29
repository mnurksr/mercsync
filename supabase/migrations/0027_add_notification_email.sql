-- Add notification_email to shop_settings
ALTER TABLE shop_settings
ADD COLUMN IF NOT EXISTS notification_email TEXT;
