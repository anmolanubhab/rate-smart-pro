# Multi-Company Isolation Fix

## Problem
Tables are filtered only by `user_id`. When a user owns/joins multiple companies, every company opens the same dataset because every row belongs to the same user. We need to scope all operational data by `business_id`.

## Approach

### Phase 1 — Schema: add `business_id` everywhere

Add nullable `business_id uuid` column to these tables (backfill, then NOT NULL + index):

- `orders`, `order_items`
- `dispatches`, `dispatch_items`
- `products`, `parties`
- `vouchers`, `voucher_items`
- `ledger_accounts`, `account_groups`
- `sales_invoices`, `sales_invoice_items` (already have business_id nullable — make NOT NULL)
- `inventory_movements`, `inventory_adjustments`
- `order_activity_logs`, `order_import_logs`, `inventory_import_logs`
- `calculations`, `party_discounts`

**Backfill rule**: for each row, set `business_id = (first active business_users row for that user_id, ordered by joined_at asc)`. For users with no business membership, create a default business from their profile (or leave NULL and let app force wizard).

### Phase 2 — RLS rewrite

Replace `auth.uid() = user_id` policies with:

```sql
USING (business_id IS NOT NULL AND public.is_business_member(business_id))
WITH CHECK (business_id IS NOT NULL AND public.is_business_member(business_id) AND user_id = auth.uid())
```

This way any active member of the business can read/write its data; inserts still stamp `user_id` to track who created the row. Role-gated mutations (delete vouchers, edit business, etc.) keep `has_business_role(...)` checks.

### Phase 3 — Active business context in app

- `useBusiness` already exposes `business.id`. Add a hard requirement: **no query runs without `business_id`**.
- New helper `useActiveBusinessId()` that throws/returns null while loading.
- Refactor every `supabase.from(...).select(...).eq("user_id", user.id)` to also `.eq("business_id", businessId)`. Same for inserts — every insert payload includes `business_id`.
- Update React Query keys to include `businessId` so caches separate per company. Add a global `queryClient.clear()` (or per-key invalidation) when active business changes.
- Files affected (broad — touch operational pages/libs):
  - `src/lib/orders.ts`, `src/lib/dispatches.ts`, `src/lib/parties.ts`, `src/lib/products.ts`, `src/lib/salesInvoices.ts`, `src/lib/salesConfig.ts`, `src/lib/accounting.ts`, `src/lib/invoice.ts`, `src/lib/audit.ts`
  - `src/pages/Dashboard.tsx`, `src/pages/Orders.tsx`, `src/pages/PendingOrders.tsx`, `src/pages/Dispatch.tsx`, `src/pages/Products.tsx`, `src/pages/Parties.tsx`, `src/pages/Inventory.tsx`, `src/pages/Reports.tsx`, `src/pages/CreateOrder.tsx`, `src/pages/History.tsx`, `src/pages/ExcelImport.tsx`
  - `src/pages/accounts/*` (Ledger, Vouchers, Cash, Bank, Daybook, Receivables, Payables, TrialBalance, P&L, BalanceSheet)
  - `src/pages/sales/Invoices.tsx`, `src/pages/gst/GstSummary.tsx`
  - `src/components/dashboard/*`, `src/components/InventoryWidgets.tsx`, `src/components/ErpDashboardCards.tsx`, `src/components/CommandMenu.tsx`, etc.

### Phase 4 — Triggers / RPCs

Update auto-post triggers (`orders_autopost_sales`, `sales_invoice_autopost`, `dispatch_items_stock_sync`, `parties_create_ledger`, `ensure_party_ledger`, `seed_accounting_defaults`) to propagate `NEW.business_id` into the rows they create (vouchers, voucher_items, ledger_accounts, account_groups, inventory_movements). `seed_accounting_defaults` becomes per-business instead of per-user.

`next_invoice_number`, `next_order_number`, `next_dispatch_number`, `next_packing_slip_number`, `next_voucher_number` get `_business_id` arg and scope `MAX(...)` by business.

### Phase 5 — Company Selection card actions

In `src/pages/companies/CompanySelection.tsx`, replace the single "Open" affordance with a dropdown menu containing:
- Open Company → existing flow
- Edit Company → `/settings/business?id=…` (existing BusinessProfile page; ensure it loads the chosen biz)
- Manage Users → `/settings/company-users?id=…`
- Company Settings → `/settings/sales-config?id=…`
- Archive Company → soft-delete (`businesses.archived_at`) when transaction count = 0 it can hard-delete, otherwise force archive

Add `archived_at timestamptz` column to `businesses`; filter archived from selection list by default with a "Show archived" toggle.

### Phase 6 — Verification

- Create two companies, add one order in each, confirm dashboards/orders/products are isolated.
- Sign out / sign in, switch via Company Selection, verify caches reset.

## Risks / Notes
- Migration is large and irreversible-ish; backfill must be correct. Users with multiple existing companies but data created before this change will have all their data attached to the **oldest** business (`joined_at ASC`). They can re-assign manually if needed — we'll surface that caveat to the user.
- Volume of code edits is large (~30+ files). Will batch.
- Will not touch unrelated modules (Calculator, Auth, Profile, etc.).

## Decision needed
1. Backfill rule for existing data — attach to **oldest business per user** (recommended) vs. require manual mapping?
2. Run all phases in this turn, or split (Phase 1+2+4 SQL first, then Phase 3 app refactor, then Phase 5 UI)?
