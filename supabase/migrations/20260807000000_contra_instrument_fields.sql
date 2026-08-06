-- Contra (Bank Entry) voucher completion: adds the instrument-detail fields
-- Tally/Busy-style Bank Contra needs (Instrument Type, Cheque No./Date,
-- UTR/Reference, Branch) that don't exist anywhere on the Universal Voucher
-- Engine's `vouchers` table today. Nullable on purpose -- these columns are
-- shared across all voucher types at the schema level (cheapest, matches how
-- note_mode/adjustment_category_id were added for Credit/Debit Note), but
-- only Contra's UI (UniversalVoucherEntry.tsx) ever populates them.
--
-- instrument_no deliberately holds either the Cheque Number or the UTR /
-- Reference Number depending on instrument_type -- the two are mutually
-- exclusive per voucher, so one column covers both instead of two mostly-
-- unused columns.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS instrument_type text
    CHECK (instrument_type IS NULL OR instrument_type IN
      ('cash', 'cheque', 'neft', 'rtgs', 'imps', 'upi', 'transfer')),
  ADD COLUMN IF NOT EXISTS instrument_no text,
  ADD COLUMN IF NOT EXISTS instrument_date date,
  ADD COLUMN IF NOT EXISTS bank_branch text;
