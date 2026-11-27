create table public.deposit_checkouts (
 appointment_id uuid primary key references public.appointments(id) on delete restrict,
 seller_id text not null check(seller_id ~ '^[0-9]{1,30}$'),
 preference_id text not null unique check(length(preference_id) between 1 and 160),
 expected_ars integer not null check(expected_ars>0),
 created_at timestamptz not null default now()
);
create table public.deposit_payments (
 payment_id text primary key check(payment_id ~ '^[0-9]{1,30}$'),
 appointment_id uuid not null references public.deposit_checkouts(appointment_id) on delete restrict,
 seller_id text not null,
 amount_ars numeric(14,2) not null check(amount_ars>=0),
 currency text not null,
 disposition text not null check(disposition in ('applied','late_or_unavailable','duplicate_deposit','amount_mismatch')),
 recorded_at timestamptz not null default now()
);
alter table public.deposit_checkouts enable row level security;
alter table public.deposit_payments enable row level security;
revoke all on public.deposit_checkouts,public.deposit_payments from public,anon,authenticated;
grant select,insert on public.deposit_checkouts,public.deposit_payments to service_role;
CREATE OR REPLACE FUNCTION public.apply_verified_deposit(p_booking uuid, p_seller text, p_payment text, p_amount numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.appointments%rowtype; c public.deposit_checkouts%rowtype; event public.deposit_payments%rowtype; outcome text;
begin
 select * into a from public.appointments where id=p_booking for update;
 if not found then raise exception 'unknown_booking';end if;
 select * into c from public.deposit_checkouts where appointment_id=p_booking;
 if not found or c.seller_id is distinct from p_seller then raise exception 'unknown_checkout';end if;
 if p_amount is null or p_amount<0 or p_amount>999999999999 or p_amount<>round(p_amount,2) or p_currency is null then raise exception 'invalid_amount';end if;
 select * into event from public.deposit_payments where payment_id=p_payment;
 if found then
  if event.appointment_id<>p_booking or event.seller_id<>p_seller or event.amount_ars<>p_amount or event.currency<>p_currency then raise exception 'payment_identity_conflict';end if;
  return jsonb_build_object('disposition',event.disposition,'idempotent',true);
 end if;
 if p_currency<>'ARS' or p_amount<>c.expected_ars or c.expected_ars<>a.deposit_ars then outcome='amount_mismatch';
 elsif a.payment_id is not null then outcome='duplicate_deposit';
 elsif a.source<>'online' or a.status<>'held' or a.expires_at<=now() or a.starts_at<=now() then outcome='late_or_unavailable';
 else outcome='applied';end if;
 insert into public.deposit_payments(payment_id,appointment_id,seller_id,amount_ars,currency,disposition) values(p_payment,p_booking,p_seller,p_amount,p_currency,outcome);
 if outcome='applied' then update public.appointments set status='confirmed',payment_id=p_payment where id=p_booking;end if;
 return jsonb_build_object('disposition',outcome,'idempotent',false);
end $function$
;

CREATE OR REPLACE FUNCTION public.register_deposit_preference(p_booking uuid, p_seller text, p_preference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.appointments%rowtype; c public.deposit_checkouts%rowtype;
begin
 select * into a from public.appointments where id=p_booking for update;
 if not found or a.source<>'online' or a.status<>'held' or a.expires_at<=now() or a.deposit_ars<=0 then raise exception 'hold_unavailable'; end if;
 insert into public.deposit_checkouts(appointment_id,seller_id,preference_id,expected_ars) values(a.id,p_seller,p_preference,a.deposit_ars) on conflict(appointment_id) do nothing;
 select * into c from public.deposit_checkouts where appointment_id=a.id;
 if c.seller_id is distinct from p_seller or c.preference_id is distinct from p_preference then raise exception 'checkout_already_registered';end if;
 return jsonb_build_object('registered',true,'amount',c.expected_ars);
end $function$
;

revoke all on function public.register_deposit_preference(uuid,text,text),public.apply_verified_deposit(uuid,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.register_deposit_preference(uuid,text,text),public.apply_verified_deposit(uuid,text,text,numeric,text) to service_role;
