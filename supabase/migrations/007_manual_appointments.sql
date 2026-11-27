alter table public.appointments add column source text not null default 'online' check(source in ('online','manual'));
create policy owner_insert_manual on public.appointments for insert to authenticated with check ((select auth.jwt()->>'email')='by.lucyb.nails@gmail.com' and (select auth.jwt()->'app_metadata'->>'provider')='email' and source='manual' and status='confirmed' and payment_id is null and deposit_ars=0);
create policy owner_cancel_manual on public.appointments for update to authenticated using ((select auth.jwt()->>'email')='by.lucyb.nails@gmail.com' and (select auth.jwt()->'app_metadata'->>'provider')='email' and source='manual' and status='confirmed') with check ((select auth.jwt()->>'email')='by.lucyb.nails@gmail.com' and (select auth.jwt()->'app_metadata'->>'provider')='email' and source='manual' and status='cancelled');
grant insert(city,starts_at,ends_at,customer_name,customer_phone,selection,total_ars,deposit_ars,status,source) on public.appointments to authenticated;
grant update(status) on public.appointments to authenticated;
-- Projection trigger needs narrowly scoped elevated permissions for owner operations.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create function private.sync_occupied_interval() returns trigger language plpgsql security definer set search_path='' as $$
begin
if NEW.status in ('held','confirmed','payment_review') then
insert into public.occupied_intervals(appointment_id,starts_at,ends_at) values(NEW.id,NEW.starts_at,NEW.ends_at) on conflict(appointment_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
else delete from public.occupied_intervals where appointment_id=NEW.id; end if;
return NEW; end; $$;
revoke all on function private.sync_occupied_interval() from public,anon,authenticated;
drop trigger sync_occupied on public.appointments;
create trigger sync_occupied after insert or update on public.appointments for each row execute function private.sync_occupied_interval();
