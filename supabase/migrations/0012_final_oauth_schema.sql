-- 0012_final_oauth_schema.sql

-- Bu dosya, "OAuth Workflow Validation Report" analizine göre eksik kalan
-- kritik sütunları ve güvenlik alanlarını ekler.

-- 1. AMAZON SP-API (IAM Credentials)
-- Amazon API çağrılarını imzalamak için AWS IAM anahtarları şarttır.
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS amazon_aws_access_key_id text,
ADD COLUMN IF NOT EXISTS amazon_aws_secret_access_key text, -- Production'da Vault'ta saklanmalı
ADD COLUMN IF NOT EXISTS amazon_aws_role_arn text;

-- 2. TIKTOK SHOP (Cipher & Expiration)
-- Shop Cipher API çağrıları için zorunludur.
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS tiktok_shop_cipher text,
ADD COLUMN IF NOT EXISTS tiktok_open_id text,
ADD COLUMN IF NOT EXISTS tiktok_access_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_refresh_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_access_token text, -- 0010'da sadece refresh eklendi
ADD COLUMN IF NOT EXISTS tiktok_connected boolean default false;

-- 3. ETSY (Shop ID & Expiration)
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS etsy_shop_id text, -- numeric ID ama text tutmak güvenli
ADD COLUMN IF NOT EXISTS etsy_token_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS etsy_access_token text; -- 0010'da eklenmemiş olabilir

-- 4. GENEL TOKEN YÖNETİMİ (Monitoring)
-- Token yenileme işlemlerini takip etmek için
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_failed_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_error text;

-- 5. INDEX
-- ID bazlı sorguları hızlandıralım
CREATE INDEX IF NOT EXISTS idx_shops_etsy_id ON shops(etsy_shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_tiktok_open_id ON shops(tiktok_open_id);
