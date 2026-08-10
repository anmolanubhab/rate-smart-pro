# RD Pro — Supabase Security Hardening Report

**Date:** 2026-08-10
**Project:** `zskfuioojivdqmqkzjqc` (ap-southeast-1)
**Scope:** Security only — no business-logic, accounting-formula, stock-calculation, invoice-total, GRN, or workflow changes.

## 0. Starting state (important)

Before making any change, the live database was audited directly (not assumed from local
migration files). Two things turned out to be true that changed the shape of this work:

1. **The two CRITICAL findings, and most of the HIGH findings, were already fixed live** by
   an earlier branch (`claude/rdpro-forensic-audit-8dfdbe`, PRs #49–#51) that this worktree's
   branch had not yet merged. Verified via `list_migrations` against the live project and
   `pg_get_functiondef` on the actual function bodies — not by trusting file names.
2. **The live database had 5 applied migrations with no corresponding files in this branch**
   (`secure_warehouse_bin_functions`, `revoke_mv_sales_summary_access`,
   `fix_approval_gate_edit_regression`, `add_purchase_invoice_round_off`,
   `add_credit_note_round_off`). These were merged into this branch from
   `origin/claude/rdpro-forensic-audit-8dfdbe` first, so the migration history in this repo
   now matches what's actually live and no duplicate/conflicting migration was created.

Re-auditing on top of that baseline found **two categories of gap the prior pass had not
covered**: (a) an unauthenticated-identity-spoofing bug in `accept_invitation_on_signup`, and
(b) a family of document-numbering RPCs and two read RPCs with zero business-membership
checks. Both are fixed below.

## 1. Findings — status

| # | Finding | Status | Fixed by |
|---|---|---|---|
| 1 | `apply_ledger_balance_delta()` no auth check | **FIXED** (pre-existing, verified live) | `20260809110600_secure_financial_definer_functions.sql` |
| 2 | `post_purchase_invoice()` no auth check | **FIXED** (pre-existing, verified live) | same |
| 3 | `get_bin_available_stock()` no auth | **FIXED** (pre-existing, verified live) | `20260809155016_secure_warehouse_bin_functions.sql` |
| 4 | `get_warehouse_available_stock()` no auth | **FIXED** (pre-existing, verified live) | same |
| 5 | `seed_unassigned_bin_for_warehouse()` no auth | **FIXED** (pre-existing, verified live) | same |
| 6 | `vw_ledger_statement` SECURITY DEFINER view | **FIXED** (pre-existing, verified live) | `20260809120000_secure_vw_ledger_statement_view.sql` (`security_invoker = true`) |
| 7 | ~95 SECURITY DEFINER fns callable by anon | **FIXED** (this session) — reduced to 5 documented exceptions | `20260810130100_security_hardening_definer_grant_sweep.sql` |
| 8 | 8 functions with mutable search_path | **FIXED** (pre-existing, verified live) — confirmed 0 functions with unpinned search_path remain | `20260809120200_pin_search_path_remaining_functions.sql` + earlier P0 migration |
| 9 | `mv_sales_summary` exposed via Data API | **FIXED** (pre-existing, verified live) | `20260809155100_revoke_mv_sales_summary_access.sql` |
| 10 | Leaked password protection disabled | **REQUIRES MANUAL DASHBOARD ACTION** (not SQL-controllable) | see §5 |
| 11 (new) | `accept_invitation_on_signup` accepted arbitrary `_user_id` with no ownership check — privilege-escalation into any business with a pending invitation | **FIXED** (this session) | `20260810130000_security_hardening_rpc_authorization_gaps.sql` |
| 12 (new) | `get_effective_party_rules`, `resolve_dispatch_bin`, and 9 `next_*_number` document-numbering RPCs had zero business-membership check | **FIXED** (this session) | same |
| 13 | 61 tables with RLS enabled, no policies | **ACCEPTED/INTENTIONAL** — verified not reachable from any SECURITY DEFINER function (see §4); fail-closed by default, left alone per audit instructions | n/a |

## 2. New migrations (this session)

- `20260810130000_security_hardening_rpc_authorization_gaps.sql` — adds `is_business_member`
  / `auth.uid()` checks to `accept_invitation_on_signup`, `get_effective_party_rules`,
  `resolve_dispatch_bin`, and the 9 `next_*_number` RPCs; revokes their anon/PUBLIC grants.
- `20260810130100_security_hardening_definer_grant_sweep.sql` — dynamic sweep revoking
  `EXECUTE ... FROM PUBLIC, anon` on every remaining SECURITY DEFINER function in `public`
  except a 5-item allowlist of genuinely pre-auth flows (see §3). Zero function bodies
  touched; `authenticated` grants untouched.
- `20260810130200` (applied directly, folded into the same session) — restores an
  `authenticated` grant on `accept_invitation_on_signup` that the sweep incidentally removed
  (see §6, self-caught regression).
- Also merged in from `origin/claude/rdpro-forensic-audit-8dfdbe`: the 5 files listed in §0.2,
  now committed to this branch's migration history so local files match the live database.

## 3. SECURITY DEFINER anon-EXECUTE allowlist (finding #7)

Only these 5 functions still hold an anon EXECUTE grant, all deliberately — every one either
takes a single-use token as its credential or independently validates the caller's identity
against `auth.users` before doing anything:

| Function | Why anon-callable is safe |
|---|---|
| `check_signup_contact_available` | Read-only pre-signup availability check, no PII beyond a boolean |
| `get_invitation_by_token` | Gated by an unguessable token |
| `get_salesman_invitation_by_token` | Gated by an unguessable token |
| `reject_invitation` | Gated by an unguessable token; only sets status to `rejected` |
| `submit_dealer_application` | Validates `_user_id` against `auth.users.email = _email` before any insert |

All other SECURITY DEFINER functions in `public` (~90) now reject anon at the grant layer.
`authenticated` access is unchanged everywhere except the one accidental regression, caught
and fixed in the same session (§6).

## 4. Dormant RLS tables (finding #13 / audit item J)

61 tables have `rowsecurity = true` and no policies (fail-closed: currently unreachable by
`anon`/`authenticated`, reachable only by roles with `BYPASSRLS`, e.g. the migration role).
Cross-referenced every SECURITY DEFINER function body against all 61 table names to check for
an RLS-bypass escape path. 3 substring hits, all false positives on inspection:

- `seed_party_groups` — matches "branches"/"employees" only as string *labels* it inserts
  into `party_groups.name` (`'Branches'`, `'Employees'`), never touches those tables.
- `approve_dealer_application` — matches "notifications" only via `dealer_notifications`
  (a different, non-dormant table).

No SECURITY DEFINER function reads or writes any of the 61 dormant tables. Per the audit's
own instruction not to blindly add policies to unused tables, they were left as-is.

## 5. Leaked password protection (finding #10)

Not controllable via SQL migration or the MCP tools available in this session (it's an Auth
service config, not a database object). **Manual action required:**

> Supabase Dashboard → Authentication → Providers → Email → enable **"Leaked password
> protection"** (checks new passwords against the HaveIBeenPwned breach corpus).

## 6. Regression caught and fixed during testing

The grant-sweep migration revoked `EXECUTE ... FROM PUBLIC, anon` on `accept_invitation_on_signup`.
Unlike its siblings, this function had never received an explicit `GRANT EXECUTE ... TO
authenticated` — it only inherited access via the `PUBLIC` pseudo-role, so revoking `PUBLIC`
silently cut off `authenticated` too. Caught by re-running `has_function_privilege('authenticated', ...)`
across every touched function immediately after applying the sweep; fixed with a targeted
`GRANT EXECUTE ... TO authenticated` in the same session before this report was written.
Grep of `src/` confirms this RPC has zero live call sites today (only referenced in generated
`types.ts`), so the regression window had zero user-facing impact.

## 7. Regression test results (executed live against the project)

| # | Test | Result |
|---|---|---|
| 1 | anon → `apply_ledger_balance_delta()` | **FAILED as required** — `42501 permission denied for function` |
| 2 | anon → `post_purchase_invoice()` | **FAILED as required** — `42501 permission denied for function` |
| 3 | Business A user → mutate Business B ledger account | **FAILED as required** — `P0001 Not authorized to modify this ledger account` |
| 4 | Business A user → post Business B purchase invoice | **FAILED as required** — `P0001 Purchase Invoice Not Found` (RLS makes the row invisible to a SECURITY INVOKER read; still fail-closed) |
| 5 | Business A user → own-business ledger delta | **SUCCEEDED as required** — call completed, balance updated |
| 6 | Business A user → read `vw_ledger_statement` | **No unauthorized rows** — 0 rows visible (view's backing table is dead/empty; `security_invoker=true` confirmed still set) |
| 7 | Business A user → `get_warehouse_available_stock()` on Business B's warehouse | **FAILED as required** — `P0001 Not authorized` |
| 8 | search_path exploit against any SECURITY DEFINER function | **Not possible** — confirmed 0 functions in `public` with an unpinned/mutable search_path |
| 9 | Direct Data API access to `mv_sales_summary` as anon or authenticated | **FAILED as required** — `has_table_privilege` is `false` for both roles |
| 10 | Advisor before/after | See §8 |

## 8. Advisor comparison

| Metric | Before this session | After this session |
|---|---|---|
| SECURITY DEFINER functions with anon EXECUTE | ~95 | **5** (documented allowlist, §3) |
| Functions with mutable/unpinned search_path | 0 (already fixed pre-session) | 0 |
| `mv_sales_summary` anon/authenticated SELECT | revoked pre-session | still revoked (both `false`) |
| Dormant RLS tables (enabled, no policy) | 61 | 61 (verified no escape path, §4) — unchanged by design |
| `auth_leaked_password_protection` WARN | present | present — dashboard-only fix, §5 |

## 9. Remaining risk / follow-ups

- **Leaked password protection** — dashboard action, not yet applied (owner action required).
- **61 dormant RLS tables** — intentionally left alone; revisit if/when any of these tables
  are wired into a live feature (add real membership-scoped policies at that time, don't add
  speculative ones now).
- One pre-existing, out-of-scope migration (`fix_credit_note_round_off_sign`, applied live
  2026-08-09) has no corresponding file in any branch's git history — it's an accounting
  round-off sign fix, unrelated to this security scope, and was left untouched.
