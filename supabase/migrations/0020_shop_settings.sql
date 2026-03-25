-- =================================================================
-- 0020_shop_settings.sql
-- Merkezi ayarlar tablosu — tüm arka plan sistemlerinin konfigürasyonu
-- =================================================================

CREATE TABLE IF NOT EXISTS shop_settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    
    -- Sync Settings
    sync_direction text NOT NULL DEFAULT 'bidirectional'
        CHECK (sync_direction IN ('shopify_to_etsy', 'etsy_to_shopify', 'bidirectional')),
    conflict_strategy text NOT NULL DEFAULT 'last_write_wins'
        CHECK (conflict_strategy IN ('last_write_wins', 'shopify_wins', 'etsy_wins', 'manual_review')),
    auto_sync_enabled boolean NOT NULL DEFAULT false,
    sync_frequency text NOT NULL DEFAULT '6h'
        CHECK (sync_frequency IN ('1h', '6h', '12h', '24h')),
    stock_buffer integer NOT NULL DEFAULT 0,
    
    -- Price Sync
    price_sync_enabled boolean NOT NULL DEFAULT false,
    price_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Example: [{"platform":"etsy","type":"percentage","value":20,"rounding":"nearest_99"}]
    
    -- Notification Preferences
    notification_channels jsonb NOT NULL DEFAULT '{"in_app": true, "email": false, "slack_webhook_url": null}'::jsonb,
    notification_events jsonb NOT NULL DEFAULT '{"stock_zero": true, "sync_failed": true, "oversell_risk": true, "new_order": false, "token_expiring": true}'::jsonb,
    notification_frequency text NOT NULL DEFAULT 'instant'
        CHECK (notification_frequency IN ('instant', 'hourly', 'daily')),
    
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(shop_id)
);

-- RLS
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
ON shop_settings FOR SELECT TO authenticated
USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update own settings"
ON shop_settings FOR UPDATE TO authenticated
USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert own settings"
ON shop_settings FOR INSERT TO authenticated
WITH CHECK (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

-- Service role bypass for webhook handlers etc.
CREATE POLICY "Service role full access"
ON shop_settings FOR ALL TO service_role USING (true);

-- Auto-create settings when a shop is created
CREATE OR REPLACE FUNCTION create_default_settings()
RETURNS trigger AS $$
BEGIN
    INSERT INTO shop_settings (shop_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_settings ON shops;
CREATE TRIGGER trigger_create_settings
    AFTER INSERT ON shops
    FOR EACH ROW
    EXECUTE FUNCTION create_default_settings();

-- Backfill: Create settings for existing shops
INSERT INTO shop_settings (shop_id)
SELECT id FROM shops
WHERE id NOT IN (SELECT shop_id FROM shop_settings)
ON CONFLICT DO NOTHING;
