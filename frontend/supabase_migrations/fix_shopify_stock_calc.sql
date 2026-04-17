-- ============================================================
-- Fix: calc_shopify_stock_from_map()
-- 
-- The previous function was likely failing or returning 0 because the location_inventory_map
-- is stored as JSONB but sometimes written as a stringified JSON array. 
-- Also, selected_location_ids is a text[] array.
-- This updated function correctly parses the JSONB, handles stringified json,
-- loops through it, and correctly casts fields to calculate the precise shopify_stock_snapshot.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calc_shopify_stock_from_map()
RETURNS TRIGGER AS $$
DECLARE
    total_stock integer := 0;
    loc jsonb;
    map_data jsonb;
BEGIN
    -- 1. Extract the JSONB data properly
    -- If it's a string scalar (e.g. `"[{...}]"`), parse it into an actual jsonb array.
    IF jsonb_typeof(NEW.location_inventory_map) = 'string' THEN
        BEGIN
            map_data := (NEW.location_inventory_map#>>'{}')::jsonb;
        EXCEPTION WHEN others THEN
            map_data := '[]'::jsonb;
        END;
    ELSE
        map_data := NEW.location_inventory_map;
    END IF;

    -- 2. If map is null or empty, return 0
    IF map_data IS NULL OR jsonb_typeof(map_data) != 'array' OR jsonb_array_length(map_data) = 0 THEN
        NEW.shopify_stock_snapshot := 0;
        RETURN NEW;
    END IF;

    -- 3. If selected_location_ids is NULL or empty, we could do 0, or we could sum everything.
    -- In your architecture, we only sum if the location exists in selected_location_ids.
    IF NEW.selected_location_ids IS NULL OR array_length(NEW.selected_location_ids, 1) IS NULL THEN
        NEW.shopify_stock_snapshot := 0;
        RETURN NEW;
    END IF;

    -- 4. Iterate over each location map object and sum up 'available' quantity
    FOR loc IN SELECT * FROM jsonb_array_elements(map_data)
    LOOP
        -- Check if the object's "location_id" is within the selected_location_ids PostgreSQL text array
        IF (loc->>'location_id') = ANY(NEW.selected_location_ids) THEN
            total_stock := total_stock + COALESCE((loc->>'available')::numeric, (loc->>'stock')::numeric, 0)::integer;
        END IF;
    END LOOP;

    NEW.shopify_stock_snapshot := total_stock;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Recalculate everything to retroactively fix the master_stock and snapshots
UPDATE public.inventory_items
SET updated_at = NOW() 
WHERE shopify_variant_id IS NOT NULL;
