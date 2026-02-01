-- 0005_saas_tenancy.sql

-- 1. Shops Table (Tenants)
-- Mağaza bilgilerini ve şifreli API anahtarlarını tutar.
create table if not exists shops (
    id uuid primary key default uuid_generate_v4(),
    shop_domain text not null unique, -- e.g. "my-cool-store.myshopify.com"
    access_token text not null, -- Encrypted or plain (in production use Supabase Vault or n8n credentials, but for SaaS logic we store it here)
    is_active boolean default true,
    plan_type text default 'basic',
    created_at timestamptz default now()
);

-- Enable RLS
alter table shops enable row level security;

-- 2. Multi-Tenancy Columns
-- Tüm tablolara shop_id ekleyerek veriyi izole ediyoruz.
alter table inventory_items add column if not exists shop_id uuid references shops(id);
alter table inventory_locations add column if not exists shop_id uuid references shops(id);
alter table inventory_levels add column if not exists shop_id uuid references shops(id);
alter table inventory_ledger add column if not exists shop_id uuid references shops(id);

-- Update RLS Policies to enforce tenant isolation
-- (Örnek: Sadece kendi shop_id'sine sahip satırları görebilir)
create policy "Tenant Isolation for Items" on inventory_items
    using (shop_id = (select id from shops where access_token = current_setting('request.headers')::json->>'x-shop-token')); 
    -- Not: Gerçek dünyada n8n "Service Role" kullandığı için RLS'i bypass eder, 
    -- ancak uygulama katmanı (Frontend) için bu gereklidir.

-- Indexing for performance
create index if not exists idx_items_shop on inventory_items(shop_id);
create index if not exists idx_ledger_shop on inventory_ledger(shop_id);
