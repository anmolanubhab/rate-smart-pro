# RD-Pro Platform Control Center — Frozen Roadmap (P5 → P12)

**Status:** FROZEN AND SIGNED OFF (2026-08-14). All five open decisions resolved — see §5. P5 implementation has started.
**Date:** 2026-08-14
**Scope:** Upgrade `/platform` from a staff/permission administration console into a full SaaS/ERP operations control center.

---

> **Blocker for local verification (pre-existing, unrelated to this roadmap):** `supabase db reset` cannot replay this repo's migration history. `public.payment_entries` is referenced by 8 migrations but has no `CREATE TABLE` anywhere in `supabase/migrations/`, and three files are skipped by the CLI for invalid names (`20260622112430 purchase module · SQL`, `20260622112430 purchase module·SQL`, `20260630000000.sql`). The reset dies at `20260728010000_phase0_role_gate_core_tables.sql`. Until that is fixed, phase verification must run against a scoped harness or a Supabase branch. Worth fixing as its own task.

## 0. Baseline — what already exists

This roadmap continues the **existing P-series** used by the platform migrations. It does not restart numbering.

### Shipped phases

| Phase | Migration(s) | Delivered |
|---|---|---|
| **P1** | `20260811090000`, `20260811091000`, `20260811092000`, `20260811093000` | `platform_permissions`, `platform_roles`, `platform_role_permissions`, `platform_staff`, `platform_staff_roles`, `platform_audit_logs`, `platform_approval_requests`; `is_platform_staff()`, `has_platform_permission()`, `platform_staff_level()`; system-role protection trigger; Super Admin seed + one-time bootstrap |
| **P2** | `20260811100000`, `20260811101000`, `20260811102000`, `20260811103000` | `platform_departments`, `platform_teams`, `platform_staff_teams`, `platform_staff_invitations`; delegation guards (`platform_can_delegate_role`, `platform_can_delegate_permission`); circular-manager guard; self-approve bypass fix |
| **P3** | `20260812090000`, `20260812091000`, `20260812092000`, `20260812093000` | Approval Center: `platform_approval_rules`, `platform_approval_rule_steps`, `platform_approval_steps`; 9 approval RPCs; transition guard; rule seed |
| **P4** | `20260812100000` | Customer 360: platform-staff SELECT on `businesses` / `business_users`, `get_business_360_overview()`, `get_business_360_activity()` |

### Current permission catalog — 19 keys

`business.view`, `customer.view`, `ticket.create`, `ticket.assign`, `bug.view`, `bug.update`,
`data_correction.request`, `data_correction.approve`, `payment.view`, `payment.refund`,
`staff.manage`, `role.manage`, `audit.view`, `approval.approve`,
`department.manage`, `team.manage`, `approval_rule.manage`,
`customer360.usage_view`, `customer360.financial_view`

### The actual gap

8 nav sections exist for 19 permissions. **9 keys have no screen at all**: `ticket.*`, `bug.*`, `payment.*`, `audit.view`, `data_correction.*`, `customer.view`. The permission model is ahead of the UI — this roadmap closes that, then extends it.

### Known stale markers to fix

- `PlatformBusinessDetail.tsx:168` — `phase="P5 (Billing)"` → becomes **P10** under this roadmap.
- `PlatformBusinessDetail.tsx:172` — `phase="P6"` → becomes **P8**.
- `platformAudit.ts` — `logPlatformAudit()` swallows all errors silently. An audit writer that can fail silently is not an audit trail. Fixed in P6.
- `businesses` table has **no** `status`, `plan`, `trial_ends_at`, or `suspended_at` columns. Tenant lifecycle (suspend/trial/plan) is therefore **new schema**, not a UI-only change. Landed in P10.

---

## 1. Phase grouping

| Owner's grouping | Roadmap phases | Theme |
|---|---|---|
| **Phase 1 — Must have** | P5, P6, P7, P8, P9 | Security foundation + operational visibility |
| **Phase 2 — Production SaaS** | P10, P11 | Tenant lifecycle, billing, runtime control |
| **Phase 3 — Enterprise** | P12 | High-blast-radius operations |

**Implementation order is strict.** P5 must land before P6–P9 because every later screen gates on permission keys that P5 creates. Shipping a screen against a coarse key and re-gating it later means rewriting RLS twice.

---

# PHASE 1 (P5 – P9)

## P5 — Granular IAM & permission split

**Goal:** replace coarse keys with a verb-level catalog, add a role hierarchy, and extend staff lifecycle states. This is the architectural foundation; nothing else is safe to build first.

### Permission catalog — new keys

Split `business.view` and fill the gaps:

```
business.view          (exists)     business.edit
business.suspend                    business.delete
user.view                           user.edit
user.suspend                        user.reset_2fa
subscription.view                   subscription.manage
subscription.refund
ticket.view                         ticket.close
ticket.comment_internal
audit.view             (exists)     audit.export
system.view                         system.manage
search.global
impersonation.request               impersonation.approve
```

`customer.view`, `bug.*`, `data_correction.*`, `payment.*` stay as-is (they already have the right granularity).

### Migration strategy — non-negotiable

The split must **never silently escalate**. Backfill rule:

1. Every role currently holding `business.view` receives the new **read-only** keys (`user.view`, `ticket.view`, `subscription.view`).
2. **Write keys** (`business.edit`, `business.suspend`, `business.delete`, `user.suspend`, `subscription.manage`, `subscription.refund`, `system.manage`, `impersonation.*`) are granted **only** to the `Super Admin` system role.
3. `Super Admin` continues to receive every catalog key via the existing CROSS JOIN seed pattern.
4. The migration is idempotent (`ON CONFLICT DO NOTHING`) and reversible via a documented down-script.

### Role hierarchy

**Signed-off decision:** the existing `Super Admin` system role remains the **sole** level-1000 role. No duplicate "Platform Owner" role is created — a second top-level privileged role is an extra lockout surface for no benefit.

Seed **five** non-system roles with explicit `level` values below it:

| Role | Level | Grants |
|---|---|---|
| Super Admin | 1000 | existing system role — unchanged, receives every catalog key |
| Platform Administrator | 800 | all except `business.delete`, `system.manage`, `impersonation.approve` |
| Operations Admin | 600 | business.*(view/edit/suspend), user.*, ticket.*, approval.approve, audit.view |
| Finance Admin | 600 | subscription.*, payment.*, approval.approve, audit.view, business.view |
| Support Admin | 400 | ticket.*, business.view, user.view, customer.view, approval-request only |
| Support Executive | 200 | ticket.view, ticket.create, ticket.comment_internal, business.view |

Levels drive the **existing** delegation guard (`platform_can_delegate_role` already refuses to grant a role above the actor's own level) and the approval-step `min_level` matching. No new enforcement code needed — this is data.

### Staff lifecycle

`platform_staff.status` is the PG **enum** `platform_staff_status` (not a TEXT CHECK), currently `active | suspended`. It extends to `active | suspended | invited | locked | inactive` via `ALTER TYPE ... ADD VALUE`.

**Mechanical constraint:** a newly added enum value cannot be *used* in the same transaction that adds it. The enum extension therefore ships as its **own migration file**, ahead of the migration that references the new values.

- `invited` — set when an invitation is created, flips to `active` on accept.
- `locked` — set automatically after N failed platform logins (P6 supplies the counter).
- `inactive` — no login for 90 days; nightly job flips it. Login gate treats it as blocked, reactivation requires `staff.manage`.

`PlatformGuard` / `PlatformLogin` currently test `status !== 'active'` — that check stays correct for all five states with no edit.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `platform_permissions` | rows | +19 new keys |
| `platform_roles` | rows | +5 seeded non-system roles with levels |
| `platform_role_permissions` | rows | backfill per rule above |
| `platform_staff.status` | column CHECK | widen to 5 states |
| `platform_staff.failed_login_count` | column | INT NOT NULL DEFAULT 0 |
| `platform_staff.locked_at` | column | TIMESTAMPTZ |
| `platform_staff.last_login_at` | column | TIMESTAMPTZ |

### RLS

No new policies. Existing policies that reference `business.view` for **write** paths (there are none today) would need re-pointing — verified: all current write policies use `staff.manage` / `role.manage` / `*.manage`, so the split is read-side only and additive.

`get_business_360_overview()` keeps its `business.view` gate.

### Screens

- `/platform/roles` — permission list grows to ~38 keys. Group by `resource`, add a resource-level "select all" toggle, keep existing search.
- `/platform/staff` — status filter chips for the 5 states; `locked` rows show an "Unlock" action gated on `staff.manage`.
- `/platform/staff/:id` — show `last_login_at`, `failed_login_count`, unlock button.

### Dependencies
None. This is the root of the tree.

### Acceptance criteria
- [ ] A staff member holding only the old `business.view` has **exactly** the same effective read access after migration, and **zero** new write access.
- [ ] `platform_can_delegate_role` refuses a Support Admin trying to assign Operations Admin (level 400 < 600).
- [ ] Super Admin holds all catalog keys after migration (`SELECT count(*)` parity check in the migration itself).
- [ ] All five staff statuses block portal entry except `active`.
- [ ] Roles screen renders 38 keys without layout break at 360px width.

### Risks
Permission-key rename across the client. Mitigation: keys are **added**, never renamed or dropped, so no client string breaks.

---

## P6 — Audit & Security Center

**Goal:** make the existing append-only `platform_audit_logs` visible, filterable, exportable, and trustworthy.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `platform_audit_logs.severity` | column | TEXT NOT NULL DEFAULT 'info' CHECK IN (`info`,`notice`,`warning`,`critical`); backfill `'info'` |
| `platform_audit_logs.module` | column | TEXT — derived bucket (`iam`, `business`, `billing`, `support`, `system`) for filtering |
| `idx_platform_audit_severity` | index | `(severity, created_at DESC)` |
| `idx_platform_audit_entity` | index | `(entity_type, entity_id, created_at DESC)` |
| `platform_login_attempts` | **new table** | `id, email, user_id NULL, ip, device, succeeded BOOL, created_at`; RLS SELECT on `audit.view`, INSERT via SECURITY DEFINER RPC only |
| `record_platform_login_attempt(...)` | RPC | SECURITY DEFINER; increments `platform_staff.failed_login_count`, sets `locked` at 5 |
| `export_platform_audit(...)` | RPC | gated on `audit.export`; returns filtered rows, writes its own `audit.export` audit entry |

**Append-only guarantee preserved:** adding columns does not add an UPDATE/DELETE policy. Verify no UPDATE/DELETE policy or grant exists after this migration.

### Client fix
`logPlatformAudit()` must stop swallowing errors. New contract: on failure it surfaces a toast and returns `false`; callers performing **sensitive** actions (`business.suspend`, `subscription.refund`, `impersonation.*`, `system.manage`) must **abort the action** if the audit write fails. Silent audit loss on a sensitive path is a compliance defect, not a UX nit.

### Screens
- `/platform/audit` — table with filters: date range, staff, business, action, module, IP, severity. Server-side pagination (keyset on `created_at DESC, id`). Row expands to show `old_value`/`new_value` JSON diff.
- `/platform/audit/security` — failed logins, new-IP logins, lockouts, permission changes, role changes. Fed by `platform_login_attempts` + audit rows where `module = 'iam'`.
- Nav entry `Audit & Security`, gated `audit.view`.
- Export button gated `audit.export`.

### Dependencies
P5 (needs `audit.export`, `failed_login_count`, `locked` status).

### Acceptance criteria
- [ ] No UPDATE or DELETE policy exists on `platform_audit_logs` after migration (assert in migration).
- [ ] A staff member without `audit.view` gets zero rows from the table and a 403-equivalent from `export_platform_audit`.
- [ ] 5 failed logins for one email set `platform_staff.status = 'locked'`; a 6th attempt is refused even with the correct password.
- [ ] Filtering 100k rows by date + severity returns in < 500 ms (index-backed).
- [ ] A forced audit-write failure aborts a `business.suspend` attempt.

### Risks
Backfilling `severity` on a large table. Mitigation: `DEFAULT 'info'` with `NOT NULL` is a metadata-only change on PG 11+; no table rewrite.

---

## P7 — Command Center dashboard

**Goal:** turn `/platform/dashboard` into an operational command center with a "Needs attention" panel.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `get_platform_command_center()` | RPC | SECURITY DEFINER, STABLE. Returns JSONB. **Each section independently permission-gated**, exactly like `get_business_360_overview` — tenant counts need `business.view`, revenue needs `subscription.view`, tickets need `ticket.view`, system needs `system.view`. Missing permission = key omitted, not an error. |
| `get_platform_attention_items()` | RPC | Returns the actionable list; same per-item gating |
| `platform_metric_snapshots` | **new table** | `id, metric_key, value NUMERIC, captured_at`; nightly rollup so trend deltas don't re-scan transaction tables |

**Performance rule:** the dashboard must never run an unbounded `count(*)` over `sales_invoices` on every page load. Live counts come from `platform_metric_snapshots` (nightly) plus a bounded "today" delta query. Freeze this — it is the single biggest scaling trap in this phase.

### Metrics (per the spec, gated as above)
Tenants: total / active / trial / suspended / new 1d-7d-30d.
Users: total / DAU / MAU.
Transactions: sales invoices, purchase invoices, transaction volume.
Revenue: MRR, trial→paid conversion, failed payments *(placeholder until P10 — renders "Not configured" rather than a fake zero)*.
Operations: pending approvals, open tickets, system errors, storage usage, last backup status *(placeholders until P8/P11)*.

**Freeze decision:** a metric whose source table does not exist yet renders an explicit **"Available in P10/P11"** state. It never renders `0`. A fabricated zero on an ops dashboard is worse than a blank.

### Needs-attention items
Businesses with unusual activity · failed payments · usage ≥ 80% of limit · failed backup · approvals pending > 24h · error-rate spike. Each item links to the relevant detail screen and is suppressed if the viewer lacks the gating permission.

### Screens
- `/platform` and `/platform/dashboard` — rebuilt. KPI grid + attention panel. Mobile: KPIs stack 2-up, attention panel full width.

### Dependencies
P5 (gating keys), P6 (error/audit counts).

### Acceptance criteria
- [ ] Dashboard first paint < 1.5 s with 1,000 businesses and 1M invoices.
- [ ] A Support Executive sees only ticket + business-count tiles; no revenue, no system tiles.
- [ ] No metric renders a fabricated `0` for an unimplemented source.
- [ ] Every attention item deep-links to a screen the viewer is permitted to open.

---

## P8 — Support / Ticketing

**Goal:** implement the ticketing system the `ticket.*` permissions already promise, and replace the Support tab placeholder.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `platform_tickets` | table | `id, ticket_no TEXT UNIQUE, business_id, raised_by_user_id, subject, body, priority (low/medium/high/critical), status (open/pending/escalated/resolved/closed), assigned_to (platform_staff), sla_due_at, first_response_at, resolved_at, closed_at, created_at, updated_at` |
| `platform_ticket_messages` | table | `id, ticket_id, author_staff_id NULL, author_user_id NULL, body, is_internal BOOL, created_at` |
| `platform_ticket_attachments` | table | `id, ticket_id, message_id, storage_path, filename, size_bytes` |
| `platform_ticket_sla_policies` | table | `id, priority, first_response_minutes, resolution_minutes` |
| `platform_canned_responses` | table | `id, title, body, created_by` |
| `create_platform_ticket(...)` | RPC | assigns `ticket_no`, resolves SLA from policy |
| `assign_platform_ticket(...)` | RPC | gated `ticket.assign` |
| `close_platform_ticket(...)` | RPC | gated `ticket.close` |
| `escalate_platform_ticket(...)` | RPC | bumps priority, re-computes SLA, writes audit |

### RLS
- SELECT on `platform_tickets` — `has_platform_permission('ticket.view')`.
- INSERT — `ticket.create`. UPDATE of `assigned_to` — `ticket.assign`. Status → closed — `ticket.close`.
- `platform_ticket_messages` with `is_internal = true` — SELECT requires `ticket.comment_internal`. **Internal notes must never be readable by a business user**; enforce in RLS, not in the client filter.
- Business-side read access (customers seeing their own tickets) is **explicitly out of scope** for P8. Tickets are staff-created only in this phase. Revisit in P11.

### Screens
- `/platform/support` — queues: Open / Pending / Escalated / Resolved / Closed; filters by priority, assignee, business; SLA countdown column with breach highlight.
- `/platform/support/:id` — thread view, internal-note toggle, assignment, priority, canned responses, attachments, linked business context panel (name, plan, usage, recent activity).
- `PlatformBusinessDetail` Support tab — replaces `ComingSoonCard`, lists that business's tickets.

### Dependencies
P5 (`ticket.view`, `ticket.close`, `ticket.comment_internal`), P4 (business context panel).

### Acceptance criteria
- [ ] SLA countdown is computed server-side from `sla_due_at`; client clock skew cannot hide a breach.
- [ ] An internal note is invisible to any principal lacking `ticket.comment_internal`, verified by a direct PostgREST query, not just UI.
- [ ] Escalation writes an audit row with `severity = 'warning'`.
- [ ] Ticket numbers are gap-tolerant but never duplicated under concurrent inserts.

---

## P9 — Global Search

**Goal:** one search bar that resolves any identifier to its context.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `platform_global_search(_q TEXT, _limit INT)` | RPC | SECURITY DEFINER. Gated on `search.global`. Fans out across businesses, business users, sales/purchase invoices, parties, products, tickets, payments — **each fan-out branch individually gated** on its own permission; a caller without `ticket.view` gets no ticket results. |
| trigram indexes | indexes | `pg_trgm` GIN on `businesses.business_name`, `businesses.gst_number`, `parties.party_name`, and invoice numbers |

**Freeze decision:** search returns **identifiers and links only** — never financial values or PII in the result rows. Amounts are visible on the detail screen, which has its own gate. This prevents search from becoming a permission bypass for `customer360.financial_view`.

Result cap: 10 per entity type, 60 total. No offset pagination — refine the query instead.

### Screens
- Search input in `PlatformLayout` header, `Cmd/Ctrl+K` shortcut, grouped results dropdown, keyboard navigable.
- `/platform/search?q=` — full results page.

### Dependencies
P5 (`search.global`), P8 (ticket results).

### Acceptance criteria
- [ ] Searching `INV-368473` lands on the invoice's business context in ≤ 2 clicks.
- [ ] A staff member without `customer360.financial_view` sees invoice results with no amounts anywhere in the payload (verified on the network response, not the DOM).
- [ ] p95 search latency < 300 ms at 1M invoices.
- [ ] Every search query writes an audit row (`severity = 'info'`, `module = 'system'`).

---

# PHASE 2 (P10 – P11)

## P10 — Tenant lifecycle, Subscription & Billing

**Goal:** the platform can actually control a tenant's commercial state. This is the phase the current `businesses` schema cannot support at all.

### DB objects

| Object | Kind | Notes |
|---|---|---|
| `businesses.status` | column | TEXT NOT NULL DEFAULT 'active' CHECK IN (`active`,`trial`,`suspended`,`cancelled`); backfill `'active'` |
| `businesses.suspended_at`, `suspended_by`, `suspension_reason` | columns | |
| `platform_plans` | table | `id, code, name, price_monthly, price_yearly, trial_days, grace_days, is_active, sort_order`. **Signed-off decision: DATA-ONLY.** Plans are fully admin-configurable rows. No four-tier (Free/Starter/Professional/Enterprise) seed is mandatory, and no pricing tier may be referenced by name in application logic — all behavior derives from `platform_plan_limits` rows. A seed, if added, is an editable example like the P3 approval-rule seed, not authoritative. |
| `platform_plan_limits` | table | `id, plan_id, limit_key, limit_value` (users, invoices/mo, products, parties, storage_mb, api_calls) |
| `platform_subscriptions` | table | `id, business_id, plan_id, status, started_at, current_period_end, trial_ends_at, cancelled_at, grace_until` |
| `platform_subscription_events` | table | append-only: upgrade, downgrade, extend_trial, pause, cancel, refund, coupon, manual_adjustment |
| `platform_payments` | table | `id, business_id, subscription_id, amount, status, gateway_ref, failed_reason, created_at` |
| `platform_usage_counters` | table | `business_id, period, limit_key, used_value` — incremented by nightly rollup, read by the Usage tab |
| `suspend_business(...)`, `resume_business(...)` | RPCs | gated `business.suspend`; **require a reason**; write audit at `severity = 'critical'` |
| `change_subscription_plan(...)`, `extend_trial(...)`, `issue_refund(...)` | RPCs | `subscription.manage` / `subscription.refund`; refunds above the P3 rule thresholds **route through the existing approval engine** rather than executing directly |

### Critical enforcement rule — freeze this
Suspending a business must **actually block** that tenant's app access. `businesses.status` has to be enforced in the **business-side RLS/session gate**, not only in the platform UI. Otherwise "suspend" is cosmetic. Concretely: the company-open path (see `20260814160000_company_access_verification_sessions.sql`) gains a `status IN ('active','trial')` check. This touches customer-facing code and is the highest-regression-risk item in the entire roadmap — it ships behind a feature flag (P11) and with a documented rollback.

### Screens
- `/platform/billing/plans` — plan CRUD, limits editor.
- `/platform/billing/subscriptions` — all subscriptions, filters, bulk trial extension.
- `/platform/billing/revenue` — MRR, ARR, ARPU, churn, expansion, trial conversion.
- `PlatformBusinessDetail` → Subscription tab replaces the `ComingSoonCard`; Usage tab gains real limit bars with an 80% warning state; Financial tab gains payment history and refunds.
- Business list gains a status column and suspend/resume actions.

### Dependencies
P5 (`subscription.*`, `business.suspend`), P3 approval engine (refund thresholds), P7 (revenue tiles light up).

### Acceptance criteria
- [ ] A suspended business's users cannot open the company — verified from a real business login, not the platform console.
- [ ] `suspend_business` without a reason is rejected at the RPC, not the form.
- [ ] A ₹60,000 refund creates an approval request and does **not** execute until Super Admin approval.
- [ ] Usage bars match a direct DB count for a seeded tenant.
- [ ] Rollback script restores pre-P10 behavior without data loss.

---

## P11 — Feature Flags, System Health, Notification Center

### Feature flags

| Object | Kind | Notes |
|---|---|---|
| `platform_feature_flags` | table | `id, key, name, description, default_state (on/off/beta), created_at` |
| `platform_feature_flag_overrides` | table | `id, flag_id, scope (global/plan/business/user), scope_id, state` |
| `is_feature_enabled(_key, _business_id)` | RPC | STABLE, resolution order: user → business → plan → global default |
| `useFeatureFlag(key)` | client hook | cached per session, invalidated on flag change |

Screen: `/platform/features` — matrix of flag × scope, gated `system.manage`.

**Freeze decision:** flags are **not** a security boundary. A flag hides a feature; RLS decides who may use it. Never gate a permission behind a flag.

### System health

| Object | Kind | Notes |
|---|---|---|
| `platform_health_checks` | table | `id, component, status, latency_ms, checked_at` |
| `platform_error_events` | table | `id, severity (P1/P2/P3), source, message, context JSONB, business_id NULL, occurred_at, resolved_at` |
| scheduled probe | edge function | writes `platform_health_checks` every 60 s for db / auth / storage / api / jobs |

Screens: `/platform/system` (component status + metrics), `/platform/system/errors` (P1/P2/P3 buckets, frequency, affected businesses, stack context). Gated `system.view`; acknowledge/resolve gated `system.manage`.

### Notification center

`platform_notifications` (`id, staff_id NULL for broadcast, severity, title, body, link, read_at, created_at`) + a bell in `PlatformLayout` with critical/warning/info counts. Sources: failed backup, suspicious login, payment-failure spike, business suspended, error spike, subscription expiry, approval overdue.

### Platform settings
`platform_settings` — single-row-per-key KV table: platform name, support email, **maintenance mode** (+ window + message), session duration, password policy, admin session timeout, login attempt limit, notification toggles, default limits. Gated `system.manage`. Maintenance mode is read by the business-side app shell.

### Business health score
`get_business_health_score(_business_id)` — composite of login activity, transaction activity, payment status, ticket volume, error rate, usage, subscription state. Rendered on Business Detail and as a Healthy / At-risk / Critical distribution on the Command Center. **Scoring weights live in `platform_settings`, not in code.**

### Dependencies
P5, P7, P10.

### Acceptance criteria
- [ ] Turning a flag off hides the feature for the targeted scope within one session refresh, with no deploy.
- [ ] A flag can never grant access that RLS denies (explicit negative test).
- [ ] Maintenance mode blocks business logins and shows the configured message; platform staff can still enter.
- [ ] Health probe failure raises a `critical` notification within 2 minutes.

---

# PHASE 3 (P12)

## P12 — High-blast-radius operations

All P12 features share one rule: **every action is approval-gated, step-up authenticated, reason-mandatory, and audited at `critical`.**

### Impersonation ("Login as business")

| Object | Notes |
|---|---|
| `platform_impersonation_sessions` | `id, staff_id, business_id, target_user_id, reason, approved_by, started_at, expires_at, ended_at, ended_reason` |
| `request_impersonation(...)` | gated `impersonation.request`; creates an approval request |
| `start_impersonation(...)` | requires an approved request + step-up re-auth; 30-minute hard expiry |
| `end_impersonation(...)` | explicit end; also enforced by expiry |

Rules frozen: reason mandatory · second-person approval (`impersonation.approve`, never self-approve — the existing approval engine already blocks self-approval) · persistent banner in the business UI · password / payment / security / permission mutations **blocked** during impersonation · every action inside the session tagged with the impersonation id · auto-expiry at 30 min.

### Backup & restore center

`platform_backups` (`id, kind, status, size_bytes, record_count, integrity_verified, created_at`), `platform_restore_requests` (approval-gated). Restore is **never a direct button**. Fixed pipeline: `request → approval → pre-restore backup → integrity verification → restore → post-restore verification`, each step recorded.

### Safe data explorer

Read-only, entity-graph traversal (invoice → items → party → voucher → ledger → inventory movements → audit trail). **No raw SQL input, ever.** Gated `system.view` + `customer360.financial_view` for amounts. Every lookup audited.

### Platform analytics
Growth, usage, revenue, geographic distribution. Reads `platform_metric_snapshots` (P7), never live transaction tables.

### Risk detection
Rule engine over existing signals: churn risk (no login 30d + no invoice 30d + trial ending), security alert (5 failed logins + new IP + new device), limit warning (usage > 90%). Emits notifications (P11), never auto-suspends.

### Release / deployment center
Release notes, deployment status, rollback indicator, migration status, flag state per release. Read-only view over CI metadata.

### Acceptance criteria
- [ ] Impersonation cannot start without an approved request from a different staff member.
- [ ] A blocked operation attempted during impersonation is refused server-side.
- [ ] Restore without a completed pre-restore backup is impossible at the RPC level.
- [ ] Data explorer exposes no free-text SQL path.

---

## 2. Cross-cutting standards (apply to every phase)

**Security**
- RLS is the boundary. Hiding a nav item is never the control. Every screen's data path is independently gated.
- All privileged reads go through `SECURITY DEFINER` RPCs with `SET search_path = public` and an explicit `has_platform_permission` check as the first statement — the P4 Customer 360 pattern.
- `REVOKE EXECUTE ... FROM PUBLIC, anon` then `GRANT ... TO authenticated` on every new RPC.
- Every new table: `ENABLE ROW LEVEL SECURITY` + explicit policies. No table ships without them.
- Sensitive actions abort if their audit write fails.

**Audit**
- Every mutation writes `platform_audit_logs` with `severity` and `module`.
- `critical` reserved for: business delete/suspend, refund, restore, impersonation, permission/role change, system config change.

**Migrations**
- One concern per file, `YYYYMMDDHHMMSS_platform_<topic>.sql`, header comment naming the phase.
- Idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), ending with `NOTIFY pgrst, 'reload schema';`.
- Additive only. No renames or drops of existing platform objects across P5–P12.

**Client**
- One `src/lib/platform<Module>.ts` per module, matching the existing seven.
- Lazy-loaded route + `PlatformGuard` + permission-filtered `NAV` entry.
- Mobile-responsive: nav scrolls horizontally (already), tables collapse to cards below 768px, no horizontal page scroll.
- No `any`. Typed row/result shapes per module.

**Definition of done per phase**
Migration applied · RLS negative tests written · client module typed · route + nav gated · mobile verified at 360px · audit entries confirmed · rollback documented.

---

## 3. Separate track — invitation delivery hardening

Not a phase; a standalone improvement that can land any time after P5. Current flow copies a link to the clipboard for manual sharing.

Upgrade: transactional email via a Supabase edge function · one-time token (invalidate on first successful accept, not just on status change) · configurable expiry (currently 7 days) · resend throttling and count tracking on `last_sent_at` · delivery status (sent / bounced / opened) · keep the copy-link fallback for when email delivery fails.

Acceptance: an accepted token cannot be reused · resend is rate-limited server-side · bounce is visible in the Pending Invitations tab.

---

## 4. Implementation order (frozen)

```
P5  IAM & permission split        ← blocks everything
P6  Audit & Security Center       ← needs P5
P7  Command Center                ← needs P5, P6
P8  Support / Ticketing           ← needs P5
P9  Global Search                 ← needs P5, P8
────────────── Phase 1 complete ──────────────
P10 Tenant lifecycle & Billing    ← needs P5, P3; highest regression risk
P11 Flags, Health, Notifications  ← needs P5, P7, P10
────────────── Phase 2 complete ──────────────
P12 Enterprise operations         ← needs all of the above
```

P8 and P9 may run in parallel with P6/P7 once P5 has landed. P10 must not start until Phase 1 is fully verified — it is the only phase that modifies customer-facing behavior.

---

## 5. Decisions — signed off 2026-08-14

| # | Decision | Resolution |
|---|---|---|
| 1 | **Roles** | Existing `Super Admin` remains the **sole** level-1000 system role; no duplicate Platform Owner. Seed exactly five non-system roles: Platform Administrator 800, Operations Admin 600, Finance Admin 600, Support Admin 400, Support Executive 200. |
| 2 | **Suspension** | **Hard-block** customer login/access. Read-only mode rejected. Ships with feature flag, documented rollback, RPC-level enforcement, mandatory reason, audit at `critical`, and a resume action. |
| 3 | **Tickets** | P8 is **staff-created only**. Customer-side ticket creation stays out of scope; revisit after the staff queue → SLA → assignment → escalation path is stable. |
| 4 | **Impersonation** | Stays in **P12**, with the approval-gated, step-up-authenticated, 30-minute, restricted-operation, second-approver model unchanged. |
| 5 | **Plans** | **Data-only / configurable.** No mandatory four-tier seed; no pricing tier name in application logic. |

Scope for P5–P12 is now frozen. Changes go into a P13+ addendum rather than editing phases mid-implementation.

**Owner's emphasis:** P5's critical regression test is that a staff member holding only the old `business.view` ends up with **zero** new write access. That assertion is enforced inside the migration itself, not just in review.
