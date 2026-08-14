-- ============================================================================
-- Company Access Verification (Number Matching MVP)
--
-- Google/Microsoft-style number-matching gate on "Open Company": desktop
-- authenticates (password) then shows ONE number; the user approves on a
-- second device (mobile web, reached via QR/deep link carrying only an
-- opaque single-use token) by picking the matching number out of three.
--
-- Security model:
--   - RLS on this table has exactly ONE policy: the owning desktop user may
--     SELECT their own row. There is NO insert/update/delete policy for
--     authenticated or anon at all -- every mutation goes through the
--     SECURITY DEFINER RPCs below. This is what makes plain postgres_changes
--     realtime safe to use: a client can never forge status='verified'.
--   - Membership/authorization is re-checked server-side on every session
--     creation via public.is_business_member(), never trusted from the
--     browser.
--   - Numbers are generated with pgcrypto (extensions.gen_random_bytes),
--     never SQL random()/client Math.random().
--   - The mobile-facing RPCs never return the correct number -- only
--     success/failure of a given guess.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_access_verification_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  correct_number   INT NOT NULL CHECK (correct_number BETWEEN 0 AND 99),
  challenge_numbers INT[] NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','verified','expired','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  verified_at      TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  failed_attempts  INT NOT NULL DEFAULT 0,
  max_attempts     INT NOT NULL DEFAULT 5,
  mobile_user_agent TEXT,
  verified_ip      INET
);

CREATE INDEX IF NOT EXISTS idx_cavs_user_business_status
  ON public.company_access_verification_sessions(user_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_cavs_expires_at
  ON public.company_access_verification_sessions(expires_at);

ALTER TABLE public.company_access_verification_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cavs_select_own ON public.company_access_verification_sessions;
CREATE POLICY cavs_select_own ON public.company_access_verification_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for authenticated or anon on purpose --
-- all writes go through the SECURITY DEFINER RPCs below.
GRANT SELECT ON public.company_access_verification_sessions TO authenticated;
GRANT ALL ON public.company_access_verification_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._cavs_secure_number()
RETURNS INT
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT get_byte(extensions.gen_random_bytes(1), 0) % 100;
$$;

REVOKE ALL ON FUNCTION public._cavs_secure_number() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_company_verification_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_company_verification_session(_business_id UUID)
RETURNS public.company_access_verification_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_correct INT;
  v_decoy1 INT;
  v_decoy2 INT;
  v_numbers INT[];
  v_token TEXT;
  v_recent_count INT;
  v_row public.company_access_verification_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'no_access';
  END IF;

  SELECT count(*) INTO v_recent_count
    FROM public.company_access_verification_sessions
   WHERE user_id = v_uid AND business_id = _business_id
     AND created_at > now() - interval '5 minutes';
  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- Single active challenge per user/business.
  UPDATE public.company_access_verification_sessions
     SET status = 'cancelled', cancelled_at = now()
   WHERE user_id = v_uid AND business_id = _business_id AND status = 'pending';

  v_correct := public._cavs_secure_number();
  LOOP
    v_decoy1 := public._cavs_secure_number();
    EXIT WHEN v_decoy1 <> v_correct;
  END LOOP;
  LOOP
    v_decoy2 := public._cavs_secure_number();
    EXIT WHEN v_decoy2 <> v_correct AND v_decoy2 <> v_decoy1;
  END LOOP;

  SELECT array_agg(x ORDER BY random())
    INTO v_numbers
    FROM unnest(ARRAY[v_correct, v_decoy1, v_decoy2]) AS x;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.company_access_verification_sessions (
    user_id, business_id, token, correct_number, challenge_numbers
  ) VALUES (
    v_uid, _business_id, v_token, v_correct, v_numbers
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_verification_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_verification_session(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_verification_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_verification_session(_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_access_verification_sessions
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _session_id AND user_id = auth.uid() AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_verification_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_verification_session(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_verification_challenge_by_token (mobile, anon-callable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_verification_challenge_by_token(_token TEXT)
RETURNS TABLE(business_name TEXT, challenge_numbers INT[], status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT s.*, b.business_name AS biz_name
    INTO v_row
    FROM public.company_access_verification_sessions s
    JOIN public.businesses b ON b.id = s.business_id
   WHERE s.token = _token;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  IF v_row.status = 'pending' AND v_row.expires_at < now() THEN
    UPDATE public.company_access_verification_sessions
       SET status = 'expired'
     WHERE id = v_row.id;
    v_row.status := 'expired';
  END IF;

  RETURN QUERY SELECT v_row.biz_name, v_row.challenge_numbers, v_row.status, v_row.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_verification_challenge_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_verification_challenge_by_token(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- verify_company_number (mobile, anon-callable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_company_number(_token TEXT, _selected_number INT)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_access_verification_sessions%ROWTYPE;
  v_ip INET;
  v_ua TEXT;
BEGIN
  BEGIN
    v_ua := current_setting('request.headers', true)::json ->> 'user-agent';
    v_ip := NULLIF(btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ua := NULL;
    v_ip := NULL;
  END;

  SELECT * INTO v_row
    FROM public.company_access_verification_sessions
   WHERE token = _token
   FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, 'This verification request is invalid.'::TEXT;
    RETURN;
  END IF;

  IF v_row.status = 'pending' AND v_row.expires_at < now() THEN
    UPDATE public.company_access_verification_sessions
       SET status = 'expired'
     WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'This verification request has expired.'::TEXT;
    RETURN;
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN QUERY SELECT false, ('This verification request is ' || v_row.status || '.')::TEXT;
    RETURN;
  END IF;

  IF v_row.failed_attempts >= v_row.max_attempts THEN
    UPDATE public.company_access_verification_sessions
       SET status = 'expired'
     WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'Too many incorrect attempts. This request has expired.'::TEXT;
    RETURN;
  END IF;

  IF _selected_number = v_row.correct_number THEN
    UPDATE public.company_access_verification_sessions
       SET status = 'verified',
           verified_at = now(),
           mobile_user_agent = v_ua,
           verified_ip = v_ip
     WHERE id = v_row.id;
    RETURN QUERY SELECT true, 'Verification successful.'::TEXT;
  ELSE
    UPDATE public.company_access_verification_sessions
       SET failed_attempts = failed_attempts + 1
     WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'Incorrect number. Please select the number currently shown on your computer.'::TEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_company_number(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_company_number(TEXT, INT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
