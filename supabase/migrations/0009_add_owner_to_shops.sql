-- 0009_add_owner_to_shops.sql

-- Shops tablosunu User (Auth) ile ilişkilendirmemiz gerek.
-- Böylece "Hangi dükkan hangi kullanıcının?" bilebiliriz.

alter table shops 
add column if not exists owner_id uuid references auth.users(id);

-- RLS Update (Kritik!)
-- Kullanıcılar SADECE kendi dükkanlarını görebilmeli.
drop policy if exists "Users can see own shops" on shops;
create policy "Users can see own shops"
on shops for all
using (auth.uid() = owner_id);

-- Items, Ledger vs. tablolarda da RLS'in shop -> owner zinciri üzerinden çalışması gerek
-- ancak şimdilik admin panel (dashboard) için bu yeterlidir.
