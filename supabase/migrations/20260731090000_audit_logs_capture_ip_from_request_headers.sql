-- Populate audit_logs.ip server-side from the PostgREST request headers
-- (x-forwarded-for / x-real-ip), since browser JS cannot read the real
-- client IP. Purely additive: only fills NEW.ip when the client didn't
-- already supply one; failures are swallowed so audit inserts never break.
--
-- NOTE: the local supabase/migrations/ folder is known to be behind the
-- live project (see 20260728010000_phase0_role_gate_core_tables.sql), so
-- this file documents a change applied directly to the live project via
-- the Supabase migration tool rather than reconciling the full drift.

CREATE OR REPLACE FUNCTION public.set_audit_log_ip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_headers json;
  v_ip text;
BEGIN
  IF NEW.ip IS NULL THEN
    BEGIN
      v_headers := nullif(current_setting('request.headers', true), '')::json;
      v_ip := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip');
      IF v_ip IS NOT NULL THEN
        NEW.ip := split_part(v_ip, ',', 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NEW.ip := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_set_ip ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_set_ip
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_audit_log_ip();
