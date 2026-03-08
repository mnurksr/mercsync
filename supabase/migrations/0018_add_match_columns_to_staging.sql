-- 0018_add_match_columns_to_staging.sql
-- Sipariş eşleştirmelerini staging tabloları üzerinde doğrudan tutabilmek için kolonlar ekliyoruz.

ALTER TABLE staging_shopify_products
ADD COLUMN IF NOT EXISTS etsy_variant_id text;

ALTER TABLE staging_etsy_products
ADD COLUMN IF NOT EXISTS shopify_variant_id text;

CREATE INDEX IF NOT EXISTS idx_staging_shopify_etsy_var ON staging_shopify_products(etsy_variant_id);
CREATE INDEX IF NOT EXISTS idx_staging_etsy_shopify_var ON staging_etsy_products(shopify_variant_id);
