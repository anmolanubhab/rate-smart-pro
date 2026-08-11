-- Bug found via P3 verification: approve_platform_approval_step finalizes a
-- dispatchable request (module IN platform_staff/platform_role) by jumping
-- straight from 'pending' (single-step chains) or 'in_review' (multi-step
-- chains, once the final step is reached) to 'executed'/'failed' -- it never
-- passes through an intermediate 'approved' status. The original transition
-- table only allowed 'approved'->'executed'/'failed', so every dispatchable
-- request's final approval was rejected by the guard it was supposed to
-- pass. Add the direct pending/in_review -> executed/failed edges.
CREATE OR REPLACE FUNCTION public.platform_approval_requests_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) IN (
    ('draft','pending'),
    ('pending','in_review'),
    ('in_review','in_review'),
    ('in_review','approved'),
    ('pending','approved'),
    ('pending','executed'),
    ('pending','failed'),
    ('in_review','executed'),
    ('in_review','failed'),
    ('approved','executed'),
    ('approved','failed'),
    ('pending','rejected'),
    ('in_review','rejected'),
    ('pending','changes_requested'),
    ('in_review','changes_requested'),
    ('changes_requested','pending'),
    ('pending','cancelled'),
    ('in_review','cancelled'),
    ('changes_requested','cancelled'),
    ('draft','cancelled'),
    ('pending','expired'),
    ('in_review','expired')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal approval status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END;
$$;
