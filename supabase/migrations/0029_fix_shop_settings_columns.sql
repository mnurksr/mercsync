-- Add ALL missing columns to shop_settings for latest features
ALTER TABLE shop_settings
ADD COLUMN IF NOT EXISTS auto_create_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_update_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_delete_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 0;

