-- Add selected_location_ids column to shops table
-- Stores the user's selected Shopify location IDs for inventory aggregation
ALTER TABLE shops ADD COLUMN IF NOT EXISTS selected_location_ids jsonb DEFAULT '[]'::jsonb;
