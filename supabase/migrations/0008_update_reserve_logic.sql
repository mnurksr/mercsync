-- 0008_update_reserve_logic.sql

-- RPC fonksiyonunu güncellememiz gerekebilir ama şu anki temel `reserve_inventory` fonksiyonu
-- "Stok Düş" mantığıyla çalıştığı için platformdan bağımsızdır (Anostic).
-- Ancak, `reason_code` alanını zenginleştirmek veya `market_iso` eşleştirmesi yapmak isteyebiliriz.

-- SENARYO: Amazon'dan sipariş geldiğinde, sadece "Amazon US" stoğundan düşmeli.
-- Bu durumda n8n'den gelen `market_iso` parametresi kritik.
-- Amazon Ingest workflow'unda bu parametrenin doğru ayarlandığından emin olunmalı (örn. 'US', 'DE').

-- Ledger tablosuna 'source' kolonu ekleyelim ki raporlamada "Hangi sipariş Amazon'dan geldi?" görelim.
alter table inventory_ledger 
add column if not exists source_platform text check (source_platform in ('shopify', 'amazon', 'tiktok', 'etsy', 'manual', 'other'));

-- Fonksiyonu güncellemek yerine, var olan yapıyı koruyarak sadece INSERT kısmına source ekleyebiliriz.
-- Ancak RPC parametrelerini değiştirmek breaking change'dir. 
-- Şimdilik en temizi: `reserve_inventory` fonksiyonunun imzasını güncellemek.

drop function if exists reserve_inventory;

create or replace function reserve_inventory(
    p_sku text,
    p_location_id uuid,
    p_market_iso text,
    p_quantity integer,
    p_reference_id text,
    p_transaction_id text,
    p_shop_id uuid,
    p_source_platform text default 'shopify' -- NEW PARAMETER
)
returns boolean
language plpgsql
as $$
declare
    v_item_id uuid;
    v_current_available integer;
    v_current_reserved integer;
    v_level_id uuid;
begin
    -- 1. Find the item ID (Scoped by Shop ID)
    select id into v_item_id from inventory_items 
    where sku = p_sku and shop_id = p_shop_id;
    
    if v_item_id is null then
        return false;
    end if;

    -- 2. Lock
    select id, available_stock, reserved_stock
    into v_level_id, v_current_available, v_current_reserved
    from inventory_levels
    where inventory_item_id = v_item_id
      and location_id = p_location_id
      and market_iso = p_market_iso
      and shop_id = p_shop_id
    for update;

    if v_level_id is null or v_current_available < p_quantity then
        return false;
    end if;

    -- 3. Update Inventory
    update inventory_levels
    set available_stock = available_stock - p_quantity,
        reserved_stock = reserved_stock + p_quantity
    where id = v_level_id;

    -- 4. Ledger (With Source Platform)
    insert into inventory_ledger (
        inventory_item_id,
        location_id,
        market_iso,
        change_amount,
        previous_balance,
        new_balance,
        reason_code,
        reference_id,
        transaction_id,
        shop_id,
        source_platform -- NEW FIELD
    ) values (
        v_item_id,
        p_location_id,
        p_market_iso,
        -p_quantity,
        v_current_available,
        v_current_available - p_quantity,
        'ORDER',
        p_reference_id,
        p_transaction_id,
        p_shop_id,
        p_source_platform
    );

    return true;
end;
$$;
