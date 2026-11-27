create table public.appointments (
 id uuid primary key default gen_random_uuid(),
 city smallint not null check(city in (0,1)),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 customer_name text not null check(char_length(customer_name) between 1 and 120),
 customer_phone text not null check(char_length(customer_phone) between 5 and 40),
 selection jsonb not null check(jsonb_typeof(selection)='array'),
 total_ars integer not null check(total_ars>=0),
 deposit_ars integer not null check(deposit_ars between 0 and total_ars),
 status text not null default 'held' check(status in ('held','confirmed','cancelled','expired','payment_review')),
 expires_at timestamptz,
 payment_id text unique,
 created_at timestamptz not null default now(),
 check(status<>'held' or expires_at is not null),
 exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&) where (status in ('held','confirmed','payment_review'))
);
alter table public.appointments enable row level security;
revoke all on public.appointments from anon,authenticated;
grant select on public.appointments to authenticated;
create policy owner_read_appointments on public.appointments for select to authenticated using ((select auth.jwt()->>'email')='by.lucyb.nails@gmail.com' and (select auth.jwt()->'app_metadata'->>'provider')='email');
grant select,insert,update on public.appointments to service_role;
