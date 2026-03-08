-- 0017_add_platform_ids_to_items.sql

-- Add platform-specific IDs to inventory_items so webhooks can find the correct item
-- without relying solely on SKU.
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS shopify_product_id text,
ADD COLUMN IF NOT EXISTS shopify_variant_id text,
ADD COLUMN IF NOT EXISTS etsy_listing_id text,
ADD COLUMN IF NOT EXISTS etsy_variant_id text;

-- Add indexes for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_inv_items_shopify_var ON inventory_items(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_etsy_var ON inventory_items(etsy_variant_id);
