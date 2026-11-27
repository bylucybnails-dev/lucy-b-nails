create table public.deposit_incidents(
 payment_id text not null check(payment_id ~ '^[0-9]{1,30}$'),
 appointment_id uuid not null references public.deposit_checkouts(appointment_id) on delete restrict,
 seller_id text not null,
 kind text not null check(kind in ('refunded','partial_refund','charged_back','in_mediation','amount_mismatch','late_or_unavailable','duplicate_deposit')),
 provider_updated_at timestamptz not null,
 amount_ars numeric(14,2) not null check(amount_ars>=0),
 refunded_ars numeric(14,2) not null check(refunded_ars>=0 and refunded_ars<=amount_ars),
 recorded_at timestamptz not null default now(),
 reviewed_at timestamptz,
 primary key(payment_id,kind,provider_updated_at)
);
alter table public.deposit_incidents enable row level security;
revoke all on public.deposit_incidents from public,anon,authenticated;
grant select,update(reviewed_at) on public.deposit_incidents to authenticated;
grant select,insert on public.deposit_incidents to service_role;
create policy deposit_incidents_admin_read on public.deposit_incidents for select to authenticated using ((select auth.jwt())->'app_metadata'->>'lucy_role'='admin');
create policy deposit_incidents_admin_review on public.deposit_incidents for update to authenticated using ((select auth.jwt())->'app_metadata'->>'lucy_role'='admin') with check ((select auth.jwt())->'app_metadata'->>'lucy_role'='admin');
create function public.record_deposit_incident(p_booking uuid,p_seller text,p_payment text,p_kind text,p_updated timestamptz,p_amount numeric,p_refunded numeric)
returns jsonb language plpgsql set search_path='' as $$
declare c public.deposit_checkouts%rowtype;
begin
 select * into c from public.deposit_checkouts where appointment_id=p_booking;
 if not found or c.seller_id is distinct from p_seller then raise exception 'unknown_checkout';end if;
 if exists(select 1 from public.deposit_payments where payment_id=p_payment and (appointment_id<>p_booking or seller_id<>p_seller)) then raise exception 'payment_identity_conflict';end if;
 if p_updated is null or p_updated>now()+interval '5 minutes' or p_amount is null or p_refunded is null or p_amount<0 or p_refunded<0 or p_refunded>p_amount or p_amount>999999999999 or p_amount<>round(p_amount,2) or p_refunded<>round(p_refunded,2) then raise exception 'invalid_incident';end if;
 insert into public.deposit_incidents(payment_id,appointment_id,seller_id,kind,provider_updated_at,amount_ars,refunded_ars) values(p_payment,p_booking,p_seller,p_kind,p_updated,p_amount,p_refunded) on conflict do nothing;
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function public.record_deposit_incident(uuid,text,text,text,timestamptz,numeric,numeric) from public,anon,authenticated;
grant execute on function public.record_deposit_incident(uuid,text,text,text,timestamptz,numeric,numeric) to service_role;