# Phase 1 — Read-only recovery analysis

**Analysis only. No files created, no repository migration modified, no LIVE writes,
no commits.** Project `zskfuioojivdqmqkzjqc`, 2026-08-15.
Builds on `MIGRATION_RECONCILIATION_2026-08-15.md`.

---

## Headline finding: the drift has TWO layers, not one

Restoring the 90 missing LIVE migrations **will not** make the repository reproduce LIVE,
and **will not** fix the current replay blocker.

LIVE's `schema_migrations` history begins at `20260704111015`. Everything created before
that point exists on LIVE with **no migration record at all**. Querying LIVE for which
migration creates each of its own tables:

| | Count |
|---|---:|
| LIVE tables in `public` created by some LIVE migration | 40 |
| **LIVE tables with NO creating migration (pre-history)** | **107** |

The pre-history set includes every foundational table: `businesses`, `parties`, `products`,
`orders`, `order_items`, `vouchers`, `sales_invoices`, `sales_invoice_items`, `dispatches`,
`ledger_accounts`, `account_groups`, `business_users`, `inventory_movements`,
`purchase_orders`, `purchase_order_items`, `warehouses`, `goods_receipts`,
`goods_receipt_items`, `purchase_invoices`, `purchase_invoice_items`, **`payment_entries`**.

So the recovery problem is:

```
Layer 1  pre-history (before 20260704111015)   -> NOT recoverable from LIVE history
Layer 2  the 90 missing recorded migrations    -> fully recoverable from LIVE statements
```

Of LIVE's 107 pre-history tables, the repository can create **38**. The remaining
**69 cannot be created by the repository at all**, and no LIVE migration supplies them.
None of the 3 CLI-skipped files help — they cover 0 of the 69.

**`payment_entries`, the current first blocker, is in that 69.** This corrects an earlier
statement in this workstream: `20260717082759 bill_wise_sales_payment_system` *references*
`payment_entries`; it creates `payment_allocations`, not `payment_entries`. Nothing in
LIVE's recorded history creates `payment_entries`.

The 69 (abridged): `payment_entries`, `bank_accounts`, `profiles`, `financial_years`,
`year_closing_entries`, `stock_transfers`, `stock_movements`, `ledger_entries`,
`party_activity_logs`, `notifications`, `departments`, `branches`, `employees`,
`credit_limits`, `bom_master`, `bom_items`, `production_orders`, `schemes`,
`scheme_products`, `scheme_customers`, `subscriptions`, `subscription_plans`,
`feature_flags`, plus the marketplace/ecommerce/pos/retailer/loyalty/crm/whatsapp groups.

---

## 1. Earliest structural gap for fresh replay

**The first replay blocker is NOT a missing migration — it is a pre-history object.**

```text
Blocking object      : public.payment_entries
Blocked migration    : 20260728010000_phase0_role_gate_core_tables.sql  (repo file)
Error                : ERROR: relation "public.payment_entries" does not exist (42P01)
Failing statement    : the DO $$ … FOREACH tbl IN ARRAY [...] $$ block, at element 4
                       ('purchase_orders','goods_receipts','purchase_invoices',
                        'payment_entries', …)
Created by           : *** no LIVE migration -- pre-history ***
Recoverable from     : NOT recoverable from schema_migrations.statements
```

**First downstream consumers of `payment_entries`** (repo files, in replay order):

```text
20260728010000_phase0_role_gate_core_tables.sql        <- current failure
20260731064247_supplier_payments_table.sql
20260802010000_payment_reversal.sql                     ALTER TABLE payment_entries
20260807020000_party_advances_ledger.sql                REFERENCES payment_entries(id)
20260807030000_receive_payment_advance_rpc.sql          INSERT/UPDATE payment_entries
20260808100000_salesman_portal_data_access.sql          CREATE POLICY ON payment_entries
20260809110800_restore_posted_voucher_delete_guard.sql
20260810163000_index_transactional_foreign_keys.sql     CREATE INDEX ON payment_entries
20260814091000_document_lifecycle_ssot.sql              view over payment_entries
20260814150000_hard_delete_document.sql
```

`payment_allocations` (created by missing migration `20260717082759`) is a second-order
dependency: it has `payment_entry_id uuid NOT NULL REFERENCES public.payment_entries(id)`,
so even the recoverable migration cannot apply until the pre-history table exists.

### Dependency chain

```text
[PRE-HISTORY]  public.payment_entries          (no source in LIVE history)
        |
        +--> 20260717082759 bill_wise_sales_payment_system   [MISSING, recoverable]
        |         creates payment_allocations (FK -> payment_entries),
        |                 payment_allocations_apply_delta(), receive_sales_payment(),
        |                 idx_pa_invoice, idx_pa_payment, pa_member_all,
        |                 trg_payment_allocations_delta
        |
        +--> 20260728010000_phase0_role_gate_core_tables.sql  [repo] <- FIRST FAILURE
        |
        +--> 20260802010000_payment_reversal.sql              [repo]
                  ALTER TABLE payment_entries ADD is_reversed/reversed_at/…
```

---

## 2. Missing migrations that create objects the repo needs (Layer 2)

The 90 missing migrations create **116** tables/functions; **60** of those exist nowhere in
the repo (19 tables, 41 functions). Mapping the blocking tables to their source migration:

| Missing LIVE migration | Creates (tables) |
|---|---|
| `20260708065535 measurement_engine_layer_a_and_b` | `units`, `unit_conversions`, `measurement_categories`, `product_units`, `packaging_hierarchy` |
| `20260708074228 party_phase0_groups_and_discount_profiles` | `party_groups`, `party_discount_profiles` |
| `20260711090929 balance_engine_p5` | `party_balance_summary` |
| `20260713091156 company_users_rls_fix_and_invitations` | `business_user_invitations` |
| `20260714085315 inventory_reports_phase1_schema` | `product_categories`, `product_groups`, `opening_stock_entries` |
| `20260717081753 phase2_permission_engine` | `user_permissions`, `permission_templates` |
| `20260717082759 bill_wise_sales_payment_system` | `payment_allocations` |
| `20260718145752 purchase_returns_with_debit_note_voucher` | `purchase_returns`, `purchase_return_items` |
| `20260718150421 sales_returns_with_credit_note_voucher` | `sales_returns`, `sales_return_items` |

These 9 migrations are the Layer-2 structural core. The remaining 81 missing migrations are
ALTERs, RLS/policy work, function replacements and fixes.

Ordering is already determined by their LIVE versions — restoring them under
`<live_version>_<live_name>.sql` places them correctly relative to each other and to the
existing repository files.

---

## 3. The 3 CLI-skipped files

None of the three matches any LIVE migration by content (all classified repo-only), and
none creates any of the 69 unrecoverable pre-history tables.

| File | Contents | Classification | Needed for replay? |
|---|---|---|---|
| `20260622112430 purchase module · SQL` | enum `purchase_order_status`; `purchase_orders`, `purchase_order_items`; indexes, RLS, `trg_po_updated` | **Obsolete pre-history artifact / superseded duplicate.** Header itself says the intended name was `20260622112430_purchase_module.sql`. Its `purchase_order_status` enum matches LIVE's actual type name, so this is the closer of the two purchase drafts to LIVE — but LIVE has no migration record for it. | No |
| `20260622112430 purchase module·SQL` | byte-identical to the above **plus** a trailing `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS part_number/description/position` | **Duplicate of the previous file, one revision newer.** Same timestamp, differs only by a space around the middle dot. | No |
| `20260630000000.sql` | enums `po_status`, `grn_status`, `purchase_invoice_status`; `warehouses`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `purchase_invoices`, `purchase_invoice_items`, `supplier_payments`; functions `seed_default_warehouse`, `grn_apply_stock`, `supplier_payment_apply`, `next_*_number` | **Obsolete / never applied anywhere.** Its three enums (`po_status`, `grn_status`, `purchase_invoice_status`) **do not exist on LIVE** — LIVE has only `purchase_order_status`. Superseded by repo file `20260702085027_af9ce140…sql`, which creates the same 8 tables. | No |

**Ordering warning honoured:** the two identical-timestamp files cannot be ordered by
filename. Content shows one is a strict superset of the other, which is the only reliable
ordering signal. Neither has a LIVE counterpart, so neither can be reconciled against LIVE
history. **No rename or modification performed.**

Practical consequence: all three are dead weight for replay. Whatever they were meant to
build is already provided by `20260702085027_af9ce140…sql` (repo, pre-history layer).

---

## 4. Content-mismatch classification (11)

Evidence gathered: (a) each repo file has exactly **1 commit** in git — none was ever edited
after being committed; (b) normalized length delta repo vs LIVE.

| # | LIVE version / name | Repo file | Δ len (repo−live) | Class |
|---|---|---|---:|---|
| 1 | 20260728122455 qc_hold_stock_and_debit_notes | `20260728020000_…` | +910 | **C** |
| 2 | 20260728124704 fix_missing_grn_items_product_fk | `20260728030000_…` | +32 | **A over C** |
| 3 | 20260728131140 sales_workflow_engine_foundation | `20260728040000_…` | −31 | **C** |
| 4 | 20260729082659 gst_engine_milestone1_architecture | `20260729030000_…` | +262 | **A over C** |
| 5 | 20260729100516 gst_engine_milestone6_compliance | `20260729090000_…` | +121 | **C** |
| 6 | 20260729131547 gst_engine_milestone7_performance_qa | `20260729100000_…` | +235 | **C** |
| 7 | 20260731064602 audit_trail_created_updated_by | `20260730210000_…` | −141 | **C** |
| 8 | 20260801110235 purchase_and_voucher_delete_firewall | `20260801030000_…` | +4 | **C** |
| 9 | 20260802080332 sales_return_redesign | `20260803020000_…` | +24 | **C** |
| 10 | 20260809161941 add_credit_note_round_off | `20260809161820_…` | 0 | **D** |
| 11 | 20260810082046 accounting_wire_voucher_numbering_settings | `20260810140000_…` | +29 | **D** |

- **A** — repository file is an accidental reconstruction. Applies to the *working-tree
  edits* on #2 and #4, both made during this workstream purely so a from-empty replay would
  not abort (`duplicate_object` / `dependent_objects_still_exist` guards). Neither is
  product work. **Crucially, HEAD of both also differs from LIVE**, so reverting the
  working-tree edit is necessary but not sufficient — the underlying class is still C.
- **C** — LIVE holds a different applied revision from the committed repository file. All
  nine C-class files were committed exactly once and never edited, so the divergence
  originated on the LIVE side (or the pushed SQL differed from the file kept in the repo).
- **D** — the repository file holds the content of a *later* LIVE migration; two LIVE
  migrations collapsed into one repo file. #10's repo file matches LIVE
  `20260809162704 fix_credit_note_round_off_sign` exactly (Δ len 0 is consistent with a
  sign flip); #11's matches LIVE `20260810082255 accounting_fix_voucher_numbering_first_use_reset_bug`.
- **B / E** — none assigned.

Exact per-file diffs against LIVE are deliberately **not** produced in this phase; they are
Phase-2 work and must not drive any edit yet.

---

## 5. Content present under a different filename (3 + 1 merge)

| LIVE migration | Repo file holding that content | Effect |
|---|---|---|
| 20260801134601 ledger_account_type_and_party_classification_v2 | `20260801040000_ledger_account_type_and_party_classification.sql` | repo has the `_v2` content under the non-v2 name; the original LIVE revision is unrecorded |
| 20260809162704 fix_credit_note_round_off_sign | `20260809161820_add_credit_note_round_off.sql` | as above |
| 20260810082255 accounting_fix_voucher_numbering_first_use_reset_bug | `20260810140000_accounting_wire_voucher_numbering_settings.sql` | as above |
| 20260811192312 stock_take_items_counted_qty_non_negative **+** 20260811192348 post_stock_take_negative_stock_guard | `20260811184000_stock_take_negative_qty_guards.sql` | two LIVE migrations merged into one repo file; matches neither, so both count missing and the repo file counts repo-only |

In all four cases the **final schema** is reproducible but the **migration boundaries and
ordering are not**. Adding the missing LIVE files verbatim alongside these repo files would
re-run the same DDL twice. Whether that is safe depends on each statement's idempotency and
must be decided per case in Phase 2 — not assumed.

---

## 6. What Phase 2 must decide (not decided here)

1. **Layer 1 is the hard problem.** 69 pre-history tables have no authoritative SQL in LIVE
   history. Reconstructing them from the current schema is explicitly forbidden by the
   rules in force, and it is exactly what produced the earlier dangerous reconstruction
   file. A different source is required — e.g. an agreed baseline/squash migration that is
   documented as a baseline rather than as invented history.
2. **The 4 collapsed/merged cases** need a per-case decision on double-application.
3. **The 9 C-class mismatches** need exact diffs before anything is overwritten.
4. **The 3 skipped files** should be resolved as obsolete artifacts, but the decision is
   the owner's; no rename or delete has been performed.
