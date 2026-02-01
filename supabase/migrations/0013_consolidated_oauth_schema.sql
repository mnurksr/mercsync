-- 0013_consolidated_oauth_schema.sql

-- This migration ensures the 'shops' table has ALL necessary columns for the Multi-Channel OAuth implementation.
-- It is designed to be idempotent (safe to run even if previous migrations 0010-0012 were partially applied).

-- 1. AMAZON SP-API
-- Requires: Connected status, Seller ID, Marketplace, Tokens (Access/Refresh), and AWS IAM Credentials.
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS amazon_connected boolean default false,
ADD COLUMN IF NOT EXISTS amazon_seller_id text,
ADD COLUMN IF NOT EXISTS amazon_marketplace_id text,
ADD COLUMN IF NOT EXISTS amazon_region text,
ADD COLUMN IF NOT EXISTS amazon_refresh_token text,
ADD COLUMN IF NOT EXISTS amazon_access_token text, -- Short-lived, optional to store but good for caching
ADD COLUMN IF NOT EXISTS amazon_aws_access_key_id text,
ADD COLUMN IF NOT EXISTS amazon_aws_secret_access_key text, -- Should be in Vault in Prod
ADD COLUMN IF NOT EXISTS amazon_aws_role_arn text;

-- 2. TIKTOK SHOP
-- Requires: Connected status, Shop ID, Cipher, Tokens, Expiration timestamps.
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS tiktok_connected boolean default false,
ADD COLUMN IF NOT EXISTS tiktok_shop_id text,
ADD COLUMN IF NOT EXISTS tiktok_shop_cipher text, -- Critical for API signature
ADD COLUMN IF NOT EXISTS tiktok_access_token text,
ADD COLUMN IF NOT EXISTS tiktok_refresh_token text,
ADD COLUMN IF NOT EXISTS tiktok_open_id text,
ADD COLUMN IF NOT EXISTS tiktok_access_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS tiktok_refresh_expires_at timestamptz;

-- 3. ETSY
-- Requires: Connected status, Shop ID, Tokens, Expiration, PKCE Verifier.
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS etsy_connected boolean default false,
ADD COLUMN IF NOT EXISTS etsy_shop_id text,
ADD COLUMN IF NOT EXISTS etsy_access_token text,
ADD COLUMN IF NOT EXISTS etsy_refresh_token text,
ADD COLUMN IF NOT EXISTS etsy_token_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS etsy_verifier text; -- PKCE Code Verifier (transient)

-- 4. SHOPIFY (Legacy/Core)
-- 'shop_domain' and 'access_token' are already in 0005_saas_tenancy.sql.
-- Ensure they exist just in case, but they are likely core.
-- We do NOT add them here as they are NOT optional in the core schema usually, but we can check.
-- (Skipping core columns to avoid conflicts with primary definitions if they were different types)

-- 5. GENERAL / MONITORING
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_failed_at timestamptz,
ADD COLUMN IF NOT EXISTS token_refresh_error text;

-- 6. INDEXES
-- Ensure indexes exist for lookups by external IDs (webhook processing)
CREATE INDEX IF NOT EXISTS idx_shops_amazon_seller_id ON shops(amazon_seller_id);
CREATE INDEX IF NOT EXISTS idx_shops_tiktok_shop_id ON shops(tiktok_shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_tiktok_open_id ON shops(tiktok_open_id);
CREATE INDEX IF NOT EXISTS idx_shops_etsy_shop_id ON shops(etsy_shop_id);
-- idx_shops_shop_domain should already exist from 0005 unique constraint

-- 7. CLEANUP / ADJUSTMENTS
-- If there were typos in previous manual migrations (e.g., 'amazon_api_key' in 0007 matching 'amazon_refresh_token' usage),
-- we leave them be to avoid data loss, but we prioritize the columns defined above in our code.
