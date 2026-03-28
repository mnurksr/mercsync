-- Trigger to sync Shopify Staging to Etsy Staging
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

-- Trigger to sync Etsy Staging to Shopify Staging
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
