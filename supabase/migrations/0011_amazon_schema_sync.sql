-- 0011_amazon_schema_sync.sql

-- Bu dosya, kullanıcının Supabase panelinden manuel yaptığı değişiklikleri
-- kod tabanımızla eşitlemek amacıyla oluşturulmuştur.

-- 1. Tablo yapısını güncelle
alter table shops 
add column if not exists amazon_access_token text,
add column if not exists amazon_token_expires_at timestamp with time zone,
add column if not exists amazon_region text default 'eu-west-1';

-- 2. Eski alanı temizle (drop if exists güvenlidir)
alter table shops drop column if exists amazon_api_key;

-- 3. Veri tiplerini garantiye al
alter table shops 
alter column amazon_refresh_token set data type text,
alter column amazon_access_token set data type text,
alter column amazon_token_expires_at set data type timestamp with time zone;
