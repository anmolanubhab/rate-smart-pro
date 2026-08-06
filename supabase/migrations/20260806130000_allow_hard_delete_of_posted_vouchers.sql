-- Product decision (see src/lib/voucherService.ts's deleteVoucher()): RD Pro's
-- Voucher Center must allow hard-deleting ANY voucher a user has permission
-- to delete, including an already-posted one -- no more "cancel first"
-- requirement. The only gates left are the accounting-lock check
-- (trg_vouchers_lock stays) and the app's own canDeleteDirectly() permission
-- check.
--
-- trg_prevent_posted_voucher_delete (added in
-- 20260801030000_purchase_and_voucher_delete_firewall.sql as a defense-in-
-- depth backstop for the old draft-delete/posted-cancel convention) directly
-- contradicts that: it unconditionally raises on any DELETE where
-- status = 'posted', regardless of what the application layer allows. Left
-- in place, deleteVoucher() would still fail on any posted voucher no matter
-- what the app-side code does -- confirmed live: a posted test voucher's
-- voucher_items and every back-reference cleared successfully, but the final
-- DELETE on vouchers itself was rejected by this exact trigger.

DROP TRIGGER IF EXISTS trg_prevent_posted_voucher_delete ON public.vouchers;
DROP FUNCTION IF EXISTS public.prevent_posted_voucher_delete();
