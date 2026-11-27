create or replace function private.validate_manual_schedule() returns trigger language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; d text; t text; 
begin
if tg_op='UPDATE' then
 if (new.city,new.starts_at,new.ends_at) is not distinct from (old.city,old.starts_at,old.ends_at) then return new; end if;
 if old.source<>'manual' or old.status<>'confirmed' or new.status<>'confirmed' or old.starts_at<=now() or new.ends_at-new.starts_at<>old.ends_at-old.starts_at then raise exception 'invalid_reschedule'; end if;
end if;
if new.source<>'manual' then return new; end if;
if new.starts_at<=now() or new.ends_at-new.starts_at not between interval '15 minutes' and interval '8 hours' then raise exception 'invalid_schedule'; end if;
select payload into cfg from public.shop_config where id=1;
d=to_char(new.starts_at at time zone 'America/Argentina/Cordoba','YYYY-MM-DD');
t=to_char(new.starts_at at time zone 'America/Argentina/Cordoba','HH24:MI');
if new.starts_at<>date_trunc('minute',new.starts_at) or not exists(select 1 from jsonb_array_elements(cfg->'slots') s where (s->>'z')::int=new.city and s->>'date'=d and s->>'time'=t and not (s->>'busy')::boolean) or exists(select 1 from jsonb_array_elements(cfg->'blockedDays') b where (b->>'z')::int=new.city and b->>'date'=d) or exists(select 1 from jsonb_array_elements(cfg->'slots') s where (s->>'busy')::boolean and ((s->>'date')::date+(s->>'time')::time) at time zone 'America/Argentina/Cordoba' >=new.starts_at and ((s->>'date')::date+(s->>'time')::time) at time zone 'America/Argentina/Cordoba' <new.ends_at) then raise exception 'unavailable'; end if;
return new;
end;$$;
revoke all on function private.validate_manual_schedule() from public,anon,authenticated;
create trigger validate_manual_schedule before insert or update of city,starts_at,ends_at on public.appointments for each row execute function private.validate_manual_schedule();
grant update(city,starts_at,ends_at) on public.appointments to authenticated;
alter policy owner_cancel_manual on public.appointments with check ((select auth.jwt()->'app_metadata'->>'lucy_role')='admin' and source='manual' and status in ('confirmed','cancelled'));