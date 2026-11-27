create function public.create_protected_booking_hold(
 p_city integer,p_date date,p_time time,p_revision bigint,p_mode text,p_service integer,p_qty integer,p_extras jsonb,p_removal integer,p_name text,p_phone text,p_duration integer,p_customer uuid
) returns jsonb language plpgsql set search_path='' as $$
declare phone text; held_count int; recent_count int; result jsonb; receipt uuid; appt uuid;
begin
 phone=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(phone)=13 and left(phone,3)='549' then phone=substr(phone,4);
 elsif length(phone)=12 and left(phone,2)='54' then phone=substr(phone,3);end if;
 if length(phone)=11 and left(phone,1)='0' then phone=substr(phone,2);end if;
 if phone !~ '^[0-9]{10}$' or phone ~ '^([0-9])\1{9}$' then raise exception 'invalid_phone';end if;
 -- Serialize all online hold admission, not manual bookings.
 perform pg_catalog.pg_advisory_xact_lock(75218432::bigint);
 select count(*) into held_count from public.appointments where source='online' and status='held' and expires_at>now();
 if held_count>=4 then raise exception 'online_capacity';end if;
 select count(*) into held_count from public.appointments a where a.source='online' and a.status='held' and a.expires_at>now() and (a.customer_phone=phone or (p_customer is not null and a.customer_user_id=p_customer));
 if held_count>=1 then raise exception 'active_hold_exists';end if;
 select count(*) into recent_count from public.appointments a where a.source='online' and a.created_at>now()-interval '1 hour' and (a.customer_phone=phone or (p_customer is not null and a.customer_user_id=p_customer));
 if recent_count>=3 then raise exception 'booking_rate_limit';end if;
 result=public.create_booking_hold(p_city,p_date,p_time,p_revision,p_mode,p_service,p_qty,p_extras,p_removal,p_name,phone,p_duration);
 if (result->>'deposit')::integer<=0 then raise exception 'deposit_unavailable';end if;
 appt=(result->>'id')::uuid;
 update public.appointments set customer_user_id=p_customer where id=appt returning lookup_code into receipt;
 return result||jsonb_build_object('lookup_code',receipt);
end $$;
revoke all on function public.create_protected_booking_hold(integer,date,time,bigint,text,integer,integer,jsonb,integer,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.create_protected_booking_hold(integer,date,time,bigint,text,integer,integer,jsonb,integer,text,text,integer,uuid) to service_role;