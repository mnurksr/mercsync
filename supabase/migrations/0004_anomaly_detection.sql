-- 0004_anomaly_detection.sql

-- 4.1 İstatistiksel Anomali Tespiti (Velocity Anomaly Detection)
-- Z-Score = (CurrentValue - Mean) / StdDev

create or replace view view_hourly_sales_velocity as
select
    inventory_item_id,
    date_trunc('hour', created_at) as hour_bucket,
    sum(abs(change_amount)) as total_sold
from inventory_ledger
where reason_code = 'ORDER'
group by 1, 2;

-- Helper function to calculate Z-Score for a product
create or replace function check_sales_anomaly(
    p_item_id uuid,
    p_lookback_hours integer default 168 -- 1 week
)
returns table (
    is_anomaly boolean,
    current_velocity numeric,
    avg_velocity numeric,
    stddev_velocity numeric,
    z_score numeric
)
language plpgsql
as $$
declare
    v_current_velocity numeric;
    v_avg numeric;
    v_stddev numeric;
    v_z_score numeric;
begin
    -- Get sales in the current (or last completed) hour
    -- For real-time monitoring, we might look at "last 60 minutes" instead of fixed hour buckets,
    -- but for simplicity let's assume we check the last full hour or scale the current partial hour.
    
    -- Simplified: Get sales in the last 1 hour
    select coalesce(sum(abs(change_amount)), 0)
    into v_current_velocity
    from inventory_ledger
    where inventory_item_id = p_item_id
      and reason_code = 'ORDER'
      and created_at > now() - interval '1 hour';

    -- Calculate stats for the lookback period (excluding last 1 hour)
    select 
        avg(hourly_sales),
        stddev(hourly_sales)
    into v_avg, v_stddev
    from (
        select sum(abs(change_amount)) as hourly_sales
        from inventory_ledger
        where inventory_item_id = p_item_id
          and reason_code = 'ORDER'
          and created_at between (now() - (p_lookback_hours || ' hours')::interval) and (now() - interval '1 hour')
        group by date_trunc('hour', created_at)
    ) as stats;

    -- Avoid division by zero
    if v_stddev is null or v_stddev = 0 then
        v_stddev := 1; 
    end if;

    v_z_score := (v_current_velocity - coalesce(v_avg, 0)) / v_stddev;

    return query select
        v_z_score > 3, -- Anomaly Threshold
        v_current_velocity,
        coalesce(v_avg, 0),
        v_stddev,
        v_z_score;
end;
$$;
