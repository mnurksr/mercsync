-- ============================================================
-- Migration: Digital Product Support
-- 
-- Adds is_digital flag to staging tables and inventory_items.
-- Digital products skip stock tracking entirely.
-- ============================================================

-- 1. Add is_digital to staging tables
ALTER TABLE staging_shopify_products ADD COLUMN IF NOT EXISTS is_digital boolean DEFAULT false;
ALTER TABLE staging_etsy_products ADD COLUMN IF NOT EXISTS is_digital boolean DEFAULT false;

-- 2. Add is_digital to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_digital boolean DEFAULT false;

-- 3. Update the trigger function to handle digital products
CREATE OR REPLACE FUNCTION public.auto_sync_master_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Digital products: skip stock logic, mark as Digital
  IF NEW.is_digital = true THEN
    NEW.master_stock := 0;
    NEW.status := 'Digital';
    RETURN NEW;
  END IF;

  -- Both platforms present (matched item)
  IF NEW.shopify_variant_id IS NOT NULL AND NEW.etsy_variant_id IS NOT NULL THEN
    IF COALESCE(NEW.shopify_stock_snapshot, 0) = COALESCE(NEW.etsy_stock_snapshot, 0) THEN
      NEW.master_stock := COALESCE(NEW.shopify_stock_snapshot, 0);
      NEW.status := 'Synced';
    ELSE
      NEW.master_stock := 0;
      NEW.status := 'Action Required';
    END IF;
  -- Shopify only (unmatched)
  ELSIF NEW.shopify_variant_id IS NOT NULL THEN
    NEW.master_stock := COALESCE(NEW.shopify_stock_snapshot, 0);
    NEW.status := 'Matching';
  -- Etsy only (unmatched)
  ELSIF NEW.etsy_variant_id IS NOT NULL THEN
    NEW.master_stock := COALESCE(NEW.etsy_stock_snapshot, 0);
    NEW.status := 'Matching';
  END IF;

  -- Master stock 0 check (global override, unless already Digital)
  IF NEW.master_stock = 0 AND NEW.status != 'Digital' THEN
    NEW.status := 'Action Required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate trigger (add is_digital to the column watch list)
DROP TRIGGER IF EXISTS trg_auto_sync_master_stock ON public.inventory_items;

CREATE TRIGGER trg_auto_sync_master_stock
BEFORE INSERT OR UPDATE OF shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, etsy_variant_id, is_digital
ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_master_stock();
