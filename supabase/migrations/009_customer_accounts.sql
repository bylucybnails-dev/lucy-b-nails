alter table public.appointments add column customer_user_id uuid references auth.users(id) on delete set null;
alter table public.appointments add column lookup_code uuid not null default gen_random_uuid();
create unique index appointments_lookup_code_idx on public.appointments(lookup_code);
create policy customer_read_own on public.appointments for select to authenticated using (customer_user_id=(select auth.uid()));
-- Guest lookup uses a separate server endpoint; no public table access.
