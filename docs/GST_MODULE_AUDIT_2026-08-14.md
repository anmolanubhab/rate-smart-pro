# GST Module — Production Audit Report

Date: 2026-08-14
Scope: all 14 `/gst/*` routes, their Supabase-side tables/views/functions/RLS, and every write path that produces GST numbers (sales invoices, purchase invoices, pricing preview, manual vouchers).

## A. Bugs Found & Fixed

| Severity | Module | Bug | Root Cause | Fix |
|---|---|---|---|---|
| P1 | Sales/Purchase invoicing | CGST/SGST/IGST split math reimplemented independently in 4 places (`salesInvoices.ts` ×2, `purchaseInvoices.ts`, `pricing/engine.ts`), agreeing only by careful copy-paste, not shared code. A future rounding/cess/composition-scheme change to the DB's `gst_split_amounts()` would silently drift out of sync with these TS copies. | No single source of truth for split math on the frontend. | Extracted [`src/lib/gstCalc.ts`](../src/lib/gstCalc.ts) (`splitGstAmount`, `splitGstRate`, `resolveIsInterstate`) and routed all 4 call sites through it. |
| P1 | Sales/Purchase invoicing | `gst_is_interstate` RPC failures were silently treated as `isInterstate = false`, i.e. a failed interstate check could charge CGST+SGST on what may actually be an interstate transaction — wrong tax type baked permanently into a posted invoice. | `interstateErr ? false : ...` pattern at 3 call sites. | `resolveIsInterstate()` in `gstCalc.ts` now throws instead of defaulting, on the authoritative sales/purchase invoice write paths. (Deliberately left fail-soft only in `pricing/engine.ts`'s live quotation preview — documented inline — since that's a non-final estimate, not the posted invoice.) |
| P1 | Sales/Purchase invoicing | `businesses`/`parties` GSTIN lookups feeding the interstate decision had unchecked `error` — a failed lookup silently fed `undefined` into the split logic instead of aborting invoice creation. | Missing `error` destructuring on 3 Supabase queries. | Added `if (error) throw error` on all 3. |
| P1 | Invoice cancel/delete | `assertInvoicePaymentReversed` / `assertPurchaseInvoicePaymentReversed` (the guard blocking cancel/delete of an invoice with a recorded payment) silently treated a failed lookup query as "no payment found" — **fails open** on a financial-integrity guard. | Unchecked `error` on the payment-allocation lookup. | Added `if (error) throw error` in both guards (`salesInvoices.ts`, `purchaseInvoices.ts`). |
| P1 | GSTR-3B (`/gst/gstr-3b`) | All 4 underlying queries (sales invoices, sales items, purchase invoices, purchase items) had unchecked errors. On any failure, the page rendered a fully-styled, confident **"Net Tax Payable ₹0.00"** table with no error indication — the single worst finding in the audit. | No error state existed in the component at all. | Wrapped the fetch in try/catch, added `loadError` state, and the page now shows *"Could not load GSTR-3B data: …"* instead of a fabricated zero. Export is disabled on error. |
| P1 | GST Summary, Tax Register, HSN Summary ×2, GST Dashboard | Invoice/item list queries had unchecked errors; a failed query silently rendered as "no GST activity this period" (₹0 KPIs, empty tables, "no invoices" messaging) instead of surfacing the failure. | Same unchecked-`error` pattern across `GstSummary.tsx`, `TaxRegister.tsx`, `GstDashboard.tsx`, `hsnSummary.ts` (used by both HSN Summary pages). | Added `error` checks that throw, plus `isError`/error-message rendering in `GstSummary.tsx`, `GstDashboard.tsx` (KPI tiles show "—" and the trend chart shows the error instead of a fake "no invoices" empty state). `TaxRegister.tsx`/HSN Summary pages now correctly reach `ReportRunner`'s existing error UI instead of silently landing in its empty-state branch. |
| P2 | GSTR-9 (`/gst/gstr-9`) | Both `useQuery`s threw correctly internally, but the component never read `isError`, so a failed RPC was indistinguishable from "nothing filed this FY." | `isError` never destructured. | Added `isError`/error-message rendering; annual-summary export disabled on error. |
| P3 | DB schema | `einvoice_cancel(uuid, text)` and `ewaybill_cancel(uuid)` were dead functions, superseded days later by `einvoice_cancel_record`/`ewaybill_cancel_record` (different signature, adds `_reason`) but never dropped. Confirmed via grep that `src/lib/gstProvider.ts` only calls the `_record` variants. | Historical migration cleanup gap. | Dropped both via migration `20260814140000_gst_audit_drop_orphaned_cancel_fns.sql`, applied to the live project. |

**Verified correct, not a bug (documented for the record):**
- Migration `20260814130000_gst_reports_lifecycle_filter.sql` redefines 5 reporting functions (`gst_report_register`, `gst_report_hsn_summary`, `gst_report_note_register`, `gst_reconciliation_invoice_vs_voucher`, `gst_dashboard_summary`) 16 days after their Milestone-4 originals. Diffed both versions: this is a legitimate, well-documented bugfix (joins `vw_document_lifecycle_min` to require `lifecycle_status='posted'`, closing a gap where cancelled sales invoices leaked into GSTR-1/HSN reports, and where the purchase side had **no** lifecycle filter at all). Not a regression.
- All 14 GST-related tables have RLS enabled (`relrowsecurity=true`). All GST report/reconciliation RPCs are `SECURITY INVOKER` (RLS still applies internally even if a caller passes another business's `business_id`). The one `SECURITY DEFINER` function (`gst_2b_import_bulk`) correctly self-checks `has_business_role()` before writing. Multi-business isolation is sound at the DB layer.
- `hsn_master`/`gst_rates` do have proper write RLS (global read + role-gated write) — an earlier architectural pass flagged these as possibly writer-policy-less; confirmed they are not.

## B. Missing Features

**Mandatory (compliance gap, not yet fixed — recommend before relying on this for real filings):**
- **Composition Scheme is inert.** `businesses.gst_enabled`, `businesses.composition_scheme`, `businesses.default_gst_pct` are set by the Business Setup/Edit wizards but are **never read** by any calculation, report, or DB function (confirmed via full-codebase grep and a DB-side search of every function body). A business marked "Composition Scheme" still gets normal-regular-scheme CGST/SGST/IGST invoices, ITC claims, and GSTR-1/3B reporting — the toggle currently does nothing. This needs either real composition-scheme tax logic or the toggle should be removed/disabled until it's implemented, to avoid misleading a composition dealer.

**Recommended (not fixed in this pass — lower stakes than the P1s above, tracked for follow-up):**
- `GstConfiguration.tsx` and `HsnMaster.tsx` still don't distinguish "query failed" from "genuinely empty" (registrations table, HSN list, and the e-Invoice/e-Way/HSN-lock toggles all fall back to an "off"/"none" appearance on a failed fetch).
- `purchaseInvoices.ts`'s `fetchPendingPOItemsForInvoice` treats a failed "prior invoices against this PO" lookup as "no prior invoices," which could let a PO-linked purchase invoice exceed the real pending quantity — a stock/PO-integrity risk, not directly a GST number.
- `pricing/engine.ts`'s live quotation-preview interstate check remains deliberately fail-soft (documented in code) since it's a non-final estimate; the real number is always recomputed authoritatively at invoice-generation time via the now-fixed paths above.

**Future enhancement:**
- No `src/components/gst/*` shared widget layer — every GST page reimplements its own dialogs/tables rather than sharing e.g. a `<CgstSgstIgstBreakdown>` display component. Not a bug, a maintainability observation for whoever extends this module next.

## C. Database Changes Made

- **Migration applied:** `20260814140000_gst_audit_drop_orphaned_cancel_fns.sql` — drops `public.einvoice_cancel(uuid, text)` and `public.ewaybill_cancel(uuid)` (confirmed dead). No data touched, no RLS/constraint changes, fully backward-safe (both functions had zero callers in application code).
- No table/column drops, no historical data modified, no RLS weakened.

## D. GST Reconciliation

Not run against live transaction data in this pass: both `sales_invoices` and `purchase_invoices` are currently **empty (0 rows)** in the connected Supabase project, and building a full Phase-28 test dataset (sales/purchases across multiple rates, interstate/intrastate, credit notes, exempt items) requires interactive login/business setup this session doesn't have access to.

What *was* verified without live data:
- Static trace of Sales Invoice → GST Tax Register → GST Summary → GSTR-1/HSN Summary → GSTR-3B: all now read the same per-line `cgst_amount`/`sgst_amount`/`igst_amount` values as posted on `sales_invoice_items`/`purchase_invoice_items` at invoice-creation time — none of the report pages recompute the split independently (this was already true before this pass; only the *write-side* calculation was deduplicated).
- The DB's own `gst_engine_run_tests()` function (a unit-test harness for `gst_calculate_line`, defined in Milestone 2) exists in the schema for exactly this kind of verification — recommend running it (`select * from gst_engine_run_tests();`) plus a manual Phase-28-style test invoice set once there's a business to test against, before go-live.

**Recommendation:** before production sign-off, create one test business, post the Phase-28 test invoice set (5 sales + 3 purchase scenarios spanning intra/interstate, multiple rates, exempt, credit/debit notes), and diff Sales Invoice totals against Tax Register / GST Summary / GSTR-1 / GSTR-3B / Ledger as originally specified. This audit's code-level fixes make that reconciliation trustworthy once run; they don't substitute for actually running it.

## E. Test Results

| Check | Result |
|---|---|
| TypeScript compile (`tsc --noEmit`) | **Passed**, before and after all fixes |
| Production build (`npm run build`) | **Passed** — clean build, only a pre-existing (unrelated) chunk-size warning |
| RLS enabled on all 14 GST tables | **Passed** |
| Report RPCs are SECURITY INVOKER (RLS enforced internally) | **Passed** |
| `gst_2b_import_bulk` (the one SECURITY DEFINER GST function) self-authorizes | **Passed** |
| HSN/GST-rate master write RLS exists | **Passed** |
| Migration #15 lifecycle-filter diff (no dropped behavior) | **Passed** (verified: net improvement, not a regression) |
| Orphaned `einvoice_cancel`/`ewaybill_cancel` confirmed unused before drop | **Passed** |
| Live cross-module reconciliation test with real invoices (Phase 28) | **Blocked** — no seed data / no interactive session available this pass |
| Browser/UI smoke test of GST pages | **Not run** — requires authenticated login not available in this session; code changes are backend-logic and error-state additions only (verified via type-check + build) |
| Composition-scheme GST treatment | **Failed** (confirmed non-functional — see Missing Features) |

## F. Production Readiness

### NOT READY FOR PRODUCTION

The root-cause fixes in this pass (centralized tax-split math, fixed 3 fail-open error-handling paths including 2 financial-integrity guards, fixed the worst silent-₹0 report bug in GSTR-3B, cleaned up dead DB functions) meaningfully improve correctness and should be merged. But sign-off should wait on:

1. **Decide on Composition Scheme**: either implement real composition-scheme tax treatment or disable/hide the toggle so it can't mislead a composition-registered business.
2. **Run the Phase-28 live reconciliation test** against a real test business once available — this audit fixed the *mechanism* but didn't get to prove it end-to-end with live data in this environment.
3. Optional but recommended before go-live: bring `GstConfiguration.tsx` and `HsnMaster.tsx` up to the same loading/error/empty-state standard already fixed elsewhere in this pass.
