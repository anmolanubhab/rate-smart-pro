# GST Engine — Reference

RD-Pro's GST engine, built across seven milestones. This is a technical reference
for developers, auditors, or a CA reviewing the system — what exists, how it's
structured, and where its honest boundaries are.

## Architecture at a glance

```
Masters (hsn_master, gst_rates, business_gst_registrations)
        │
        ▼
Calculation engine (gst_calculate_line, gst_split_amounts, gst_is_interstate, ITC rules)
        │
        ▼
Voucher integration (sales/purchase invoices, returns, debit/credit notes
                      write cgst_amount/sgst_amount/igst_amount/hsn per line item)
        │
        ▼
Reporting engine (gst_report_register, gst_report_hsn_summary,
                   gst_report_note_register, gst_reconciliation_invoice_vs_voucher,
                   gst_dashboard_summary)
        │
        ├──▶ Export & Print (Excel/CSV/PDF/JSON/XML, GST-compliant tax invoice print)
        │
        └──▶ Compliance layer (return lifecycle, GSTR-2A/2B reconciliation,
                                GSTR-9/9C, e-Invoice, e-Way Bill)
```

Every number the compliance layer files or exports is read back from the same
per-line-item `cgst_amount`/`sgst_amount`/`igst_amount` columns the voucher
integration layer writes at invoice-creation time — there is no separate
recomputation path to drift out of sync with what's on the invoice.

## Milestones

| # | Scope | Migration(s) |
|---|---|---|
| 1 | Masters, multi-GSTIN, voucher GST snapshot, filing-schema tables | `gst_engine_milestone1_architecture`, `gst_split_amounts_drop_old_overload` |
| 2 | Calculation engine, effective-dated rates, ITC reversal rules, unit tests | `gst_engine_milestone2_calculation` |
| 3 | Real CGST/SGST/IGST split on purchase-side returns/debit notes | `gst_engine_milestone3_voucher_integration` |
| 4 | Reporting engine (register, HSN summary, note register, reconciliation, dashboard) | `gst_engine_milestone4_reports` |
| 5 | Multi-format export (Excel/CSV/PDF/JSON/XML), GST-compliant tax invoice print | frontend only — `src/lib/gstExport.ts`, `InvoicePrint.tsx` |
| 6 | Compliance layer: return lifecycle, GSTR-2A/2B reconciliation, GSTR-9/9C, e-Invoice/e-Way Bill | `gst_engine_milestone6_compliance` |
| 7 | Performance & QA: RLS hardening, function search_path/grants, missing indexes, dead-table cleanup | `gst_engine_milestone7_performance_qa` |

A cross-cutting fix (`20260729070000_gst_is_interstate_helper` +
backfill) corrected a bug found during Milestone 4 verification: sales
invoices were never writing their CGST/SGST/IGST split at all. See that
migration and the `Fix CGST/SGST/IGST split bugs...` commit for detail.

## Core tables

- `hsn_master`, `gst_rates` (effective-dated), `business_gst_registrations` (multi-GSTIN)
- `sales_invoice_items` / `purchase_invoice_items` — carry `hsn`, `cgst_rate/sgst_rate/igst_rate`, `cgst_amount/sgst_amount/igst_amount` per line
- `voucher_item_gst_detail` — GST snapshot on the voucher/ledger side
- `gst_return_periods` / `gst_returns` / `gst_return_line_items` / `gst_return_approvals` / `gst_return_period_lock_history` / `gst_financial_year_locks` — the filing lifecycle
- `gst_2b_import_lines` — imported GSTR-2A/2B rows for reconciliation
- `einvoice_records` / `ewaybill_records` — local e-Invoice/e-Way Bill payload + response tracking
- `gst_itc_reversals` — Rule 42/43 reversal amounts

## Key functions

Calculation: `gst_calculate_line`, `gst_split_amounts`, `gst_is_interstate`,
`gst_state_code_from_gstin`, `gst_rate_on_date`, `gst_validate_gstin_checksum`,
`gst_itc_reversal_rule42`/`rule43`.

Reporting: `gst_report_register`, `gst_report_hsn_summary`,
`gst_report_note_register`, `gst_reconciliation_invoice_vs_voucher`,
`gst_dashboard_summary`, `gst_report_annual_summary`,
`gst_report_gstr9c_reconciliation`.

Return lifecycle: `gst_return_period_get_or_create` → `gst_return_create_draft`
→ `gst_return_populate_gstr1`/`gstr3b` → `gst_return_file` (locks the period)
→ `gst_return_reopen_for_revision` (owner/admin only) → new draft → refile
(status becomes `revised`). Side workflows: `gst_return_cancel`,
`gst_return_lock_audit`/`unlock_audit` (stronger than a filing lock — survives
reopen), `gst_financial_year_lock`/`unlock`, `gst_return_request_approval`/
`decide_approval` (CA/Tax Auditor sign-off, tracked but not a hard filing gate).

GSTR-2A/2B: `gst_2b_import_bulk` (parses a normalized JSON array, not the raw
GSTN portal export), `gst_2b_reconciliation` (matched/amount_mismatch/
missing_in_books/missing_in_portal, matched by supplier GSTIN + document number).

e-Invoice/e-Way Bill: `einvoice_generate_payload`/`ewaybill_generate_payload`
(build a schema-shaped JSON payload + a `pending` local record),
`einvoice_record_response`/`ewaybill_record_response` (manual entry point for
the IRN / e-way bill number once a real GSP round-trip happens outside this app).

QA: `gst_engine_run_tests()` — a self-contained 9-case unit test harness using
a disposable `TEST0001` HSN fixture it cleans up on both success and exception
paths. Restricted to superuser/service_role only (not part of the app's
public API surface) — run it via the SQL editor, not the app.

## Security model

- Every GST table has RLS enabled. The pattern used throughout: a PERMISSIVE
  policy (`is_business_member(business_id)`) sets the membership baseline,
  and a RESTRICTIVE policy (`has_business_role(business_id, ARRAY[...])`)
  narrows INSERT/UPDATE/DELETE to owner/admin/manager/accountant — RESTRICTIVE
  policies AND together with PERMISSIVE ones, so a viewer/staff member can
  read but never write, even though they pass the membership check.
- Tables written only through SECURITY DEFINER functions (`gst_return_periods`
  and its children, `gst_2b_import_lines`, `gst_financial_year_locks`,
  `gst_return_period_lock_history`) intentionally carry only a SELECT policy
  — direct writes are denied for everyone; the functions run as their owner
  (RLS-exempt) and enforce their own `has_business_role` checks.
- Every SECURITY DEFINER function pins `search_path = public` and revokes
  EXECUTE from `anon` and the implicit `PUBLIC` grant (Supabase's default
  schema privileges grant `anon`/`authenticated` EXECUTE on every new
  function independent of `PUBLIC` — both had to be revoked explicitly).
- Milestone 7 found and fixed one real gap: `gst_returns`, `gst_return_line_items`,
  and `gst_return_approvals` had only the PERMISSIVE membership policy from
  Milestone 1, with no RESTRICTIVE writer gate — unlike every sibling table.
  A viewer/staff member could have called PostgREST directly to mark a return
  filed with a fabricated ARN, tamper with its JSON payload, or forge an
  approval decision, bypassing `gst_return_file`/`gst_return_decide_approval`
  entirely. Fixed by adding the same RESTRICTIVE pattern used everywhere else.

## Honest boundaries

- **No real GSTN/IRP/GSP API integration.** Nothing in this system calls the
  government portal or a GSP. What's built is schema-accurate JSON payload
  generation (GSTR-1, GSTR-3B, e-Invoice, e-Way Bill) plus full local
  lifecycle governance — a business hands the payload to its own configured
  GSP/offline utility and records the response back via the `*_record_response`
  functions. No IRN, ARN, or e-way bill number is ever fabricated.
- **GSTR-2A/2B is import-only**, by design — GSTN populates these from
  suppliers' own filings, so the only correct integration point for an ERP
  is import + reconcile against the purchase register, not generation.
- **GSTR-9C** compares recomputed book totals against the JSON payload of the
  latest filed/revised return per period — it is not a substitute for the
  CA-certified 9C, which also reconciles against audited financial statements
  this system has no representation of.
- **B2CS grouping** in the GSTR-1 payload is by place-of-supply only (not
  place-of-supply + rate, the real GSTR-1 table's full grouping) since
  `gst_report_register` carries summed tax amounts, not a per-invoice rate.
- **No synthetic load testing was run** against this project — the real
  dataset is a handful of rows, and generating thousands of fake rows against
  a project with real business data would itself be an unsafe action. Instead,
  Milestone 7 verified that every FK/lookup column the report functions join
  on already has a covering index (see the migration for the list).

## Extending this further

- New return types (GSTR-2, GSTR-4 for composition dealers, etc.) follow the
  same `gst_return_period_get_or_create` → draft → populate → file shape —
  add a `gst_return_populate_<type>` function and reuse the existing lifecycle
  functions unchanged.
- A real GSP/IRP integration would slot in as an edge function called from
  `einvoice_generate_payload`'s/`ewaybill_generate_payload`'s result, with
  `*_record_response` becoming automatic instead of manual — the local
  record-tracking schema doesn't need to change.
