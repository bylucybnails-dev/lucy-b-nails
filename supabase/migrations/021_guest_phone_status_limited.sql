CREATE TABLE IF NOT EXISTS public.guest_lookup_limits (
 lookup_key text NOT NULL, bucket timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 1,
 PRIMARY KEY(lookup_key,bucket)
);
ALTER TABLE public.guest_lookup_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_lookup_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.guest_lookup_limits TO service_role;
CREATE OR REPLACE FUNCTION public.lookup_guest_status(p_phone text,p_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE window_start timestamptz=date_trunc('minute',now()); n integer; global_n integer; result jsonb;
BEGIN
 IF p_phone IS NULL OR p_phone !~ '^[0-9]{10}$' OR p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(75218433::bigint);
 DELETE FROM public.guest_lookup_limits WHERE bucket<now()-interval '1 hour';
 INSERT INTO public.guest_lookup_limits(lookup_key,bucket) VALUES('global',window_start) ON CONFLICT(lookup_key,bucket) DO UPDATE SET attempts=public.guest_lookup_limits.attempts+1 RETURNING attempts INTO global_n;
 IF global_n>60 THEN RETURN jsonb_build_object('limited',true); END IF;
 INSERT INTO public.guest_lookup_limits(lookup_key,bucket) VALUES(p_key,window_start) ON CONFLICT(lookup_key,bucket) DO UPDATE SET attempts=public.guest_lookup_limits.attempts+1 RETURNING attempts INTO n;
 IF n>5 THEN RETURN jsonb_build_object('limited',true); END IF;
 SELECT coalesce(jsonb_agg(DISTINCT status),'[]'::jsonb) INTO result FROM public.appointments
 WHERE starts_at>now() AND (status IN ('confirmed','payment_review') OR (status='held' AND expires_at>now()))
 AND regexp_replace(customer_phone,'[^0-9]','','g') IN (p_phone,'549'||p_phone,'54'||p_phone,'0'||p_phone);
 RETURN jsonb_build_object('statuses',result);
END $$;
REVOKE EXECUTE ON FUNCTION public.lookup_guest_status(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_guest_status(text,text) TO service_role;