-- 0003_rls_security.sql

-- Enable RLS
alter table inventory_items enable row level security;
alter table inventory_locations enable row level security;
alter table inventory_levels enable row level security;
alter table inventory_ledger enable row level security;

-- Policies for anon (Public)
-- "Anonim (public) erişim tüm tablolarda tamamen kapatılmalıdır."
-- By enabling RLS and creating no policies for 'anon', access is denied by default.

-- Policies for Authenticated (Service Role, specific users)
-- Usually Supabase Service Role bypasses RLS, but for 'authenticated' users (like n8n using a specific user token or service key), we can define policies.

-- Assuming n8n connects via Service Role, it will bypass these.
-- However, if we have a dashboard user, they need read access.

-- Policy: Allow Read Access to Authenticated Users (e.g. Dashboard)
create policy "Allow read access for authenticated users"
on inventory_items for select
to authenticated
using (true);

create policy "Allow read access for authenticated users"
on inventory_locations for select
to authenticated
using (true);

create policy "Allow read access for authenticated users"
on inventory_levels for select
to authenticated
using (true);

create policy "Allow read access for authenticated users"
on inventory_ledger for select
to authenticated
using (true);


-- Policy: WORM (Write Once Read Many) for Ledger
-- "inventory_ledger tablosu ... Sadece sistem servis rolünün INSERT yapmasına izin verilmeli, UPDATE ve DELETE işlemleri veritabanı seviyesinde engellenmelidir."

-- Since Service Role bypasses RLS, we can enforce NO UPDATE/DELETE via a Trigger as an extra layer of safety, 
-- or rely on the fact that we simply won't write an UPDATE policy for anyone.

create or replace function prevent_ledger_update_or_delete()
returns trigger as $$
begin
    raise exception 'Modifying the inventory_ledger is strictly forbidden. It is an append-only log.';
end;
$$ language plpgsql;

create trigger trg_prevent_ledger_change
    before update or delete on inventory_ledger
    for each row
    execute procedure prevent_ledger_update_or_delete();
