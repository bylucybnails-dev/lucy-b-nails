create extension if not exists pg_cron;
select cron.schedule('lucy-expire-unpaid-holds','* * * * *',$job$update public.appointments set status='expired' where status='held' and expires_at<=now();$job$);
create index if not exists appointments_held_expiry_idx on public.appointments(expires_at) where status='held';
