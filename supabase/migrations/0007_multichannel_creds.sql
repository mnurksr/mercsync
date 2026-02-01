-- 0007_multichannel_creds.sql

-- 1. Extend the 'shops' table to hold credentials for all platforms
-- Mevcut shops tablosunu genişletiyoruz.
-- NOT: Prodüksiyonda bu alanlar şifreli (Supabase Vault) tutulmalıdır.

alter table shops 
add column if not exists amazon_connected boolean default false,
add column if not exists amazon_seller_id text,
add column if not exists amazon_marketplace_id text,
add column if not exists amazon_api_key text, -- SP-API Refresh Token

add column if not exists tiktok_connected boolean default false,
add column if not exists tiktok_shop_id text,
add column if not exists tiktok_access_token text,

add column if not exists ebay_connected boolean default false,
add column if not exists ebay_access_token text,

add column if not exists etsy_connected boolean default false,
add column if not exists etsy_shop_id text,
add column if not exists etsy_access_token text;

-- 2. Indexing for fast lookup by external IDs (Ingest sırasında lazım olacak)
create index if not exists idx_shops_amazon_seller on shops(amazon_seller_id);
create index if not exists idx_shops_tiktok_id on shops(tiktok_shop_id);
create index if not exists idx_shops_etsy_id on shops(etsy_shop_id);
