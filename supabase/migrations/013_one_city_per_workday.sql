create or replace function private.validate_city_days() returns trigger language plpgsql security invoker set search_path='' as $$
begin
if exists(select 1 from jsonb_array_elements(new.payload->'slots') s group by s->>'date' having count(distinct s->>'z')>1) then raise exception 'one_city_per_day'; end if;
if exists(select 1 from public.appointments a cross join lateral jsonb_array_elements(new.payload->'slots') s where a.status in ('held','confirmed','payment_review') and a.ends_at>now() and s->>'date'=to_char(a.starts_at at time zone 'America/Argentina/Cordoba','YYYY-MM-DD') and (s->>'z')::int<>a.city) then raise exception 'day_has_reservations_in_other_city'; end if;
return new;end;$$;
revoke all on function private.validate_city_days() from public,anon,authenticated;
create trigger validate_city_days before update of payload on public.shop_config for each row execute function private.validate_city_days();