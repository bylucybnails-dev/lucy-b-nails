create or replace function private.validate_city_days() returns trigger language plpgsql security invoker set search_path='' as $$
begin
if exists(select 1 from jsonb_array_elements(new.payload->'slots') s group by s->>'date' having count(distinct s->>'z')>1 and not (coalesce(new.payload->'approvedMixedDays','[]'::jsonb) ? (s->>'date'))) then raise exception 'mixed_city_day_requires_confirmation'; end if;
return new;end;$$;