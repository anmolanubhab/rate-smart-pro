# RD-Pro Trading & Distribution ERP — Implementation Plan

This is a large scope (Sales OTC, Purchase P2P, Voucher upgrade, Approvals, Security, Audit). Building it in one shot is high-risk. I'll split into 6 sequential phases, each independently shippable and non-destructive to the current ERP.

Before starting Phase A, I need 3 decisions (see "Decisions needed" below).

---

## Phase A — Sales Order Lifecycle + Sales Configuration
Extend the existing `orders` table (already has draft/pending/partial/completed/cancelled) with the new lifecycle.

- New columns on `orders`: `approved_at`, `approved_by`, `invoiced_at`, `invoice_id`, `delivery_address`, `transport_*`, `eway_*`.
- New enum values added to `order_status`: `approved`, `invoiced`, `closed` (keep existing).
- New table `sales_config` (per business): toggles for Approval, Packing Slip, Box/Case, Transport, E-Way, Salesman, Multi-warehouse, Batch, Partial Dispatch, Invoice Approval.
- Orders page: add Approve / Cancel / Generate Invoice actions, status pill reflects full flow, fields conditionally rendered from `sales_config`.
- New `/settings/sales-config` page.

## Phase B — Packing + Dispatch Enhancements
Extend existing `dispatches` table.

- New columns: `packing_slip_number`, `box_count`, `case_count`, `packing_remarks`, `transporter`, `lr_number`, `vehicle_number`, `eway_number`, `dispatch_remarks`.
- `next_packing_slip_number()` RPC.
- Dispatch form gains Packing tab + Transport tab (both gated by sales_config).
- Partial dispatch already supported by `pending_qty`; surface "Balance" column.

## Phase C — Sales Invoice
New `sales_invoices` + `sales_invoice_items` tables, generated **only** from an approved Sales Order.

- "Generate Invoice" button on order → creates invoice, auto-fetches party/items/discounts/GST, marks order `invoiced`.
- Auto-posts existing `orders_autopost_sales` logic moves from order-completion to invoice-creation. (Order completion no longer auto-posts to vouchers.)
- Stock reduction moves from dispatch trigger to invoice-post trigger (configurable — default: keep current dispatch-reduces-stock, invoice just bills).
- New `/sales/invoices` list + print/PDF reusing existing `InvoicePrint`.
- Sales Register report (filter on existing `vouchers` of type `sales`).

## Phase D — Purchase Order → GRN → Purchase Invoice
All new, mirrors Sales.

- Tables: `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `purchase_invoices`, `purchase_invoice_items`, `purchase_config`.
- RPCs: `next_po_number`, `next_grn_number`, `next_pi_number` (use existing `voucher_number_series` framework where possible).
- Triggers: GRN approval → stock+ + inventory_movement; PI post → creditor ledger Cr + Purchase Dr + GST Input Dr (auto voucher).
- Pages: `/purchase/orders`, `/purchase/grn`, `/purchase/invoices`, `/settings/purchase-config`.

## Phase E — Voucher Center Upgrade (Receipt/Payment/Contra/Journal)
Voucher Center scope-down + entry forms.

- Remove Sales/Purchase from Voucher Center filter (they're now driven by invoices).
- New full entry forms for Receipt & Payment with party outstanding fetch + bill-wise adjustment grid (Against Ref / Advance / On Account).
- Contra & Journal: simple Dr/Cr line entry.
- Posts via existing `vouchers` + `voucher_items` (already balance-validated).

## Phase F — Approvals + Security + Audit
- New `approval_requests` table (entity_type, entity_id, requested_by, status, decided_by, decided_at, reason).
- `/approvals` center: tabs SO / PO / Invoices / Vouchers, role-gated (manager/owner/super_admin).
- New `accounting_security` table per business: allow_edit, allow_delete, require_approval_edit/delete, freeze_date, period_lock_until.
- Edit/Delete actions on financial docs check security settings → either block, route to approval, or proceed.
- Extend `audit_logs` usage: every action on orders/dispatches/invoices/vouchers writes old_value/new_value/reason via existing `logAudit()`.

---

## Technical notes
- All new tables: `business_id` + `user_id`, RLS via `is_business_member`/`has_business_role`, GRANTs to authenticated + service_role.
- All numbering uses `voucher_number_series` (extend enum: `sales_order`, `packing_slip`, `purchase_order`, `grn`, `purchase_invoice`).
- UI: reuse `MockTablePage` pattern for lists, `useBusiness().can(role, perm)` for action gating, existing design tokens (no new color classes).
- Non-destructive: existing Orders→Dispatch flow keeps working until user enables new toggles in sales_config.

---

## Decisions needed before I start

1. **Phase order / scope of this turn**
   - (a) Just Phase A (Sales Order lifecycle + config) — smallest safe slice, ~1 migration + 3 files
   - (b) Phases A + B + C (full Sales OTC: order → packing/dispatch → invoice) — recommended foundation
   - (c) All 6 phases now — large, higher risk

2. **Invoice vs Order auto-posting**
   - (a) Keep existing trigger: order completion auto-posts sales voucher; invoice is just a print doc
   - (b) Move auto-posting to invoice generation; order completion no longer posts (cleaner, matches your spec)

3. **Stock reduction point**
   - (a) Stock reduces on **dispatch** (current behavior)
   - (b) Stock reduces on **invoice** posting
   - (c) Configurable per business in sales_config

Reply with picks (e.g. "1b, 2b, 3a") and I'll start Phase A migration.