-- ============================================================
-- Migration: Add last_synced_shopify_price to inventory_items
--            + Add last_synced_etsy_price if not yet added
-- 
-- Purpose: Prevent infinite price sync ping-pong in ALL directions.
-- - last_synced_etsy_price: What we last pushed TO Etsy (from Shopify)
-- - last_synced_shopify_price: What we last pushed TO Shopify (from Etsy)
--
-- When Shopify webhook fires after WE changed the price,
-- handlePriceUpdate checks: price === last_synced_shopify_price?
-- If yes → skip (we caused this). Breaks the chain.
-- ============================================================

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS last_synced_etsy_price numeric DEFAULT NULL;

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS last_synced_shopify_price numeric DEFAULT NULL;

COMMENT ON COLUMN public.inventory_items.last_synced_etsy_price IS 
'The last price we pushed TO Etsy from Shopify. Used to detect our own sync vs manual edits.';

COMMENT ON COLUMN public.inventory_items.last_synced_shopify_price IS 
'The last price we pushed TO Shopify from Etsy. Used to detect our own sync vs manual edits.';
