-- 20260803000000_quotation_order_field_parity.sql added `ref_no` and
-- 20260806070000_quotation_basics.sql separately added `reference_no` for
-- the same purpose. Only `reference_no` is used by the live Create
-- Quotation dialog / quotations.ts; `ref_no` is read only by the
-- unrouted, not-yet-wired CreateQuotation.tsx page (a future full-page
-- editor, out of scope for now). Dropping the dead duplicate so the two
-- names stop drifting further apart before more work builds on this table.

ALTER TABLE public.quotations DROP COLUMN IF EXISTS ref_no;

NOTIFY pgrst, 'reload schema';
