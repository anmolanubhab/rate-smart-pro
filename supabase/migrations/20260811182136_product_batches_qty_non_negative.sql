-- Batch Tracking QA: the Add/Edit Batch form allowed typing a negative
-- quantity directly (no server-side guard existed, only the separate
-- adjustProductBatchQty() helper used by GRN/dispatch flows checked this).
-- Add a DB-level floor so no code path — present or future — can push a
-- batch's on-hand quantity below zero.
ALTER TABLE public.product_batches
  ADD CONSTRAINT product_batches_qty_non_negative CHECK (qty >= 0);
