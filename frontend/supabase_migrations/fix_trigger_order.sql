-- ============================================================
-- Fix: Trigger Execution Order
--
-- Problem: trg_auto_sync_master_stock runs BEFORE trg_calc_shopify_stock_inventory_items
-- (alphabetical: 'a' < 'c'), so master_stock is calculated with the wrong
-- shopify_stock_snapshot BEFORE calc_shopify recalculates it from the location map.
--
-- Fix: Rename auto_sync trigger so it runs AFTER the calc trigger alphabetically.
-- trg_calc... (c) -> runs first
-- trg_zz_auto... (z) -> runs second, sees correct shopify_stock_snapshot
-- ============================================================

-- 1. Drop old trigger
DROP TRIGGER IF EXISTS trg_auto_sync_master_stock ON public.inventory_items;

-- 2. Recreate with new name that sorts AFTER trg_calc_shopify_stock_inventory_items
CREATE TRIGGER trg_zz_auto_sync_master_stock
BEFORE INSERT OR UPDATE OF shopify_stock_snapshot, etsy_stock_snapshot, shopify_variant_id, etsy_variant_id, is_digital
ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_master_stock();

-- 3. Backfill: Fix all existing items where snapshots match but master_stock is still 0
UPDATE public.inventory_items
SET 
    master_stock = shopify_stock_snapshot,
    status = CASE 
        WHEN is_digital = true THEN 'Digital'
        WHEN shopify_stock_snapshot = etsy_stock_snapshot AND shopify_stock_snapshot > 0 THEN 'Synced'
        WHEN shopify_stock_snapshot = etsy_stock_snapshot AND shopify_stock_snapshot = 0 THEN 'Action Required'
        ELSE 'MISMATCH'
    END
WHERE shopify_variant_id IS NOT NULL 
  AND etsy_variant_id IS NOT NULL
  AND master_stock = 0
  AND shopify_stock_snapshot = etsy_stock_snapshot
  AND shopify_stock_snapshot > 0;

-- 4. Also fix digital products (Gift Cards) that are currently is_digital=false
-- NOTE: Run this AFTER re-importing products with the updated code.
-- Or manually flag them:
-- UPDATE public.inventory_items SET is_digital = true WHERE name ILIKE '%Gift Card%';
