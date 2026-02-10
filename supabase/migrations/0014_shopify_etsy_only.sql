-- =================================================================
-- 0014_shopify_etsy_cleanup.sql
-- Shopify + Etsy Odaklı Düzeltme ve Temizlik
-- 
-- Bu migration:
-- 1. Mevcut OAuth bağlantılarını shopify_connected=true ile işaretler
-- 2. Duplicate index'leri temizler
-- 3. Doğru RLS policy'lerini kurar
-- =================================================================


-- =============================================
-- BÖLÜM 1: MEVCUT VERİLERİ DÜZELT
-- =============================================

-- 1.1 Mevcut Shopify bağlantıları için shopify_connected = true yap
-- (n8n bunu set etmediği için eski kayıtlar false kalmış olabilir)
UPDATE shops 
SET shopify_connected = true 
WHERE access_token IS NOT NULL 
  AND access_token != '' 
  AND is_active = true
  AND shopify_connected IS NOT TRUE;


-- =============================================
-- BÖLÜM 2: DUPLICATE INDEX TEMİZLİĞİ
-- =============================================

-- 2.1 Duplicate index'i kaldır (idx_shops_etsy_id ve idx_shops_etsy_shop_id aynı kolonu indexliyor)
DROP INDEX IF EXISTS idx_shops_etsy_id;

-- 2.2 Gereksiz potansiyel Amazon/TikTok indexlerini de temizle (varsa)
DROP INDEX IF EXISTS idx_shops_amazon_seller;
DROP INDEX IF EXISTS idx_shops_amazon_seller_id;
DROP INDEX IF EXISTS idx_shops_tiktok_id;
DROP INDEX IF EXISTS idx_shops_tiktok_shop_id;


-- =============================================
-- BÖLÜM 3: RLS POLİCY'LERİ GÜNCELLE
-- =============================================

-- 3.1 Eski shops policy'lerini temizle
DROP POLICY IF EXISTS "Users can see own shops" ON shops;
DROP POLICY IF EXISTS "Users can view own shops" ON shops;
DROP POLICY IF EXISTS "Users can insert own shops" ON shops;
DROP POLICY IF EXISTS "Users can update own shops" ON shops;
DROP POLICY IF EXISTS "Users can delete own shops" ON shops;

-- 3.2 Yeni shops policy'leri
CREATE POLICY "Users can view own shops"
ON shops FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own shops"
ON shops FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own shops"
ON shops FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own shops"
ON shops FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- 3.3 RLS'in aktif olduğundan emin ol
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;


-- =============================================
-- BÖLÜM 4: CONSTRAINT TEMİZLİĞİ (Opsiyonel)
-- =============================================

-- inventory_ledger source_platform constraint'i varsa güncelle
-- Sadece Shopify, Etsy, manual, other izin ver
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'inventory_ledger_source_platform_check'
    ) THEN
        ALTER TABLE inventory_ledger DROP CONSTRAINT inventory_ledger_source_platform_check;
    END IF;
END $$;

ALTER TABLE inventory_ledger 
ADD CONSTRAINT inventory_ledger_source_platform_check 
CHECK (source_platform IS NULL OR source_platform IN ('shopify', 'etsy', 'manual', 'other'));


-- =============================================
-- TAMAMLANDI
-- =============================================
-- Bu migration çalıştırıldıktan sonra:
-- - Mevcut OAuth bağlantıları shopify_connected=true ile işaretlenmiş olacak
-- - Duplicate indexler temizlenmiş olacak
-- - RLS policy'leri doğru şekilde kurulmuş olacak
-- =============================================
