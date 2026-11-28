CREATE OR REPLACE FUNCTION public.create_booking_hold(p_city integer, p_date date, p_time time without time zone, p_revision bigint, p_mode text, p_service integer, p_qty integer, p_extras jsonb, p_removal integer, p_name text, p_phone text, p_duration integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cfg jsonb; rev bigint; s jsonb; r jsonb; entry record; lines jsonb='[]'; total integer=0; dep integer; start_time timestamptz; end_time timestamptz; booking_id uuid; expiry timestamptz=now()+interval '15 minutes'; slot jsonb; amount integer; 
begin
if p_city is null or p_city not in (0,1) or p_mode is null or p_mode not in ('services','own','other') or p_service is null or p_service<0 or p_qty is null or p_qty not between 1 and 10 or p_duration is distinct from 1 or p_extras is null or jsonb_typeof(p_extras)<>'object' or p_removal is null or p_removal< -1 then raise exception 'invalid_selection'; end if;
select payload,revision into cfg,rev from public.shop_config where id=1 for update;
if rev is distinct from p_revision then raise exception 'configuration_changed'; end if;
start_time=(p_date+p_time) at time zone 'America/Argentina/Cordoba'; 
if start_time is null or start_time<=now() then raise exception 'invalid_time'; end if;
select x into slot from jsonb_array_elements(cfg->'slots') x where (x->>'z')::int=p_city and x->>'date'=p_date::text and x->>'time'=to_char(p_time,'HH24:MI');
if slot is null or (slot->>'busy')::boolean or exists(select 1 from jsonb_array_elements(cfg->'blockedDays') b where (b->>'z')::int=p_city and b->>'date'=p_date::text) then raise exception 'unavailable'; end if;

s=cfg->p_mode->p_service;
if s is null then raise exception 'invalid_service'; end if;
if p_qty<>1 and (p_mode<>'services' or s->>0<>'Arreglo por uña') then raise exception 'invalid_quantity'; end if;
amount=(s->>(p_city+1))::int*p_qty; total=amount; lines=jsonb_build_array(jsonb_build_object('name',s->>0,'quantity',p_qty,'amount',amount));
for entry in select * from jsonb_each_text(p_extras) loop
if entry.value='0' then continue; end if;
if p_mode<>'services' or s->>3='promo' or s->>0 in ('Belleza de pies','Arreglo por uña') or entry.key !~ '^[0-9]{1,5}$' or entry.value !~ '^[1-5]$' then raise exception 'invalid_extra'; end if;
r=cfg->'extras'->(entry.key::int);
if r is null or (coalesce(r->>3,'fixed')<>'pair' and entry.value<>'1') then raise exception 'invalid_extra'; end if;
amount=(r->>(p_city+1))::int*entry.value::int;total=total+amount;lines=lines||jsonb_build_array(jsonb_build_object('name',r->>0,'quantity',entry.value::int,'amount',amount));
end loop;
if p_removal>=0 then
if p_mode<>'services' or s->>0 in ('Belleza de pies','Arreglo por uña') then raise exception 'invalid_removal'; end if;
r=cfg->'other'->p_removal;if r is null then raise exception 'invalid_removal'; end if;
amount=(r->>(p_city+1))::int;total=total+amount;lines=lines||jsonb_build_array(jsonb_build_object('name','Retiro otra colega: '||(r->>0),'quantity',1,'amount',amount));
end if;
-- Each published start time is one slot, not an estimated service duration.
end_time=start_time+interval '1 minute'; if exists(select 1 from jsonb_array_elements(cfg->'slots') x where x->>'date'=p_date::text and (x->>'busy')::boolean and ((x->>'date')::date+(x->>'time')::time) at time zone 'America/Argentina/Cordoba' >=start_time and ((x->>'date')::date+(x->>'time')::time) at time zone 'America/Argentina/Cordoba' <end_time) then raise exception 'unavailable'; end if; dep=round(total*(cfg->>'deposit')::numeric/100);
update public.appointments set status='expired' where status='held' and expires_at<=now();
insert into public.appointments(city,starts_at,ends_at,customer_name,customer_phone,selection,total_ars,deposit_ars,status,expires_at) values(p_city,start_time,end_time,trim(p_name),trim(p_phone),lines,total,dep,'held',expiry) returning id into booking_id;
return jsonb_build_object('id',booking_id,'total',total,'deposit',dep,'expires_at',expiry);
end;$function$
;
REVOKE EXECUTE ON FUNCTION public.create_booking_hold(integer,date,time,bigint,text,integer,integer,jsonb,integer,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(integer,date,time,bigint,text,integer,integer,jsonb,integer,text,text,integer) TO service_role;
