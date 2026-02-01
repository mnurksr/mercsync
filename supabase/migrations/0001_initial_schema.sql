-- 0001_initial_schema.sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Inventory Items
-- Ürünün değişmez özelliklerini (SKU, Barkod, Global Ürün ID) tutar.
create table if not exists inventory_items (
    id uuid primary key default uuid_generate_v4(),
    sku text not null unique,
    barcode text,
    global_product_id text,
    name text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index for fast SKU lookup
create index if not exists idx_inventory_items_sku on inventory_items (sku);

-- 2. Inventory Locations
-- Fiziksel depoları ve mantıksal konumları tanımlar.
create table if not exists inventory_locations (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    type text not null check (type in ('warehouse', 'virtual', 'store', '3pl')),
    is_active boolean default true,
    created_at timestamptz default now()
);

-- 3. Inventory Levels
-- Pazar-Duyarlı yapı. (inventory_item_id, location_id, market_iso) -> Composite Unique Key
create table if not exists inventory_levels (
    id uuid primary key default uuid_generate_v4(),
    inventory_item_id uuid not null references inventory_items(id) on delete restrict,
    location_id uuid not null references inventory_locations(id) on delete restrict,
    market_iso text not null default 'GLOBAL', -- ISO Country Code or Region Code
    available_stock integer not null default 0 check (available_stock >= 0),
    reserved_stock integer not null default 0 check (reserved_stock >= 0),
    updated_at timestamptz default now(),
    
    unique (inventory_item_id, location_id, market_iso)
);

-- 4. Inventory Ledger
-- Çift girişli muhasebe, Salt Eklenir (Append-Only)
create table if not exists inventory_ledger (
    id uuid primary key default uuid_generate_v4(),
    inventory_item_id uuid not null references inventory_items(id) on delete restrict,
    location_id uuid not null references inventory_locations(id) on delete restrict,
    market_iso text not null,
    change_amount integer not null, -- Can be negative or positive
    previous_balance integer not null, -- Snapshot of available_stock before change
    new_balance integer not null, -- Snapshot of available_stock after change
    reason_code text not null check (reason_code in ('ORDER', 'RESTOCK', 'DAMAGE', 'RETURN', 'ADJUSTMENT', 'SHIPMENT', 'RESERVATION_EXPIRED')),
    reference_id text, -- e.g. Shopify Order ID
    transaction_id text, -- Trace ID provided by the system
    created_at timestamptz default now()
);

-- Index for querying history by reference (Order ID)
create index if not exists idx_inventory_ledger_reference on inventory_ledger (reference_id);
create index if not exists idx_inventory_ledger_item on inventory_ledger (inventory_item_id);
