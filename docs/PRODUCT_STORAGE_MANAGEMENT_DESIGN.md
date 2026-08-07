# Product Storage Management (Racking / Bin Location) — Design

Phase 1 design for giving every product a warehouse "address" — Zone → Rack →
Bin — so staff can locate stock instantly and RD Pro can start behaving like a
real WMS, not just an accounting system with a `stock` column. This document
covers schema, migration plan, integration with existing flows, and what is
deliberately deferred to Phase 2/3.

**Status:** approved (v2 — incorporates review feedback below). Ready for
Phase 1 implementation.

## 1. What already exists (audit)

RD Pro already has more multi-location plumbing than it looks like from the
UI. Before adding anything, here's the current state:

| Concept | Status |
|---|---|
| `warehouses` table | Exists (`warehouses`, columns: `id, business_id, warehouse_name, address, is_default, status`). Auto-seeds a "Main Warehouse" per business via `seed_default_warehouse()` trigger. |
| `warehouse_id` on transactions | Already present on `goods_receipts`, `dispatches`, `purchase_orders`, `inventory_adjustments`, `stock_transfers` (from/to), `stock_take_sheets`, `product_batches`, `product_serials`. |
| Warehouse-level stock | **Not a stored balance.** `get_warehouse_available_stock(product_id, warehouse_id)` computes it live: the default warehouse is the *residual* (`products.stock` minus everything the ledger says is elsewhere), non-default warehouses are a pure `sum(inventory_movements.qty)`. No table to keep in sync, always reconciles by construction. |
| `inventory_movements` | The one true ledger. Every stock-affecting event (GRN, dispatch, adjustment, transfer) writes a row here with `product_id, movement_type, qty, warehouse_id, stock_before/after, reference_id/type, value, rate`. |
| Rack/location on products | `products.location` and `products.rack` are free text, not FK'd to anything, not used by any trigger — display-only today. |
| Stock levels on products | `min_stock`, `max_stock`, `reorder_point`, `low_stock_threshold` **already exist** on `products`. Nothing to add here. |
| GRN → stock | `grn_item_apply_hold_stock()` trigger on `goods_receipt_items`: accepted qty → `products.stock` + `inventory_movements(movement_type='purchase_grn', warehouse_id=<GRN's warehouse>)`. |
| Sales → stock | Stock is deducted at **Dispatch**, not Invoice, by `dispatch_items_stock_sync()` on `dispatch_items` → `products.stock` + `inventory_movements(movement_type='dispatch', warehouse_id=<dispatch's warehouse>)`. |
| Stock Transfer | Already a real two-step workflow (`dispatch_stock_transfer` → `in_transit`, `receive_stock_transfer` → `received`), warehouse-to-warehouse, writes `transfer_out`/`transfer_in` rows to `inventory_movements`. `stock_transfer_items` already exists (product, qty — no bin fields yet). Has a header check constraint `from_warehouse_id <> to_warehouse_id` — **this blocks intra-warehouse bin moves and needs relaxing, see §7.** |
| Batch / Serial | `product_batches`, `product_serials` tables already exist with `warehouse_id`. Not wired into GRN/dispatch triggers yet — future phase, but the tables are there. |

**Implication for this design:** the codebase's established pattern for
multi-location stock is *ledger-residual*, not a maintained balance table. No
denormalized `stock_bin_balance` table, no separate `stock_bin_history` table
— we extend the one ledger (`inventory_movements`) with a `bin_id` column and
compute balances on read, exactly like `get_warehouse_available_stock()` does
today. This directly satisfies the "reuse existing tables, don't duplicate"
constraint and avoids introducing a second source of truth.

### 1a. Drift confirmed and fixed (review item Q3)

Inspected the live database directly (Supabase project `zskfuioojivdqmqkzjqc`)
to confirm what earlier was a suspicion:

| Object | Tracked in a migration? | Live state |
|---|---|---|
| `warehouse_stock` table | No | Exists, RLS + policies + `ws_updated_at` trigger all present, but **0 rows** and no writer anywhere. Only reader is a safe-delete `EXISTS` check. Genuinely dead — nothing computes warehouse stock from it (see next rows). |
| `get_stock_summary()` | No | Exists — the real ledger-based engine (`inventory_movements` opening/inward/outward/closing) that everything actually reads. |
| `get_warehouse_stock_summary()` | No | Exists — thin wrapper grouping `get_stock_summary()` by warehouse. This is what `src/lib/inventoryReports.ts` calls. |
| `set_updated_at()` | No | Exists — a second `updated_at` trigger function, separate from `touch_updated_at()` used elsewhere. `warehouse_stock`'s trigger uses this one. |

All four were created directly on production outside the migration history.
Per your instruction, Phase 1 now includes a migration
(`product_storage_phase1_00_reconcile_drift.sql`, run **first**) that
`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`s all four with
their exact live definitions, so `supabase/migrations` stops lying about
what's actually in production. This does not change any behavior — it only
makes the repo replayable to a fresh database again. (`warehouse_stock` the
table stays as inert dead weight for now — dropping it is a separate,
lower-risk cleanup, out of scope here since something already reads it for
safe-delete checks.)

## 2. Hierarchy

```
Warehouse (existing table)
 └─ Zone            (new: warehouse_zones)
     └─ Rack        (new: warehouse_racks)
         └─ Bin      (new: warehouse_bins — shelf is a column on bin, not its own table)
```

No separate `warehouse_shelves` table — shelf is an attribute (`shelf_code`)
of a bin row.

## 3. Location code vs. scan code

Two distinct identifiers per bin, per review item 6:

- **`location_code`** — human-readable, derived: `<WarehouseCode>-<ZoneCode>-<RackCode>-<ShelfCode>-<BinCode>`,
  e.g. `WH001-A-01-B-02` (no shelf segment when `shelf_code` is null). Recomputed
  whenever the bin is re-racked (moved to a different rack/zone, code renamed).
- **`scan_code`** — the identifier a QR/barcode actually encodes. Defaults to
  `location_code` at creation but is stored independently, so renaming or
  re-racking a bin later (location_code changes) does **not** invalidate
  printed QR labels already stuck on physical shelves. Regenerating
  `scan_code` (reprinting labels) is a separate, deliberate action.

`warehouses` gets a new `code text` column (`WH001`, `WH002`, ... — see §11
Q1), auto-backfilled, editable. `location_code` is computed by a
`BEFORE INSERT/UPDATE` trigger on `warehouse_bins` (a stored generated column
can't join across tables), and both `location_code` and `scan_code` are
`UNIQUE` per business.

## 4. Schema

### New tables

```sql
warehouse_zones
  id uuid pk
  business_id uuid  → businesses
  warehouse_id uuid → warehouses
  code text          -- 'A'
  name text
  is_active boolean default true
  created_at, updated_at
  UNIQUE (warehouse_id, code)

warehouse_racks
  id uuid pk
  business_id uuid  → businesses
  zone_id uuid      → warehouse_zones
  code text          -- '01'
  name text
  status text not null default 'active'
    check (status in ('active','blocked','under_maintenance'))
  created_at, updated_at
  UNIQUE (zone_id, code)

warehouse_bins
  id uuid pk
  business_id uuid   → businesses
  rack_id uuid       → warehouse_racks
  shelf_code text null   -- 'B'
  bin_code text          -- '02'
  location_code text     -- computed, e.g. 'WH001-A-01-B-02'
  scan_code text          -- QR/barcode identity, defaults to location_code, independently stable
  bin_type text not null default 'NORMAL'
    check (bin_type in ('NORMAL','RETURN','DAMAGE','QC','RESERVED','STAGING','PACKING'))
  status text not null default 'active'
    check (status in ('active','blocked','under_maintenance'))
  capacity_qty numeric null
  capacity_weight numeric null
  capacity_volume numeric null
  is_locked boolean not null default false     -- stock lock during audit, see review item 7
  is_unassigned boolean default false          -- system residual bin, see §6
  merged_into_bin_id uuid null → warehouse_bins -- set when retired via merge, see §7a
  created_at, updated_at
  UNIQUE (business_id, location_code)
  UNIQUE (business_id, scan_code)
  UNIQUE (rack_id, shelf_code, bin_code)

product_locations
  id uuid pk
  business_id uuid  → businesses
  product_id uuid   → products
  bin_id uuid       → warehouse_bins
  is_default boolean default false
  priority integer not null default 1   -- pick order: 1 = pick first
  created_at, updated_at
  UNIQUE (product_id, bin_id)
  UNIQUE (product_id) WHERE is_default  -- partial index: one default per product
```

`product_locations.priority` (review item 1) drives pick order when a
product sits in several bins — e.g. a pick-face bin at priority 1, bulk
overstock at priority 2/3. Picking UI/RPCs order by `priority asc`, then by
oldest ledger movement at that bin as a tiebreak (see §7).

`bin_type`, `status`, and `capacity_weight`/`capacity_volume` (review items
2–4) are plain nullable/defaulted columns with no enforcement logic in Phase
1 — no trigger currently rejects put-away into a `DAMAGE` bin or checks
capacity. They exist so Phase 2 (put-away rules, capacity warnings) is a
logic-only change, not a schema change.

Zones keep `is_active` only (no `status` enum) — you asked specifically for
*rack* status; extending the same enum to bins too (rather than zones) keeps
symmetry with racks while letting a single bin go into maintenance without
blocking its whole rack.

### Extended existing tables (additive, nullable — nothing breaks)

| Table | New column | Purpose |
|---|---|---|
| `warehouses` | `code text` | short code for location_code composition |
| `products` | `default_bin_id uuid → warehouse_bins` | Product Master's "Default Rack/Bin". Default *warehouse* is deliberately **not** a separate column — derived from `default_bin_id → rack → zone → warehouse`, so it can never disagree with the bin. |
| `inventory_movements` | `bin_id uuid → warehouse_bins` | turns the existing ledger into the bin-level history too — this *is* "Bin-wise Stock History", no new table. |
| `inventory_movements` | `movement_reason text null` | review item 8 — free-text/reason code (e.g. "cycle count adjustment", "QC hold reversed") for audit trail, independent of `notes` which is already used for system-generated messages. |
| `goods_receipt_items` | `bin_id uuid → warehouse_bins` | put-away bin at GRN line level |
| `dispatch_items` | `bin_id uuid → warehouse_bins` | pick bin at dispatch line level |
| `stock_transfer_items` | `from_bin_id uuid`, `to_bin_id uuid` | bin-to-bin transfer, reusing the existing transfer header/workflow (constraint relaxation needed, see §7) |

`products.location` / `products.rack` (free text) are left untouched for
backward compatibility; new code reads `default_bin_id` → `location_code`
instead.

**Deferred, not built now (per your "architecture ready, don't implement"
note on item 5):** product/bin category restriction (e.g. medicine → cold
storage, chemical → hazard bin). No `bin_category` or `allowed_product_type`
column is added in Phase 1 — it would be a single nullable column with zero
knock-on effects whenever it's actually needed, so there's nothing to design
now beyond confirming it doesn't require restructuring anything above.

### Bin-wise stock balance — no new table

```sql
create or replace function public.get_bin_available_stock(_product_id uuid, _bin_id uuid)
returns numeric ...
```

Same shape as `get_warehouse_available_stock()`: a warehouse's
`is_unassigned` bin is the residual holder — `warehouse-level available
stock minus sum(ledger qty) at every other bin in that warehouse`; every
other bin is a pure `sum(inventory_movements.qty) where bin_id = X`. Index:
`inventory_movements(product_id, bin_id)`.

"Bin-wise Stock Report" is a view over this, grouped by product/bin —
read-only, no storage.

## 5. Migration plan

Ordered, idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` throughout, each
one safe to re-run), each reversible via `DROP COLUMN`/`DROP TABLE`:

0. `product_storage_phase1_00_reconcile_drift.sql` — formalize
   `warehouse_stock`, `get_stock_summary()`, `get_warehouse_stock_summary()`,
   `set_updated_at()` exactly as they exist on production today (§1a). No
   behavior change; pure drift fix, done first so everything after it is
   built on a repo that actually matches production.
1. `product_storage_phase1_hierarchy.sql` — `warehouses.code` (backfilled
   `WH001`, `WH002`, ...); `warehouse_zones`, `warehouse_racks`,
   `warehouse_bins` (with `bin_type`, `status`, `scan_code`, capacity
   columns, `is_locked`, `merged_into_bin_id`) + RLS (`is_business_member`) +
   `touch_updated_at` triggers + `set_bin_location_code()` trigger.
2. `product_storage_phase1_seed_unassigned_bins.sql` — one system
   `is_unassigned` zone/rack/bin per existing warehouse (mirrors
   `seed_default_warehouse`), plus an `AFTER INSERT ON warehouses` trigger so
   every new warehouse gets one automatically.
3. `product_storage_phase1_product_locations.sql` — `product_locations`
   table (with `priority`); `products.default_bin_id`.
4. `product_storage_phase1_ledger_bin_column.sql` — `inventory_movements.bin_id`,
   `.movement_reason`; `get_bin_available_stock()`; `v_bin_stock_balance` view.
5. `product_storage_phase1_grn_putaway.sql` — `goods_receipt_items.bin_id`;
   surgical `CREATE OR REPLACE` of `grn_item_apply_hold_stock()` adding
   `bin_id` resolution (`NEW.bin_id` → product's `default_bin_id` →
   warehouse's unassigned bin) and threading it into the existing
   `inventory_movements` insert. No change to the qty/stock arithmetic —
   same surgical-diff discipline as `20260729140000_warehouse_tag_existing_flows.sql`.
6. `product_storage_phase1_dispatch_picking.sql` — `dispatch_items.bin_id`;
   same surgical treatment of `dispatch_items_stock_sync()`.
7. `product_storage_phase1_bin_transfers.sql` — `stock_transfer_items.from_bin_id/to_bin_id`;
   relax `stock_transfers_diff_warehouse_check` (§7); thread bin_id into
   `dispatch_stock_transfer()` / `receive_stock_transfer()`; add
   `merge_bin()` / `split_bin()` RPCs (§7a).
8. `product_storage_phase1_search_rpc.sql` — `find_product_locations(product_id)`
   RPC for the "one click → location map" search feature.

Every migration is a no-op for existing rows (`bin_id` nullable everywhere)
— nothing in GRN, Dispatch, or Transfer *requires* a bin to be picked.

## 6. The "unassigned" bin

Every warehouse auto-gets one system bin (zone `UNZ` / rack `UN` / bin
`UNASSIGNED`, `bin_type = 'RESERVED'`, `is_unassigned = true`, hidden from
the normal rack/bin picker UI). It's the residual holder for:
- Existing stock that predates this feature (nothing needs a backfill pass).
- GRN/dispatch lines where nobody picked a bin.

Mirrors exactly how the *default warehouse* already absorbs residual stock
today — same pattern, one level deeper.

## 7. Flow integration

**GRN put-away** — after "Select Warehouse" (already exists), add an
optional "Select Rack/Bin" step defaulting to the product's `default_bin_id`
if it belongs to the chosen warehouse, else the warehouse's unassigned bin.

**Sales / picking** — `dispatch_items.bin_id` defaults the same way. Where a
product has stock in multiple bins, the picking UI orders candidate bins by
`product_locations.priority asc`, then by
`min(inventory_movements.created_at)` per bin as a tiebreak — an approximate
FIFO hint using existing timestamps. True lot-level FIFO needs batch/lot
dates and is Phase 3.

**Stock Transfer — constraint fix required.** `stock_transfers` currently
has `check (from_warehouse_id is null or to_warehouse_id is null or
from_warehouse_id <> to_warehouse_id)`. That's correct for warehouse-level
transfers but **blocks the most common bin-transfer case: moving stock
between two bins in the *same* warehouse** (rack reorganization, the
merge/split flows in §7a). Migration 7 relaxes it: drop that check, and add
`check (from_bin_id is null or to_bin_id is null or from_bin_id is distinct
from to_bin_id)` on `stock_transfer_items` instead — Postgres CHECK
constraints can't reference sibling rows, so "something must actually move"
is enforced per-line-item (bins differ) rather than per-header (warehouses
differ). A same-warehouse, bin-only transfer also skips the
`get_warehouse_available_stock` availability check in
`dispatch_stock_transfer()` (warehouse total is unaffected by an internal
bin move) and checks `get_bin_available_stock(from_bin_id)` instead.

**Search** — `find_product_locations(product_id)` returns every bin holding
the product with qty, ordered by qty desc, resolving each `location_code`
plus the human `Warehouse → Zone → Rack → Shelf → Bin` breadcrumb.

**Dashboard** (occupied/empty %, rack count, near-full) — all derived
queries over `warehouse_bins` + `get_bin_available_stock`, no new storage.

### 7a. Bin Merge / Split (review addendum)

Not a new subsystem — it falls directly out of the ledger-residual design
already in place:

- **Merge** (`A01: 100` + emptying `B01: 30` into `A01`) is a same-warehouse
  bin-to-bin transfer of B01's full balance into A01 (via the relaxed
  `stock_transfer_items` above), then `B01.status = 'blocked'` and
  `B01.merged_into_bin_id = A01.id` so history/search still resolves the old
  code to where the stock actually went.
- **Split** (`A01: 100` → `A01: 40` + `B01: 60`) is the same mechanism in
  reverse: a transfer of 60 units from A01 to B01.

Both are just `inventory_movements` rows with `bin_id` set — no merge/split-
specific table needed. Phase 1 ships `merge_bin(_from_bin_id, _to_bin_id)`
and `split_bin(_from_bin_id, _to_bin_id, _product_id, _qty)` as thin RPC
wrappers around the same transfer-insert logic, so the UI has a one-click
action instead of manually building a transfer for a reorganization.

## 8. UI (additive only, no redesign of existing pages)

- New: `src/pages/inventory/Racking.tsx` (or under `Warehouses.tsx` as a
  drill-down) — manage Zones/Racks/Bins per warehouse, tree view, with
  bin_type/status badges and a Merge/Split action on the bin detail panel.
- New: bin picker component (`BinLocationPicker`), reused in GRN line item,
  Dispatch line item, Stock Transfer line item.
- `Products.tsx` product form: add "Default Rack/Bin" field + "Storage
  Locations" tab listing `product_locations` rows with editable priority.
- `Products.tsx` search / product detail: "Location" chip showing
  `location_code`, click → location map.
- Existing GRN/Dispatch/Transfer/Products pages otherwise unchanged.

## 9. Multi-company isolation & security

Every new table carries `business_id` and RLS via `is_business_member(business_id)`,
identical to every table added since `20260630000000.sql`. `warehouse_zones`/
`racks`/`bins` denormalize `business_id` directly rather than requiring a
join through `warehouses` on every RLS check — same choice already made for
`purchase_orders.business_id` alongside its `warehouse_id`.

`is_locked` (review item 7) is enforced at the RPC layer in Phase 1 (GRN
put-away / dispatch picking RPCs reject a locked bin as a target), not via
RLS — RLS would also block legitimate reads (e.g. showing an auditor what's
locked), so the lock is a business-logic gate, not a row-security one.

## 10. What Phase 1 deliberately does NOT do

- Barcode/QR generation for bins (Phase 2). Schema is ready: `scan_code` is
  a stable string a QR can encode today, independent of any later renaming;
  `Barcodes.tsx` / `QrCodeImage.tsx` already exist and can be pointed at
  bins later without any schema change.
- Mobile scanning workflow, Pick List, Put-away List as dedicated screens
  (Phase 2) — the underlying data (`bin_id` on GRN/dispatch lines) is
  already there for these to consume.
- Physical Verification / Cycle Count against bins (Phase 2) —
  `stock_take_sheets` already has `warehouse_id`; adding `bin_id` there is a
  one-column follow-up, not a redesign.
- Product/bin category restriction enforcement (medicine → cold storage
  etc.) — column deliberately not added yet, see §4.
- FEFO/expiry, Batch & Serial wiring into GRN/dispatch triggers, Wave
  Picking, Route Optimization, Heat Map (Phase 3) — `product_batches`/
  `product_serials` tables already exist and already carry `warehouse_id`;
  Phase 3 adds `bin_id` to them the same additive way.

## 11. Open questions — resolved

1. **Warehouse code** — auto-generate (`WH001`, `WH002`, ...), user-editable
   afterward. Not manually mandatory. **Decided.**
2. **Shelf** — optional (`shelf_code` nullable). **Decided.**
3. **`warehouse_stock` drift** — fixed in Phase 1 via migration 0, using the
   actual live definitions pulled from production (§1a). **Done.**

Phase 1 implementation is now the 9 migrations in §5 plus the UI additions
in §8.
