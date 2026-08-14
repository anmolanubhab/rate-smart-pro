-- GST Module Production Audit — cleanup.
--
-- einvoice_cancel(_record_id, _reason) and ewaybill_cancel(_record_id) were
-- defined in 20260729090000_gst_engine_milestone6_compliance.sql (GST Engine
-- Milestone 6), then superseded within days by einvoice_cancel_record(...)
-- (20260804190828, GST Compliance Suite Phase 2) and ewaybill_cancel_record(
-- _record_id, _reason) (20260804193120, Phase 3) — same purpose, different
-- name/signature (the _record variants add a _reason param ewaybill_cancel
-- lacked). Confirmed via grep of src/lib/gstProvider.ts (the only frontend
-- caller of either family) that it calls exclusively the _record variants;
-- the old functions have been dead schema since Phase 2/3 shipped and were
-- never dropped. Removing them so there is exactly one cancel path per
-- document type, matching the intent of migration 20260729030100's earlier
-- overload cleanup for gst_split_amounts.
DROP FUNCTION IF EXISTS public.einvoice_cancel(uuid, text);
DROP FUNCTION IF EXISTS public.ewaybill_cancel(uuid);
