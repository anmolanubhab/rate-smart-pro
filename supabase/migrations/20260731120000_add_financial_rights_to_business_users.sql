-- Per-employee "Financial Rights" (Phase 6 of the Team & Permission System
-- doc): Can Edit Locked Voucher, Can Backdate Voucher, Can Delete Voucher,
-- Can Change GST, Can Change Rate, Can Change Discount, Can Change Cost
-- Price, Can View Profit. Stored as one jsonb column (missing key = false),
-- mirroring the existing per-user boolean-column convention already used
-- for login control (login_enabled, require_2fa, etc.) on this same table.
-- No new RLS -- the existing business_users write policy already governs it.
--
-- Only 3 of the 8 keys get real enforcement in this stage (can_delete_voucher,
-- can_edit_locked_voucher, can_view_profit) -- the rest are stored now and
-- enforced in a later phase, matching the precedent already set by
-- require_2fa/office_only_login/registered_device_only on this table.

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS financial_rights jsonb NOT NULL DEFAULT '{}'::jsonb;
