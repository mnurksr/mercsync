-- 0024_add_currency_to_shops.sql

-- Add currency columns to shops table to support automatic price conversion
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS shopify_currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS etsy_currency text DEFAULT 'USD';

-- Comment explaining the usage
COMMENT ON COLUMN shops.shopify_currency IS 'Primary currency of the Shopify store';
COMMENT ON COLUMN shops.etsy_currency IS 'Primary currency of the Etsy store';
