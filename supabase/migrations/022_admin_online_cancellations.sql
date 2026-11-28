CREATE TABLE IF NOT EXISTS public.reservation_cancellations (
 appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id),
 admin_id uuid NOT NULL,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
 cancelled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservation_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_cancellations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.reservation_cancellations TO service_role;
CREATE OR REPLACE FUNCTION public.admin_cancel_online_reservation(p_booking uuid,p_admin uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE a public.appointments%rowtype;
BEGIN
 IF p_admin IS NULL OR p_reason IS NULL OR char_length(trim(p_reason)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid_cancellation'; END IF;
 SELECT * INTO a FROM public.appointments WHERE id=p_booking FOR UPDATE;
 IF NOT FOUND OR a.source<>'online' THEN RAISE EXCEPTION 'unknown_online_booking'; END IF;
 IF a.status='cancelled' THEN RETURN jsonb_build_object('status','cancelled','idempotent',true); END IF;
 IF a.status NOT IN ('held','confirmed','payment_review') OR a.attendance IS NOT NULL THEN RAISE EXCEPTION 'not_cancellable'; END IF;
 INSERT INTO public.reservation_cancellations(appointment_id,admin_id,reason) VALUES(p_booking,p_admin,trim(p_reason));
 UPDATE public.appointments SET status='cancelled' WHERE id=p_booking;
 RETURN jsonb_build_object('status','cancelled','idempotent',false);
END $$;
CREATE OR REPLACE FUNCTION public.admin_reservation_payment_state(p_booking uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE a public.appointments%rowtype; p jsonb;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id=p_booking;
 IF NOT FOUND OR a.source<>'online' THEN RAISE EXCEPTION 'unknown_online_booking'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id',payment_id,'seller_id',seller_id,'amount',amount_ars,'currency',currency,'disposition',disposition) ORDER BY recorded_at),'[]'::jsonb) INTO p FROM public.deposit_payments WHERE appointment_id=p_booking;
 RETURN jsonb_build_object('status',a.status,'payments',p);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_online_reservation(uuid,uuid,text),public.admin_reservation_payment_state(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_online_reservation(uuid,uuid,text),public.admin_reservation_payment_state(uuid) TO service_role;