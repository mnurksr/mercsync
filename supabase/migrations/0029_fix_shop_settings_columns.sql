-- Add missing Auto-Sync toggles to shop_settings
ALTER TABLE shop_settings
ADD COLUMN IF NOT EXISTS auto_create_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_update_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_delete_products BOOLEAN DEFAULT false;
