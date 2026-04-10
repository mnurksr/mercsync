-- ============================================================
-- Trigger: Auto-calculate master_stock and status
-- 
-- Logic:
-- 1. Both platforms matched (shopify_variant_id + etsy_variant_id):
--    - Stocks equal   → master_stock = stock value, status = 'Synced'
--    - Stocks differ  → master_stock = 0,           status = 'Action Required'
-- 2. Single platform only:
--    - master_stock = that platform's stock, status = 'Matching'
-- 
-- Fires on: INSERT or UPDATE of stock snapshots or variant IDs
-- ============================================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.auto_sync_master_stock()
RETURNS TRIGGER AS $$
BEGIN
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

  -- Master stock 0 check (global override)
  IF NEW.master_stock = 0 THEN
    NEW.status := 'Action Required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS trg_auto_sync_master_stock ON public.inventory_items;

CREATE TRIGGER trg_auto_sync_master_stock
BEFORE INSERT OR UPDATE OF shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, etsy_variant_id
ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_master_stock();

-- 3. Backfill: Re-trigger the function on all existing rows
-- We update shopify_stock_snapshot to its own value to trigger the function
UPDATE public.inventory_items
SET shopify_stock_snapshot = COALESCE(shopify_stock_snapshot, 0)
WHERE TRUE;
