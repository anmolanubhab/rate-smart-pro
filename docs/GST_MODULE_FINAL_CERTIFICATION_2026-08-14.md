# RD-Pro GST Module — Final Production Certification

Date: 2026-08-14
Follow-up to: [`GST_MODULE_AUDIT_2026-08-14.md`](GST_MODULE_AUDIT_2026-08-14.md) (root-cause fixes, error-handling fixes, RLS/isolation verification — all preserved, not reopened).

## 1. Composition Scheme

**Previous defect:** `businesses.gst_enabled` / `businesses.composition_scheme` / `businesses.default_gst_pct` were set by the Business Setup/Edit wizards but read by nothing — no calculation, report, or DB function ever consulted them. Separately, `business_gst_registrations.registration_type` (a proper, constrained, business-scoped, RLS-protected enum: `regular | composition | casual | sez | export_only | unregistered`, already exposed in the "Company GST Details" UI on `/gst/configuration`) was *also* write-only — set by the user, never read. A business could select "Composition" and every invoice/report would silently keep computing standard Regular-scheme CGST/SGST/IGST as if nothing had changed.

**Root cause:** the correct source-of-truth field already existed (`business_gst_registrations.registration_type`); it was simply never wired into the calculation or reporting paths. No new duplicate field was needed or created.

**Architecture decision:** RD-Pro's accounting engine has no Composition-specific tax logic (flat levy on turnover, no ITC, Bill of Supply instead of Tax Invoice, quarterly CMP-08 instead of GSTR-1/3B) — implementing that correctly is a distinct, legally-specific feature, not a bugfix, and building a partial/best-guess version risked producing confidently-wrong filings, which is worse than blocking. Per the instructions for this pass, I implemented **Option 2: explicitly prevent the unsupported path with a clear message**, rather than Option 1 (full implementation).

**Implementation:**
- New DB function `gst_business_registration_type(_business_id, _as_of date)` (migration `20260814150000_gst_composition_scheme_guard.sql`) resolves the business's primary registration's type as of a given date (so changing scheme later never retroactively reinterprets a historical invoice), falling back to `'regular'` when no registration is configured (preserves existing behavior for businesses that never set one up). `STABLE`, `SECURITY INVOKER` — RLS on `business_gst_registrations` applies normally.
- `src/lib/gstCalc.ts`: added `getGstRegistrationType()` and `assertRegularGstScheme(businessId, asOf, context)` — throws a clear, actionable error (names the registration type, points at GST Configuration) for anything other than `regular`.
- `src/lib/salesInvoices.ts`: both invoice-generation entry points (`generateInvoiceFromDispatch`, `generateInvoiceFromOrder`) now call `assertRegularGstScheme` before doing any work — a non-Regular business cannot generate a Sales Invoice at all, so no wrongly-taxed invoice can ever be created.
- `src/pages/gst/Gstr3B.tsx`: fetches the registration type; for anything other than Regular, replaces the Output/ITC/Net-Payable tables with an explicit "GSTR-3B is not available for a '{type}' registration" message and disables the export button. Purchases are still allowed to be recorded (a composition-scheme business still needs to book what it bought), but the report that would otherwise misrepresent it as claiming standard ITC is blocked.
- `src/pages/gst/GstConfiguration.tsx`: added a visible warning banner under "Company GST Details" when the primary registration is non-Regular, explaining the same limitation before the user even tries to invoice.

**Database changes:** one new function, no table/column changes, no data rewritten, fully backward-compatible (falls back to `'regular'` for every existing business with no registration row, which is the current common case).

**Invoice-level behavior (Section 4 test matrix):** could not be executed end-to-end against real invoice rows (see §2 — no seed data / no login). Verified instead by direct inspection and one live RPC call against the connected database:

| Test | What was verified | Result |
|---|---|---|
| `gst_business_registration_type()` with no registration row | Returns `'regular'` (fallback branch) | **PASS** — ran live: `select gst_business_registration_type('00000000-0000-0000-0000-000000000000')` → `regular` |
| `gst_business_registration_type()` with a primary `composition` registration active on the given date | Would return `'composition'` per the `WHERE is_primary = true AND valid_from <= _as_of AND (valid_to IS NULL OR valid_to >= _as_of)` clause | **Not exercised live** — would require inserting a registration row; deferred to avoid writing test config into a production-connected project without explicit sign-off (see §2 for the same constraint applied to invoices) |
| Sales invoice generation blocked for non-Regular | `assertRegularGstScheme` is called as the very first statement in both `generateInvoiceFromDispatch` and `generateInvoiceFromOrder`, before any DB writes | **Verified by code inspection + `tsc --noEmit` + production build**, not by driving the actual UI |
| GSTR-3B blocked for non-Regular | `isRegular` gate wraps the entire fetch effect and the render | **Verified by code inspection + build**, not by driving the actual UI |
| Interstate / exempt / discount / credit-note composition scenarios (Tests A–E from the work order) | N/A — these are downstream of "can a composition business even generate an invoice," and the answer is now categorically no | **Blocked at the gate**, so the specific scenarios can't be reached; this is the intended outcome, not a gap |

**Report behavior:** GSTR-3B shows the explicit block message; GST Configuration shows the warning banner. GSTR-1, HSN Summary, Tax Register, and GST Dashboard were **not** given the same explicit block in this pass — since Sales Invoice creation is now gated at the source, a non-Regular business simply has zero sales invoices to show in those reports, which is accurate (not silently wrong), so an additional block there was judged lower-priority than the two places (invoice creation, GSTR-3B) where the original defect actually manifested. Flagged as a P2 follow-up below.

## 2. Live Reconciliation — Blocker 2

**Status: not executed. Verdict remains NOT READY FOR PRODUCTION on this basis. No results are fabricated below.**

What I confirmed about the environment before deciding how to proceed:
- `list_projects` on the connected Supabase account returns exactly **one** project (`zskfuioojivdqmqkzjqc`), and it's the same project backing the deployed production URL given in the original audit request. There is no separate staging/dev project to safely seed.
- `sales_invoices` and `purchase_invoices` are both empty (0 rows) in that project.
- I have no interactive login/session for the RD-Pro application itself (no username/password, no active browser session for this app) — driving real Sales/Purchase Invoice creation through the actual UI (the only sanctioned way per the work order, since it exercises real invoice/ledger/inventory/GST posting logic and numbering) requires a login I don't have.
- Creating a new user account is outside what I'm permitted to do, regardless of data safety concerns.
- I do have direct SQL access to this project via the Supabase MCP tool (effectively service-role/superuser), which could insert rows directly into `sales_invoices`/`sales_invoice_items`/etc. — but the work order explicitly prohibits this ("do not insert fake rows directly into final financial tables if doing so would bypass invoice creation logic / ledger posting / inventory movement / GST posting / voucher creation / numbering / triggers") and separately prohibits seeding production without explicit safety confirmation. Both conditions apply here, so I did not do this.

What I *did* do that's safe and doesn't touch financial data: ran the DB's existing `gst_engine_run_tests()` unit-test harness (defined in GST Engine Milestone 2). It inserts/deletes only a `TEST0001` fixture row in `hsn_master`/`gst_rates` (cleaned up on both success and exception paths — verified empty afterward) and asserts against `gst_split_amounts`, `gst_calculate_line`, `gst_rate_on_date`, `gst_validate_gstin_checksum`, and both ITC-reversal rules directly. All 9 assertions passed:

| Test | Result |
|---|---|
| `gst_split_amounts`: intra-state → CGST+SGST | PASS (cgst=500.00 sgst=500.00 igst=0) |
| `gst_split_amounts`: inter-state → IGST | PASS (igst=1000) |
| `gst_split_amounts`: B2C place-of-supply fallback → IGST | PASS (igst=1000) |
| `gst_validate_gstin_checksum`: rejects malformed input | PASS |
| `gst_rate_on_date`: historical date resolves old rate (12%) | PASS |
| `gst_rate_on_date`: current date resolves new rate (18%) | PASS |
| `gst_calculate_line`: end-to-end intra-state @18% | PASS (cgst=90.00 sgst=90.00 igst=0) |
| `gst_itc_reversal_rule42`: matches hand-computed example | PASS (total=2500.00) |
| `gst_itc_reversal_rule43`: matches hand-computed example | PASS (got 40.00) |

**This confirms the DB-side calculation primitives are correct in isolation. It is explicitly NOT a substitute for Phase 28** — it doesn't touch `sales_invoices`, doesn't exercise the frontend `gstCalc.ts` write paths this and the prior audit modified, and doesn't prove Sales Invoice → Tax Register → GSTR-1 → GSTR-3B → Ledger actually agree end-to-end for a real posted transaction.

**What is needed to actually complete Phase 28** (pick one):
1. **You run the 8 test transactions yourself** (SALE-01 through SALE-05, PUR-01 through PUR-03, as specified in the work order) in the live app, through the real UI, and share the resulting invoice numbers/IDs — I can then reconcile them read-only against Tax Register / GST Summary / GSTR-1 / GSTR-3B / Ledger via direct SQL, without needing login.
2. **You provide a login** for a test business in this same project (or point me at a genuinely separate staging project) and explicitly authorize me to create test transactions through the app's own workflow — I'd drive it via the Browser tool exactly as instructed (real invoice creation, real credit-note workflow, etc.), then clean up via the app's supported cancellation mechanism afterward.
3. **You explicitly authorize direct-SQL test-data seeding** into this production-connected project, accepting that it bypasses the application's own posting/numbering/trigger logic (i.e., accepting it's a weaker test than options 1–2) — not recommended, and I'd want that confirmation in writing before doing it given the explicit prohibition in the work order.

Until one of these happens, §3's reconciliation matrix below is correctly all "NOT EXECUTED," not "PASS."

## 3. Reconciliation Matrix

| Metric | Expected | Actual | Status |
|---|---:|---:|---|
| Sales taxable value | ₹27,000 (SALE-01 + 02 + 03, SALE-04 exempt) | — | **NOT EXECUTED** |
| Output CGST | ₹900 | — | **NOT EXECUTED** |
| Output SGST | ₹900 | — | **NOT EXECUTED** |
| Output IGST | ₹1,800 | — | **NOT EXECUTED** |
| Purchase taxable value | ₹20,000 (PUR-01 + 02) | — | **NOT EXECUTED** |
| Input CGST | ₹900 | — | **NOT EXECUTED** |
| Input SGST | ₹900 | — | **NOT EXECUTED** |
| Input IGST | ₹1,800 | — | **NOT EXECUTED** |
| GSTR-1 output tax | ₹3,600 | — | **NOT EXECUTED** |
| GSTR-3B output tax | ₹3,600 | — | **NOT EXECUTED** |
| GSTR-3B ITC | ₹3,600 | — | **NOT EXECUTED** |
| Ledger output GST | ₹3,600 | — | **NOT EXECUTED** |
| Ledger input GST | ₹3,600 | — | **NOT EXECUTED** |

(Expected-column figures are the hand-computed values from the work order's own SALE-01/02/03/04 and PUR-01/02 specs, included so the matrix is ready to fill in the moment real transactions exist — they are not claims about actual system output.)

## 4. Regression Tests

| Check | Result |
|---|---|
| GST split math still routes through `src/lib/gstCalc.ts` (not reimplemented inline) | **PASS** — grep confirms all 3 call sites (`salesInvoices.ts` ×2, `purchaseInvoices.ts`) still import and use `splitGstAmount`/`splitGstRate`/`resolveIsInterstate` |
| Interstate RPC failure still throws, doesn't default to intrastate | **PASS** — `resolveIsInterstate` in `gstCalc.ts` unchanged since prior audit; still `throw`s on `error` |
| Payment-reversal guards still fail closed on lookup error | **PASS** — `if (error) throw error` still present in both `assertInvoicePaymentReversed` (`salesInvoices.ts`) and `assertPurchaseInvoicePaymentReversed` (`purchaseInvoices.ts`) |
| GSTR-3B / GST Summary / GST Dashboard / Tax Register still show an error state instead of ₹0.00 on query failure | **PASS** — code inspection confirms `loadError`/`isError` branches from the prior audit are intact; not independently re-broken by this pass's edits (Gstr3B.tsx was touched again for the composition gate, and its `loadError` branch was preserved and re-verified) |
| `einvoice_cancel`/`ewaybill_cancel` remain dropped, nothing references them | **PASS** — re-queried `pg_proc` live: neither function exists in the database; `gst_business_registration_type` (this pass's new function) does |
| TypeScript compile (`tsc --noEmit`) | **PASS** |
| Production build (`npm run build`) | **PASS** — clean, same pre-existing chunk-size warning as before, unrelated to GST |
| All GST routes still registered/load-bearing | **Not independently re-verified via browser this pass** (no UI smoke test was run in the prior audit either, for the same no-login reason) — routes were not touched, only the components' internal logic, so no route-registration risk was introduced |

## 5. Files Changed (this pass)

- `src/lib/gstCalc.ts` — added `GstRegistrationType`, `getGstRegistrationType()`, `assertRegularGstScheme()`
- `src/lib/salesInvoices.ts` — call `assertRegularGstScheme()` at the top of both invoice-generation functions
- `src/pages/gst/Gstr3B.tsx` — registration-type gate, blocking message, export disabled for non-Regular
- `src/pages/gst/GstConfiguration.tsx` — warning banner for non-Regular primary registration

(Prior-pass files — `hsnSummary.ts`, `pricing/engine.ts`, `purchaseInvoices.ts`, `GstSummary.tsx`, `GstDashboard.tsx`, `TaxRegister.tsx`, `Gstr9.tsx` — untouched this pass, per instruction not to reopen already-fixed areas.)

## 6. Migrations

- `20260814150000_gst_composition_scheme_guard.sql` (this pass) — adds `gst_business_registration_type(uuid, date)`, `SECURITY INVOKER`/`STABLE`, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`. No table/column/data changes.
- (Prior pass, unchanged) `20260814140000_gst_audit_drop_orphaned_cancel_fns.sql` — drops `einvoice_cancel`, `ewaybill_cancel`.

## 7. Remaining Issues

**P0:** None identified.

**P1:**
- Live Phase-28 cross-module reconciliation still not executed (Blocker 2, §2) — this alone keeps the verdict at NOT READY.
- `GstSummary.tsx`, `Gstr1.tsx`, `TaxRegister.tsx`, `HsnSummary.tsx`/`HsnSummaryPurchase.tsx`, `GstDashboard.tsx` don't yet show the same explicit "not supported for this registration type" message as GSTR-3B — currently harmless (they'll just be correctly empty for a non-Regular business since it can't create sales invoices), but inconsistent with the "explicit warning everywhere" spirit of the fix. Recommend applying the same gate for consistency before full sign-off on Composition handling.

**P2:**
- `GstConfiguration.tsx` and `HsnMaster.tsx` still don't distinguish "query failed" from "genuinely empty" (carried over from the prior audit, not addressed this pass).
- `purchaseInvoices.ts`'s `fetchPendingPOItemsForInvoice` still treats a failed prior-invoices lookup as "none exist" (carried over, not addressed this pass).
- Legacy `businesses.gst_enabled`/`composition_scheme`/`default_gst_pct` columns remain in the schema, still written by the Business wizards, still unused by any calculation now that `business_gst_registrations.registration_type` is the wired-in source of truth. Not removed this pass (touches wizard UI, out of scope for a backward-safe migration) — candidate for cleanup once confirmed nothing else reads them.

**P3:** None new this pass.

## 8. Final Verdict

# NOT READY FOR PRODUCTION

**Exact blockers:**
1. **Live cross-module reconciliation (Phase 28) has not been executed.** This requires one of the three options listed in §2 — none of which I can resolve unilaterally (no login, not permitted to create accounts, not permitted to seed production financial tables without explicit sign-off). This is the sole remaining hard blocker from the original two.
2. Composition Scheme is now architecturally safe (blocked with a clear message, not silently wrong) rather than "fully correct" — that's an accepted, documented trade-off per the work order's own Option 2, not an open defect, but worth stating plainly: a business that actually needs working Composition-scheme filing still cannot get it from RD-Pro today. If your rollout includes composition-scheme businesses, that's a real product gap, just no longer a silent-correctness one.

Once you choose one of the §2 options and the Phase-28 matrix in §3 is filled in with real PASS results, this module can be re-certified.
