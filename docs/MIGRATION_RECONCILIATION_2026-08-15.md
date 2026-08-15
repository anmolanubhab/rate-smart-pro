# LIVE ↔ Repository migration reconciliation

**Read-only. No LIVE writes, no commits, no migration files created.**
Project `zskfuioojivdqmqkzjqc`, generated 2026-08-15.

---

## Method

LIVE stores the exact applied SQL per migration in
`supabase_migrations.schema_migrations.statements`. Repository files are raw `.sql`.
Byte comparison is impossible between the two (LIVE stores parsed statements, the
repo stores the original file including inter-statement comments), so both sides are
compared on a **normalized checksum**:

1. strip `/* … */` blocks
2. strip `-- …` line comments
3. lowercase
4. collapse all whitespace to single spaces, trim
5. md5

The identical normalization is applied on the SQL side and in the local scanner, so a
match means *the SQL is the same modulo comments and formatting* — not byte-identical.

Because comments are stripped, a migration whose only difference from the repo copy is
a comment will read as MATCHING. That is intended: comments do not change schema.

---

## Totals

| | Count |
|---|---:|
| LIVE migrations | **302** |
| Repository migration files | **238** (235 CLI-visible + 3 skipped by filename) |
| PRESENT_AND_MATCHING | **201** |
| PRESENT_BUT_CONTENT_DIFFERS | **11** |
| MISSING_FROM_REPO | **90** |
| LIVE_DUPLICATE_OR_REPLACED | **0** |
| UNKNOWN | **0** |
| Repo-only files (no LIVE counterpart by content) | **37** |

LIVE's recorded history begins at `20260704111015`. The repository's 20 oldest files
(Apr–Jun, UUID-named) predate that point entirely and therefore have no LIVE
counterpart by construction — they are not drift.

---

## PRESENT_BUT_CONTENT_DIFFERS (11)

Same logical migration name on both sides, different SQL. Each needs a decision:
is the repo copy stale, or was LIVE patched outside the repo?

| LIVE version | name | repo file |
|---|---|---|
| 20260728122455 | qc_hold_stock_and_debit_notes | `20260728020000_…sql` |
| 20260728124704 | fix_missing_grn_items_product_fk | `20260728030000_…sql` ← **local edit, see below** |
| 20260728131140 | sales_workflow_engine_foundation | `20260728040000_…sql` |
| 20260729082659 | gst_engine_milestone1_architecture | `20260729030000_…sql` ← **local edit, see below** |
| 20260729100516 | gst_engine_milestone6_compliance | `20260729090000_…sql` |
| 20260729131547 | gst_engine_milestone7_performance_qa | `20260729100000_…sql` |
| 20260731064602 | audit_trail_created_updated_by | `20260730210000_…sql` |
| 20260801110235 | purchase_and_voucher_delete_firewall | `20260801030000_…sql` |
| 20260802080332 | sales_return_redesign | `20260803020000_…sql` |
| 20260809161941 | add_credit_note_round_off | `20260809161820_…sql` |
| 20260810082046 | accounting_wire_voucher_numbering_settings | `20260810140000_…sql` |

Two of these eleven are **uncommitted local edits made during this session** and are
not pre-existing drift — see the classification section below.

---

## Content present under a different filename (3)

These LIVE migrations have no repo file of the same name, but their exact content is
present in the repo under a *different* file. In each case one repo file carries the
content of a later LIVE migration, meaning the repo file was edited in place and the
earlier LIVE revision was never recorded separately.

| LIVE version | LIVE name | repo file holding this content |
|---|---|---|
| 20260801134601 | ledger_account_type_and_party_classification_v2 | `20260801040000_ledger_account_type_and_party_classification.sql` |
| 20260809162704 | fix_credit_note_round_off_sign | `20260809161820_add_credit_note_round_off.sql` |
| 20260810082255 | accounting_fix_voucher_numbering_first_use_reset_bug | `20260810140000_accounting_wire_voucher_numbering_settings.sql` |

This is why the name-level gap (93) is larger than the content-level gap (90).

---

## MISSING_FROM_REPO (90)

No repo file matches by name **or** by content.

**Block A — 65 consecutive migrations, `20260704111015` → `20260719043730`.**
This is the bulk of the drift and includes foundational work:

```
fix_membership_helper_functions, enable_rls_sales_tables,
replace_permissive_policies_sole_policy_tables, drop_redundant_allow_all_policies,
fix_function_search_path_warnings_v2, fix_view_security_and_exposure,
revoke_unsafe_public_execute_grants, tighten_businesses_insert_policy,
fix_execute_grants_via_public_role, add_submit_dealer_application_rpc,
fix_purchase_order_rls_and_po_number_rpc, dealer_portal_financial_read_access,
fix_voucher_entry_schema_drift, relax_ledger_accounts_account_type_not_null,
accounting_foundation_phase_a, cleanup_duplicate_accounting_rpc_overloads,
gst_phase1_schema_foundation, purchase_order_header_fields_and_qty_rollup,
add_rejected_status_to_purchase_order_status,
add_business_scoped_next_order_number_overload,
drop_ambiguous_next_order_number_overload, purchase_invoice_schema_fix_and_gst_split,
measurement_engine_layer_a_and_b, seed_default_measurement_categories_and_units,
party_phase0_groups_and_discount_profiles,
party_groups_full_spec_and_inheritance_engine, party_groups_extended_columns,
measurement_layer_c1_purchase_integration, party_activity_timeline_engine,
gst_column_consolidation_p4, measurement_layer_c3_sales_integration,
balance_engine_p5, add_missing_invoice_party_fks,
fix_deduct_stock_on_dispatch_use_stock_unit, danger_zone_deletion_flow,
company_users_rls_fix_and_invitations, warehouse_management,
grn_items_add_po_item_link, inventory_reports_phase1_schema,
inventory_reports_phase2_rpc_stock_summary, inventory_reports_phase3_ageing_abc_fsn,
phase1_invitations_login_control, phase1_lockdown_internal_functions,
phase2_permission_engine, phase1_phase2_privilege_lockdown,
bill_wise_sales_payment_system, fix_next_dispatch_number_business_scoped,
cleanup_duplicate_next_invoice_number, fix_ensure_party_ledger_param_order_bug,
fix_parties_create_ledger_param_order_bug,
fix_sales_invoice_autopost_and_remove_duplicate_trigger,
gst_cgst_sgst_igst_split_posting,
fix_sales_invoice_autopost_trigger_on_status_update,
bank_accounts_ledger_integration, fix_receive_sales_payment_post_to_ledger,
expense_income_ledgers_phase9, consolidate_gst_split_calculation,
stock_reservation_engine, shipment_status_tracking,
fix_approval_requests_missing_updated_at, purchase_returns_with_debit_note_voucher,
sales_returns_with_credit_note_voucher, stock_adjustment_journal_voucher,
add_sales_invoice_items_product_fk, sync_cost_price_from_purchase_history
```

**Block B — 25 later migrations, interleaved with committed ones:**

```
20260728122659  qc_hold_stock_movement_logging
20260729131719  gst_engine_milestone7_revoke_anon_explicit
20260801110359  fix_voucher_delete_trigger_column_name
20260801141641  party_usage_check_for_safe_delete
20260801141828  party_usage_check_for_safe_delete_v2
20260806063935  quotation_basics
20260806070245  quotation_revisions
20260806070359  quotation_revisions_unique_fix
20260806073847  drop_unused_quotation_ref_no
20260806083735  sales_return_cancel_rpc
20260806101951  fix_missing_archive_business_rpc_and_audit_visibility
20260806102237  fix_audited_update_business_missing_updated_at_column
20260808165917  salesman_portal_identity_fix_expire_fn_grants
20260810174056  add_grn_cancellation_reversal_trigger
20260810175216  add_dispatch_cancellation_reversal_trigger
20260810180107  fix_transaction_idempotency_guards
20260811131222  platform_p2_trigger_function_grant_cleanup
20260811192312  stock_take_items_counted_qty_non_negative
20260811192348  post_stock_take_negative_stock_guard
20260812071111  accounts_qa_integrity_fixes_revoke_execute
20260812081209  accounts_qa_voucher_number_uniqueness
20260814092315  cavs_enable_realtime
20260814143233  fix_seed_default_warehouse_code
20260814143357  fix_seed_default_warehouse_code_v2
20260814145124  fix_business_users_first_owner_bootstrap
```

Note `stock_take_items_counted_qty_non_negative` + `post_stock_take_negative_stock_guard`
are two LIVE migrations that appear to be merged into the single repo file
`20260811184000_stock_take_negative_qty_guards.sql` — that repo file matches neither by
content, so both LIVE entries are counted missing and the repo file is counted repo-only.

---

## Object-level duplicate detection (PART 6)

The 90 missing migrations create **116** tables/functions between them.

| | Count |
|---|---:|
| Already defined somewhere in the repo (represented elsewhere) | **56** |
| Not defined anywhere in the repo — genuinely absent | **60** |

Genuinely absent **tables (19)**: `units`, `unit_conversions`, `measurement_categories`,
`party_groups`, `party_discount_profiles`, `party_balance_summary`, `payment_allocations`,
`purchase_returns`, `purchase_return_items`, `sales_returns`, `sales_return_items`,
`permission_templates`, `user_permissions`, `product_categories`, `product_groups`,
`product_units`, `business_user_invitations`, `opening_stock_entries`, `packaging_hierarchy`.

Genuinely absent **functions (41)**, including the entire permission engine and
invitation flow: `has_permission`, `get_effective_permissions`, `get_my_permissions`,
`save_user_permissions`, `reset_user_permissions`, `get_role_template`,
`accept_invitation`, `reject_invitation`, `revoke_invitation`, `resend_invitation`,
`delete_invitation`, `get_invitation_by_token`, `_expire_stale_invitations`,
`can_bootstrap_business_owner`, `enforce_business_user_safety`,
`payment_allocations_apply_delta`, `orders_stock_reservation`,
`dispatch_items_release_reservation`, `grn_cancel_reversal`, `dispatch_cancel_reversal`,
`submit_dealer_application`, `add_bank_account`, `seed_party_groups`,
`propagate_group_defaults`, `sync_cost_price_from_purchases`, and others.

**Conclusion:** the drift is real content loss, not a filename/tracking artefact. The
56 "already defined" objects are cases where a later committed migration re-created the
object with `CREATE OR REPLACE`, so the current definition survives in the repo but the
original migration that introduced it does not.

---

## Repo-only files (37)

| Group | Count | Note |
|---|---:|---|
| UUID-named, Apr–Jun | 20 | predate LIVE's recorded history — expected, not drift |
| CLI-skipped filenames | 3 | `20260622112430 purchase module · SQL`, `20260622112430 purchase module·SQL`, `20260630000000.sql` — never applied locally or on LIVE |
| Content-differs counterparts | 11 | the repo side of the PRESENT_BUT_CONTENT_DIFFERS table above |
| Merged/renamed | 3 | incl. `20260811184000_stock_take_negative_qty_guards.sql` |

---

## Fresh-database test (PART 10)

**NOT YET TESTED.** The Docker daemon is not running
(`npipe:////./pipe/dockerDesktopLinuxEngine` unavailable), so `supabase start` /
`supabase db reset` could not be executed.

Prior evidence from earlier in this session (recorded before the reconstruction file was
deleted): a clean replay of the current repository fails at
`20260728010000_phase0_role_gate_core_tables.sql` with

```
ERROR: relation "public.payment_entries" does not exist (SQLSTATE 42P01)
```

`payment_entries` is created by LIVE migration `20260717082759 bill_wise_sales_payment_system`,
which is in the MISSING_FROM_REPO list. That is the expected first failure and it is a
direct consequence of the drift documented here, not a separate defect.

---

## Raw data

Generated artefacts (scratchpad, not committed):

- `live_ck.tsv` / `live_ck2.tsv` — LIVE: ord, version, name, normalized checksum (302 rows)
- `repo_ck.tsv` — repo: file, version, name, cli_visible, normalized checksum (238 rows)
- `classification.tsv` — the full per-migration classification (302 rows)
