create table public.occupied_intervals (appointment_id uuid primary key references public.appointments(id) on delete cascade, starts_at timestamptz not null, ends_at timestamptz not null);
alter table public.occupied_intervals enable row level security;
revoke all on public.occupied_intervals from anon,authenticated;
grant select(starts_at,ends_at) on public.occupied_intervals to anon,authenticated;
create policy read_occupied on public.occupied_intervals for select to anon,authenticated using(ends_at>now());
grant all on public.occupied_intervals to service_role;
create function public.sync_occupied_interval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
if TG_OP='DELETE' then return OLD; end if;
if NEW.status in ('held','confirmed','payment_review') then
insert into public.occupied_intervals(appointment_id,starts_at,ends_at) values(NEW.id,NEW.starts_at,NEW.ends_at) on conflict(appointment_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
else delete from public.occupied_intervals where appointment_id=NEW.id; end if;
return NEW;
end; $$;
revoke execute on function public.sync_occupied_interval() from public,anon,authenticated;
create trigger sync_occupied after insert or update on public.appointments for each row execute function public.sync_occupied_interval();
insert into public.occupied_intervals select id,starts_at,ends_at from public.appointments where status in ('held','confirmed','payment_review');
