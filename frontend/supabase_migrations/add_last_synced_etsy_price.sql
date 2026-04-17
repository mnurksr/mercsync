-- ============================================================
-- Migration: Add last_synced_etsy_price to inventory_items
-- 
-- Purpose: Prevent infinite price sync ping-pong between
-- Shopify and Etsy. When Shopify pushes a price to Etsy,
-- we store the calculated Etsy price here. When the Etsy 
-- cron reads Etsy prices, it compares against this value.
-- If they match → skip (we sent it). If different → user
-- changed it on Etsy manually, so sync to Shopify.
-- ============================================================

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS last_synced_etsy_price numeric DEFAULT NULL;

COMMENT ON COLUMN public.inventory_items.last_synced_etsy_price IS 
'The last price we pushed TO Etsy from Shopify. Used to detect manual Etsy price changes vs our own sync changes.';
