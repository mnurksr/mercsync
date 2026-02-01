-- 0010_oauth_enhancements.sql

-- Etsy ve TikTok gibi platformlar için Refresh Token ve PKCE (Verifier) saklamamız gerekiyor.

alter table shops 
add column if not exists etsy_refresh_token text,
add column if not exists tiktok_refresh_token text,
add column if not exists oauth_verifier text, -- PKCE için geçici saklama alanı
add column if not exists amazon_refresh_token text; -- Amazon için de lazım olabilir

-- Güvenlik Notu: Bu tokenlar production ortamında Supabase Vault içinde saklanmalıdır.
