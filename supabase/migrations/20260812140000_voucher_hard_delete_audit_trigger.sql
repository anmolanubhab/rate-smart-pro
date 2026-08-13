-- Accounts QA audit (2026-08-12), Priority 5: posted-voucher hard-delete
-- audit trail was only written by the application layer
-- (deleteVoucher()'s logAudit() call in voucherService.ts), which a direct
-- REST/RPC delete bypassing the app would skip entirely -- the delete
-- itself stays correctly gated by trg_prevent_posted_voucher_delete and
-- the RLS role gate (owner/admin/manager/accountant/salesman only), and the
-- ledger is still correctly reversed by voucher_items_balance_trigger, but
-- no audit_logs row would exist for that deletion.
--
-- Fix: move the audit write to a DB-level AFTER DELETE trigger on vouchers,
-- so every permitted hard-delete is recorded regardless of path (UI, REST,
-- RPC). The trigger fires within the deleting user's own session, so
-- auth.uid() still resolves to the real actor and satisfies audit_logs'
-- existing `audit_insert_self` RLS policy (INSERT ... WITH CHECK (user_id =
-- auth.uid())) without needing to bypass RLS. The application's own
-- logAudit() call in deleteVoucher() is removed in the same change (see
-- voucherService.ts) so this trigger becomes the single source of truth --
-- no duplicate rows.

CREATE OR REPLACE FUNCTION public.log_voucher_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (user_id, business_id, action, entity_type, entity_id, old_value)
  VALUES (
    auth.uid(),
    OLD.business_id,
    'HARD_DELETE',
    'vouchers',
    OLD.id,
    jsonb_build_object('voucher_number', OLD.voucher_number, 'voucher_type', OLD.voucher_type, 'status', OLD.status)
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_voucher_hard_delete ON public.vouchers;
CREATE TRIGGER trg_log_voucher_hard_delete
  AFTER DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.log_voucher_hard_delete();

REVOKE ALL ON FUNCTION public.log_voucher_hard_delete() FROM PUBLIC, anon, authenticated;
