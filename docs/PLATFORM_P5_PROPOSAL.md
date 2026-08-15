# P5 — IAM / Permission Split: Proposal for sign-off

**Status: PROPOSAL. Nothing in this document has been applied to the live project.**

Written 2026-08-15 against live project `zskfuioojivdqmqkzjqc`, inspected read-only.
The frozen roadmap (`docs/PLATFORM_CONTROL_CENTER_ROADMAP.md`) could not be found in the
repo, in any local or remote branch, or on disk — so the specifics below are **inferred
from the live P1–P4 baseline plus the roadmap summary**, not copied from the signed-off
spec. Every inferred choice is marked ⚠️ and needs your confirmation before anything runs.

If you still have the roadmap, replace §2–§5 with its actual contents; §1, §6 and §7
(the live baseline, the migration split, and the assertions) hold either way.

---

## 1. Live baseline (verified, not inferred)

| Thing | State on live |
|---|---|
| Platform tables | 14 (`platform_staff`, `_roles`, `_permissions`, `_role_permissions`, `_staff_roles`, `_departments`, `_teams`, `_staff_teams`, `_staff_invitations`, `_audit_logs`, `_approval_requests`, `_approval_rules`, `_approval_rule_steps`, `_approval_steps`) |
| Roles | **1** — `Super Admin`, level 1000, `is_system = true` |
| Permission catalog | **19** keys |
| Role grants | Super Admin holds all 19 |
| Staff | 1 row, assigned Super Admin |
| `platform_staff_status` | enum `{active, suspended}` |
| Staff security columns | **none** |
| RLS | enabled on all platform tables, 38 policies, gated on `is_platform_staff()` / `has_platform_permission('<key>')` |
| Functions | 28 (`SECURITY DEFINER`, `search_path=public`) |
| Triggers | 24 |
| Latest platform migration | `20260811141454 platform_customer_360` (P4). **No P5 objects exist.** |

### Existing 19 permission keys

```
approval.approve          approval_rule.manage      audit.view
bug.update                bug.view                  business.view
customer.view             customer360.financial_view customer360.usage_view
data_correction.approve   data_correction.request   department.manage
payment.refund            payment.view              role.manage
staff.manage              team.manage               ticket.assign
ticket.create
```

### Two live facts that constrain the design

1. **`platform_staff` and `platform_roles` already carry `trg_platform_approval_gate`
   (`block_update_with_pending_platform_approval`) and `trg_platform_audit_change`.**
   Any backfill `UPDATE` on these tables writes a `platform_audit_logs` row per row
   touched, and can be *blocked outright* if a pending approval exists for that record.
   → The design below deliberately uses **column defaults instead of backfill UPDATEs**,
   so P5 touches zero existing `platform_staff` rows.

2. **`ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds it**,
   and `apply_migration` wraps each migration in one transaction.
   → The enum extension and anything that *uses* the new labels must be in
   **two separate migrations**. This is very likely what "P5 ki dono migrations" refers to.

---

## 2. ⚠️ Permission catalog split

**Rule applied: additive only.** No existing key is renamed, re-scoped, or deleted —
renaming a key would silently drop the matching `platform_role_permissions` grants and
break live RLS, which is a destructive change.

Today the catalog is inconsistent: some resources expose only `.manage` (which implicitly
grants read), others only `.view`. P5 splits read from write so later phases can grant
read-only access without handing out write.

**New keys proposed (15), all `IF NOT EXISTS`:**

| Key | Why |
|---|---|
| `staff.view` | read staff directory without `staff.manage` |
| `role.view` | read roles/permission matrix without `role.manage` |
| `team.view` | read teams without `team.manage` |
| `department.view` | read departments without `department.manage` |
| `approval_rule.view` | read approval rules without editing thresholds |
| `approval.view` | read the approval queue without approving |
| `audit.export` | export audit trail (P6 Audit & Security Center) |
| `security.view` | read security posture/sessions (P6) |
| `business.manage` | edit customer business records (P10 needs it; key created now) |
| `customer.manage` | edit customer/account records |
| `payment.export` | export payment records |
| `ticket.view` | read tickets (P8) |
| `ticket.update` | update tickets (P8) |
| `ticket.close` | close tickets (P8) |
| `bug.create` | file engineering bugs (P8) |

Catalog after P5: **19 → 34**.

**Open question ⚠️** — does P5 create forward keys for P6/P8/P10 (as above, so later
screens have something to gate on, matching "P5 blocks everything"), or only the IAM
read/write split (the first 6 rows)? I've assumed the former.

---

## 3. ⚠️ Role seeds

Super Admin stays the **sole level-1000 role** (a resolved decision per the roadmap
summary). New roles sit strictly below it.

| Role | Level | Permissions |
|---|---|---|
| `Ops Manager` | 600 | all `.view` keys + `approval.approve`, `data_correction.request`, `ticket.*`, `business.manage`, `customer.manage` |
| `Support Lead` | 400 | all `.view` keys + `ticket.*`, `bug.create`, `bug.update`, `data_correction.request` |
| `Finance Ops` | 400 | `payment.view`, `payment.refund`, `payment.export`, `customer360.financial_view`, `business.view`, `customer.view`, `approval.view` |
| `Support Agent` | 200 | `ticket.view`, `ticket.create`, `ticket.update`, `customer.view`, `business.view`, `customer360.usage_view`, `bug.create` |
| `Auditor` | 300 | **read-only**: `audit.view`, `audit.export`, `security.view`, and every `.view` key. No write/approve key at all. |

All seeded with `is_system = false` so they remain editable in the Roles UI, and all
inserted `ON CONFLICT (name) DO NOTHING` so re-running is safe.

**Open questions ⚠️** — role names, level numbers, and the exact grant matrix are my
inference. Also: `trg_platform_roles_protect_system` guards system roles; since these
seeds are `is_system = false` they pass, but confirm that's what you want (non-system
roles can be edited *and deleted* from the UI).

---

## 4. ⚠️ `platform_staff_status` enum extension

Current: `{active, suspended}`. Proposed additions, appended (never reordered — reordering
an enum is destructive):

| New label | Meaning |
|---|---|
| `locked` | automatic security lockout (failed logins / IP violation), distinct from an admin's deliberate `suspended` |
| `offboarded` | staff has left; row kept for audit-trail referential integrity rather than deleted |

Applied as `ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS '<label>'`.
**Non-destructive**: existing `active`/`suspended` rows are untouched, and the column
default stays `'active'`.

**Open question ⚠️** — do you also want `invited`? I left it out because
`platform_staff_invitations` already tracks invitation state in its own `status` column,
so `invited` on `platform_staff` would duplicate it.

---

## 5. ⚠️ Staff security columns

All `ADD COLUMN IF NOT EXISTS` with defaults, so **no row is rewritten and no audit/approval
trigger fires** (see §1.1).

```sql
two_factor_enabled      boolean     NOT NULL DEFAULT false
two_factor_enrolled_at  timestamptz
last_login_at           timestamptz
last_login_ip           text
failed_login_attempts   integer     NOT NULL DEFAULT 0
locked_until            timestamptz
password_changed_at     timestamptz
must_change_password    boolean     NOT NULL DEFAULT false
allowed_ip_ranges       text[]                              -- NULL = no restriction
session_timeout_minutes integer                             -- NULL = platform default
```

Note `platform_staff.last_active_at` already exists — `last_login_at` is deliberately
separate (activity vs. authentication).

---

## 6. Migration split (the "dono migrations")

Forced by the enum-in-transaction rule in §1.2.

**Migration 1 — `platform_p5_iam_split_schema`**
1. `ALTER TYPE platform_staff_status ADD VALUE IF NOT EXISTS 'locked' | 'offboarded'`
2. `ALTER TABLE platform_staff ADD COLUMN IF NOT EXISTS ...` (§5)
3. `INSERT INTO platform_permissions ... ON CONFLICT (key) DO NOTHING` (§2)
4. Grant **all** new keys to Super Admin only
5. Assertions A1, A3, A4 (§7)

**Migration 2 — `platform_p5_role_seeds_and_grants`**
1. `INSERT INTO platform_roles ... ON CONFLICT (name) DO NOTHING` (§3)
2. `INSERT INTO platform_role_permissions ... ON CONFLICT DO NOTHING`
3. Any predicate using the new enum labels (legal only now, in a later transaction)
4. Assertions A1, A2, A5 (§7)

Neither migration contains `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, or `ALTER COLUMN TYPE`.

---

## 7. Regression assertions (your goal #7)

Run **inside** the migrations as `DO $$ ... RAISE EXCEPTION ... $$` blocks, so a failure
rolls the migration back rather than leaving live half-changed.

- **A1 — Super Admin holds the complete catalog.**
  `platform_permissions` count minus Super Admin's granted count must be `0`.

- **A2 — no unintended write permission on any other role.**
  No role other than Super Admin may hold a key matching
  `.manage|.approve|.refund|.request|.create|.update|.close|.export`
  unless it is explicitly listed in §3. Also asserts `Auditor` holds **zero** such keys.

- **A3 — the pre-existing 19 keys survive unchanged.**
  All 19 original keys still present, same `id`s (proves additive, not recreated).

- **A4 — every pre-existing role→permission grant survives.**
  Count of `platform_role_permissions` rows for the original 19 keys is still 19.

- **A5 — P1–P4 RLS behaviour preserved.**
  RLS still enabled on all 14 platform tables; the 38 pre-existing policies still exist by
  name; `is_platform_staff()` and `has_platform_permission()` still exist with unchanged
  signatures and are still `SECURITY DEFINER` with `search_path=public`.

---

## 8. Impact statement (per your goal #9)

| | |
|---|---|
| Rows deleted | **0** |
| Rows updated | **0** (defaults only, no backfill `UPDATE`) |
| Rows inserted | 15 `platform_permissions`, 15 `platform_role_permissions` (Super Admin), 5 `platform_roles`, ~40 `platform_role_permissions` (new roles) |
| Columns dropped/retyped | **0** |
| Enum labels added | 2 (appended) |
| Existing migration history | untouched — two new versions appended only |
| Reversible? | Yes for tables/roles/permissions/columns. **Enum labels cannot be removed** without recreating the type — that is the one genuinely one-way step. |

---

## 9. What I need before running anything

1. Confirm or correct §2 (which keys), §3 (role names/levels/matrix), §4 (enum labels),
   §5 (security columns).
2. Confirm P5 scope: IAM split only, or forward keys for P6/P8/P10 too.
3. Explicit go-ahead to write to the live project. Until then nothing is applied.
