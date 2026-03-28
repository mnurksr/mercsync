-- 1. REPAIR STAGING LINKS (Retrospective Sync)
-- Update Shopify staging from Etsy staging where links are missing
UPDATE staging_shopify_products s
SET etsy_variant_id = e.etsy_variant_id
FROM staging_etsy_products e
WHERE s.shopify_variant_id = e.shopify_variant_id
AND s.shop_id = e.shop_id
AND s.etsy_variant_id IS NULL;

-- Update Etsy staging from Shopify staging where links are missing
UPDATE staging_etsy_products e
SET shopify_variant_id = s.shopify_variant_id
FROM staging_shopify_products s
WHERE e.etsy_variant_id = s.etsy_variant_id
AND e.shop_id = s.shop_id
AND e.shopify_variant_id IS NULL;

-- 2. MERGE FRAGMENTED INVENTORY ITEMS
-- We look for "pairs" of inventory items that should be one
-- Item A: Has shopify_variant_id, no etsy_variant_id
-- Item B: Has etsy_variant_id, no shopify_variant_id
-- Logic: If they are linked in staging, merge B into A and delete B.

WITH linked_pairs AS (
    SELECT 
        s.shop_id,
        s.shopify_variant_id,
        s.etsy_variant_id,
        s.shopify_product_id,
        e.etsy_listing_id
    FROM staging_shopify_products s
    JOIN staging_etsy_products e ON s.etsy_variant_id = e.etsy_variant_id
    WHERE s.shopify_variant_id IS NOT NULL 
    AND s.etsy_variant_id IS NOT NULL
),
items_to_merge AS (
    SELECT 
        lp.shop_id,
        lp.shopify_variant_id,
        lp.etsy_variant_id,
        lp.shopify_product_id,
        lp.etsy_listing_id,
        i_shop.id as shopify_item_id,
        i_etsy.id as etsy_item_id
    FROM linked_pairs lp
    JOIN inventory_items i_shop ON i_shop.shopify_variant_id = lp.shopify_variant_id AND i_shop.shop_id = lp.shop_id
    JOIN inventory_items i_etsy ON i_etsy.etsy_variant_id = lp.etsy_variant_id AND i_etsy.shop_id = lp.shop_id
    WHERE i_shop.id <> i_etsy.id -- Only if they are separate rows
)
-- Update the "Shopify" row with Etsy data
UPDATE inventory_items i
SET 
    etsy_variant_id = m.etsy_variant_id,
    etsy_listing_id = m.etsy_listing_id,
    status = 'Matching', -- Reset status to matching after merge
    updated_at = NOW()
FROM items_to_merge m
WHERE i.id = m.shopify_item_id;

-- Delete the redundant "Etsy-only" row
DELETE FROM inventory_items
WHERE id IN (SELECT etsy_item_id FROM items_to_merge);

-- 3. ENSURE TRIGGER EXISTENCE (For future safety)
CREATE OR REPLACE FUNCTION sync_shopify_to_etsy_staging()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.etsy_variant_id IS NOT NULL THEN
        UPDATE staging_etsy_products
        SET shopify_variant_id = NEW.shopify_variant_id
        WHERE etsy_variant_id = NEW.etsy_variant_id
        AND (shopify_variant_id IS NULL OR shopify_variant_id <> NEW.shopify_variant_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_shopify_to_etsy ON staging_shopify_products;
CREATE TRIGGER tr_sync_shopify_to_etsy
AFTER INSERT OR UPDATE OF etsy_variant_id ON staging_shopify_products
FOR EACH ROW EXECUTE FUNCTION sync_shopify_to_etsy_staging();

CREATE OR REPLACE FUNCTION sync_etsy_to_shopify_staging()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.shopify_variant_id IS NOT NULL THEN
        UPDATE staging_shopify_products
        SET etsy_variant_id = NEW.etsy_variant_id
        WHERE shopify_variant_id = NEW.shopify_variant_id
        AND (etsy_variant_id IS NULL OR etsy_variant_id <> NEW.etsy_variant_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_etsy_to_shopify ON staging_etsy_products;
CREATE TRIGGER tr_sync_etsy_to_shopify
AFTER INSERT OR UPDATE OF shopify_variant_id ON staging_etsy_products
FOR EACH ROW EXECUTE FUNCTION sync_etsy_to_shopify_staging();
