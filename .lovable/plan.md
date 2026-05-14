# Spare Parts Order Management — Integration Plan

This is a large build. I'll integrate it into the existing app (shared sidebar, shared Party master, shared discount logic) in phased milestones so you can review and steer each one.

## Architecture

- One app, one database (Lovable Cloud).
- Extend existing `parties` table (add phone, GST, billing/shipping address, beat, credit limit, outstanding, notes).
- Add new tables: `products`, `orders`, `order_items`, `inventory_adjustments`.
- Reuse existing RD/CD discount resolution from `src/lib/parties.ts`.
- Keep RD Calculator and existing flows untouched in behavior.

## Sidebar (updated)

Dashboard · RD Calculator · Orders · Create Order · Parties · Products · Excel Import · Inventory · Reports · Settings

## Database (new + extended)

```text
parties (extend)
  + phone, gst, billing_address, shipping_address, beat,
    credit_limit, outstanding_balance, notes

products
  id, user_id, part_number (unique per user), name, vehicle_model,
  category (spare/lubricant/accessory), mrp, dealer_rate,
  stock, gst_pct, barcode, status, timestamps

orders
  id, user_id, order_number (auto), order_date, party_id, party_snapshot,
  billing_address, shipping_address, salesman, notes,
  subtotal, discount_total, gst_total, shipping_charges, grand_total,
  status (draft|confirmed|cancelled|completed), mode (RD|CD), timestamps

order_items
  id, order_id, user_id, product_id, part_number, description,
  vehicle_model, mrp, qty, discount_pct, net_rate, gst_pct, total

inventory_adjustments
  id, user_id, product_id, delta, reason, created_at
```

RLS: user-scoped on every table (same pattern as existing tables).

## Milestones

**M1 — Foundation (this turn)**
- Migration: extend `parties`, add `products`, `orders`, `order_items`, `inventory_adjustments` with RLS + order-number sequence per user.
- Sidebar updated with all new routes (placeholder pages where needed).
- Parties page extended with new fields (phone, GST, addresses, beat, credit, outstanding, notes).
- Products page with CRUD + search/filter.
- Shared helpers: `src/lib/orders.ts`, `src/lib/products.ts`.

**M2 — Create Order + Orders list**
- Create Order page: header (auto order #, party autocomplete that auto-loads addresses + discount + RD/CD mode), editable item table with product autocomplete (part # / description), keyboard-friendly entry, live totals (subtotal, discount, GST, shipping, grand total), draft/confirm save.
- Orders list with status filters and detail view.

**M3 — Excel Import + PDF**
- Excel upload (.xlsx/.xls) using SheetJS, smart column mapping (Part Number / Description / Qty / MRP / Discount), preview, highlight missing products, edit-before-save, creates draft order.
- Professional PDF (extend `src/lib/invoice.ts`) with logo, order details, table, totals, GST, signature, QR, terms.

**M4 — Dashboard, Inventory, Reports, Settings polish**
- Order management Dashboard cards (today orders, pending, total sales, top parties, recent orders, quick create).
- Inventory view with low/out-of-stock alerts and manual adjustments.
- Reports (sales by party/date), Settings (company info for PDF, defaults).

## UI

shadcn/ui + Tailwind, TanStack Table for the order grid, mobile-first responsive, keyboard shortcuts in the order grid (Tab, Enter to add row, Del to remove).

## Out of scope for now

Barcode scanning, WhatsApp share, AI suggestions, DSR app, multi-warehouse — schema is left extensible for these.

---

Approve and I'll start with **M1 (foundation: DB migration, sidebar, Parties extension, Products module)**. Each later milestone is one follow-up turn.