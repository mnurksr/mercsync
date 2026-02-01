-- 0002_rpc_functions.sql

-- Helper function to update timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_inventory_levels_modtime
    before update on inventory_levels
    for each row
    execute procedure update_updated_at_column();


-- RPC: Reserve Inventory (Pessimistic Locking)
create or replace function reserve_inventory(
    p_sku text,
    p_location_id uuid,
    p_market_iso text,
    p_quantity integer, -- Positive number
    p_reference_id text,
    p_transaction_id text
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
    -- 1. Find the item ID
    select id into v_item_id from inventory_items where sku = p_sku;
    if v_item_id is null then
        raise notice 'Item not found: %', p_sku;
        return false;
    end if;

    -- 2. Lock the specific inventory level row for update
    -- This waits for other transactions to release the lock on this specific row
    select id, available_stock, reserved_stock
    into v_level_id, v_current_available, v_current_reserved
    from inventory_levels
    where inventory_item_id = v_item_id
      and location_id = p_location_id
      and market_iso = p_market_iso
    for update; -- PESSIMISTIC LOCK

    if v_level_id is null then
        raise notice 'Inventory level not found for item % in location % market %', p_sku, p_location_id, p_market_iso;
        return false;
    end if;

    -- 3. Check availability
    if v_current_available < p_quantity then
        -- Not enough stock
        return false;
    end if;

    -- 4. Update Inventory Levels
    update inventory_levels
    set available_stock = available_stock - p_quantity,
        reserved_stock = reserved_stock + p_quantity
    where id = v_level_id;

    -- 5. Insert into Ledger
    insert into inventory_ledger (
        inventory_item_id,
        location_id,
        market_iso,
        change_amount,
        previous_balance,
        new_balance,
        reason_code,
        reference_id,
        transaction_id
    ) values (
        v_item_id,
        p_location_id,
        p_market_iso,
        -p_quantity, -- Stock is decreasing from available
        v_current_available,
        v_current_available - p_quantity,
        'ORDER',
        p_reference_id,
        p_transaction_id
    );

    return true;
end;
$$;

-- RPC: Commit Inventory (Shipped)
-- Removes from reserved_stock permanently.
create or replace function commit_inventory(
    p_sku text,
    p_location_id uuid,
    p_market_iso text,
    p_quantity integer,
    p_reference_id text,
    p_transaction_id text
)
returns boolean
language plpgsql
as $$
declare
    v_item_id uuid;
    v_level_id uuid;
    v_current_reserved integer;
begin
    select id into v_item_id from inventory_items where sku = p_sku;
    
    select id, reserved_stock into v_level_id, v_current_reserved
    from inventory_levels
    where inventory_item_id = v_item_id
      and location_id = p_location_id
      and market_iso = p_market_iso
    for update;

    if v_level_id is null or v_current_reserved < p_quantity then
        return false;
    end if;

    update inventory_levels
    set reserved_stock = reserved_stock - p_quantity
    where id = v_level_id;

    -- Ledger entry for shipment (Operational note: strictly speaking ledger tracks available stock, 
    -- but we can track the event. Since available stock didn't change here (it changed at reservation),
    -- change_amount relative to available_stock is 0, but we log the event.)
    -- HOWEVER, to keep it simple and meaningful, user report says: 
    -- "commit_inventory fonksiyonu, rezerve_stok miktarını azaltırken ledger tablosuna 'SHIPMENT' kodlu yeni bir kayıt ekler."
    
    insert into inventory_ledger (
        inventory_item_id,
        location_id,
        market_iso,
        change_amount,
        previous_balance, -- This might be confusing as it refers to available, let's keep it consistent
        new_balance,
        reason_code,
        reference_id,
        transaction_id
    ) values (
        v_item_id,
        p_location_id,
        p_market_iso,
        0, -- Available stock doesn't change, it was already deducted
        (select available_stock from inventory_levels where id = v_level_id),
        (select available_stock from inventory_levels where id = v_level_id),
        'SHIPMENT',
        p_reference_id,
        p_transaction_id
    );

    return true;
end;
$$;

-- RPC: Release Inventory (Cancel Order)
-- Moves stock back from reserved to available.
create or replace function release_inventory(
    p_sku text,
    p_location_id uuid,
    p_market_iso text,
    p_quantity integer,
    p_reference_id text,
    p_transaction_id text
)
returns boolean
language plpgsql
as $$
declare
    v_item_id uuid;
    v_level_id uuid;
    v_current_available integer;
    v_current_reserved integer;
begin
    select id into v_item_id from inventory_items where sku = p_sku;
    
    select id, available_stock, reserved_stock 
    into v_level_id, v_current_available, v_current_reserved
    from inventory_levels
    where inventory_item_id = v_item_id
      and location_id = p_location_id
      and market_iso = p_market_iso
    for update;

    if v_level_id is null or v_current_reserved < p_quantity then
        return false;
    end if;

    update inventory_levels
    set available_stock = available_stock + p_quantity,
        reserved_stock = reserved_stock - p_quantity
    where id = v_level_id;

    insert into inventory_ledger (
        inventory_item_id,
        location_id,
        market_iso,
        change_amount,
        previous_balance,
        new_balance,
        reason_code,
        reference_id,
        transaction_id
    ) values (
        v_item_id,
        p_location_id,
        p_market_iso,
        p_quantity, -- Adding back to available
        v_current_available,
        v_current_available + p_quantity,
        'RETURN', -- or ADJUSTMENT/CANCELLATION
        p_reference_id,
        p_transaction_id
    );

    return true;
end;
$$;
