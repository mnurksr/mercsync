-- =============================================
-- Faz 2: Add last_etsy_order_check_at to shops
-- Tracks when we last polled Etsy for new orders
-- =============================================

ALTER TABLE shops ADD COLUMN IF NOT EXISTS last_etsy_order_check_at TIMESTAMPTZ;
