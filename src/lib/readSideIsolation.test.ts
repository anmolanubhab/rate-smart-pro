import { describe, it, expect, vi, beforeEach } from "vitest";

// READ-SIDE CROSS-COMPANY ISOLATION
//
// The attack matrix in crossCompanyMatrix.test.ts covers SINGLE-RECORD reads,
// where a denial is a thrown "not found". This file covers the other half of
// the read side — LIST and AGGREGATE reads, where nothing throws and a leak is
// silent: an extra row in a report, an inflated SUM on a dashboard tile.
//
// Every fixture below gives company A and company B DIFFERENT amounts, so an
// unscoped query cannot coincidentally produce the right total. The assertions
// are on the computed figures (SUM / COUNT / BALANCE / PROFIT), not just on
// row identity — a report that filters its rows but sums the unfiltered set
// still fails here.
//
// The mock applies .eq()/.gte()/.lte() against the fixture rather than
// returning canned data, so a function that forgot .eq("business_id", …)
// genuinely receives both companies' rows.

const BIZ_A = "biz-aaaa-akl";
const BIZ_B = "biz-bbbb-qa";
const USER = "user-owns-both";

/** Voucher rows shaped for fetchPeriodIncomeExpense's nested select. */
const salesItem = (amt: number) => ({
  dr_amount: 0,
  cr_amount: amt,
  ledger_accounts: { account_groups: { nature: "income", account_type: "sales" } },
});
const purchaseItem = (amt: number) => ({
  dr_amount: amt,
  cr_amount: 0,
  ledger_accounts: { account_groups: { nature: "expense", account_type: "purchase" } },
});

const TABLES: Record<string, Record<string, unknown>[]> = {
  vouchers: [
    {
      id: "v-A1", business_id: BIZ_A, user_id: USER, is_deleted: false,
      voucher_type: "sales", voucher_date: "2026-08-10", total_amount: 1000,
      status: "posted", voucher_number: "JV-A-1",
      voucher_items: [salesItem(1000)],
    },
    {
      id: "v-A2", business_id: BIZ_A, user_id: USER, is_deleted: false,
      voucher_type: "purchase", voucher_date: "2026-08-11", total_amount: 400,
      status: "posted", voucher_number: "JV-A-2",
      voucher_items: [purchaseItem(400)],
    },
    // Company B's rows carry deliberately distinct amounts.
    {
      id: "v-B1", business_id: BIZ_B, user_id: USER, is_deleted: false,
      voucher_type: "sales", voucher_date: "2026-08-10", total_amount: 77,
      status: "posted", voucher_number: "JV-B-1",
      voucher_items: [salesItem(77)],
    },
    {
      id: "v-B2", business_id: BIZ_B, user_id: USER, is_deleted: false,
      voucher_type: "purchase", voucher_date: "2026-08-11", total_amount: 13,
      status: "posted", voucher_number: "JV-B-2",
      voucher_items: [purchaseItem(13)],
    },
  ],
  ledger_accounts: [
    {
      id: "led-A", business_id: BIZ_A, user_id: USER, name: "Cash A",
      ledger_type: "cash", opening_balance: 100, opening_balance_type: "dr",
      current_balance: 900, is_system: false, status: "active", group: null,
    },
    {
      id: "led-B", business_id: BIZ_B, user_id: USER, name: "Cash B",
      ledger_type: "cash", opening_balance: 5, opening_balance_type: "dr",
      current_balance: 20, is_system: false, status: "active", group: null,
    },
  ],
  dispatches: [
    { id: "disp-A", business_id: BIZ_A, user_id: USER, created_at: "2026-08-10", orders: null },
    { id: "disp-B", business_id: BIZ_B, user_id: USER, created_at: "2026-08-11", orders: null },
  ],
  // segments is tenant-owned master data, NOT platform-global: it holds no
  // business_id IS NULL rows, nothing seeds one, and RLS now refuses to let an
  // authenticated user create, edit or delete one. The stray global row below
  // stands for the pollution a user could previously publish to every tenant —
  // fetchSegments must not surface it even if one somehow exists.
  segments: [
    { id: "seg-A", business_id: BIZ_A, name: "Retail", is_default: true },
    { id: "seg-B", business_id: BIZ_B, name: "Wholesale", is_default: false },
    { id: "seg-global", business_id: null, name: "POLLUTION", is_default: false },
  ],
};

let activeBusinessId: string | null = BIZ_A;

vi.mock("@/lib/activeBusiness", () => ({
  getActiveBusinessIdSync: () => activeBusinessId,
  onActiveBusinessChange: () => () => {},
}));

/** Minimal PostgREST-ish builder that really applies the filters. */
function query(rows: Record<string, unknown>[]) {
  let filtered = [...rows];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return q;
    },
    neq: () => q,
    gte: (col: string, val: string) => {
      filtered = filtered.filter((r) => String(r[col]) >= val);
      return q;
    },
    lte: (col: string, val: string) => {
      filtered = filtered.filter((r) => String(r[col]) <= val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return q;
    },
    or: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    then: (ok: (r: { data: unknown; error: unknown }) => unknown, err: (e: unknown) => unknown) =>
      Promise.resolve({ data: filtered, error: null }).then(ok, err),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => query(TABLES[table] ?? []),
      update: () => query(TABLES[table] ?? []),
      delete: () => query(TABLES[table] ?? []),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { fetchVouchers, fetchLedgersWithBalance, fetchPeriodIncomeExpense } from "./accounting";
import { fetchDispatches } from "./dispatches";
import { fetchSegments } from "./parties";

describe("Read-side isolation — lists and aggregates", () => {
  beforeEach(() => {
    activeBusinessId = BIZ_A;
  });

  describe("COUNT / row identity: a list must not contain the other company", () => {
    it("fetchVouchers returns only company A's vouchers", async () => {
      activeBusinessId = BIZ_A;
      const rows = await fetchVouchers(USER);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => String(r.voucher_number).includes("-A-"))).toBe(true);
    });

    it("fetchVouchers returns only company B's vouchers when B is active", async () => {
      activeBusinessId = BIZ_B;
      const rows = await fetchVouchers(USER);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => String(r.voucher_number).includes("-B-"))).toBe(true);
    });

    it("fetchDispatches returns only the active company's dispatches", async () => {
      activeBusinessId = BIZ_A;
      const a = await fetchDispatches(USER);
      expect(a.map((d: { id: string }) => d.id)).toEqual(["disp-A"]);

      activeBusinessId = BIZ_B;
      const b = await fetchDispatches(USER);
      expect(b.map((d: { id: string }) => d.id)).toEqual(["disp-B"]);
    });

    it("fetchLedgersWithBalance returns only the active company's ledgers", async () => {
      activeBusinessId = BIZ_A;
      const rows = await fetchLedgersWithBalance(USER);
      expect(rows.map((l) => l.id)).toEqual(["led-A"]);
    });

    it("fetchSegments returns only the active company's segments", async () => {
      activeBusinessId = BIZ_A;
      const a = await fetchSegments();
      expect(a.map((s: { id: string }) => s.id)).toEqual(["seg-A"]);

      activeBusinessId = BIZ_B;
      const b = await fetchSegments();
      expect(b.map((s: { id: string }) => s.id)).toEqual(["seg-B"]);
    });

    it("fetchSegments never surfaces a NULL-business segment", async () => {
      // segments is tenant-owned, not platform-global. RLS now refuses to let
      // an authenticated user create a business_id IS NULL row; this pins the
      // read side too, so a stray global row could not leak into a tenant's
      // list even if one were somehow provisioned.
      activeBusinessId = BIZ_A;
      const rows = await fetchSegments();
      expect(rows.some((s: { business_id: string | null }) => s.business_id === null)).toBe(false);
      expect(rows.some((s: { name: string }) => s.name === "POLLUTION")).toBe(false);
    });
  });

  describe("SUM / BALANCE / PROFIT: aggregates must not merge companies", () => {
    it("period income/expense sums company A only", async () => {
      activeBusinessId = BIZ_A;
      const r = await fetchPeriodIncomeExpense(USER, "2026-08-01", "2026-08-31");
      // A alone: income 1000, expense 400. Merged with B it would be 1077/413.
      expect(r.income).toBe(1000);
      expect(r.expense).toBe(400);
      expect(r.income - r.expense, "gross profit must be A's alone").toBe(600);
    });

    it("period income/expense sums company B only", async () => {
      activeBusinessId = BIZ_B;
      const r = await fetchPeriodIncomeExpense(USER, "2026-08-01", "2026-08-31");
      expect(r.income).toBe(77);
      expect(r.expense).toBe(13);
      expect(r.income - r.expense).toBe(64);
    });

    it("ledger BALANCE is company A's alone", async () => {
      activeBusinessId = BIZ_A;
      const rows = await fetchLedgersWithBalance(USER);
      const cash = rows.reduce((s, l) => s + (l.balance ?? 0), 0);
      // A: opening 100 dr + current 900 = 1000. B would add 25.
      expect(cash).toBe(1000);
    });

    it("voucher total SUM is company A's alone", async () => {
      activeBusinessId = BIZ_A;
      const rows = await fetchVouchers(USER);
      const total = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
      // A: 1000 + 400 = 1400. Leaking B would give 1490.
      expect(total).toBe(1400);
    });
  });

  describe("fail closed: no active company must not mean 'no filter'", () => {
    // The pre-fix code was `if (biz) q = q.eq("business_id", biz)`, which
    // dropped the company filter entirely and returned every company merged.
    it("fetchVouchers returns nothing rather than everything", async () => {
      activeBusinessId = null;
      await expect(fetchVouchers(USER)).resolves.toEqual([]);
    });

    it("fetchLedgersWithBalance returns nothing rather than everything", async () => {
      activeBusinessId = null;
      await expect(fetchLedgersWithBalance(USER)).resolves.toEqual([]);
    });

    it("fetchDispatches returns nothing rather than everything", async () => {
      activeBusinessId = null;
      await expect(fetchDispatches(USER)).resolves.toEqual([]);
    });

    it("fetchSegments returns nothing rather than every company's segments", async () => {
      activeBusinessId = null;
      await expect(fetchSegments()).resolves.toEqual([]);
    });

    it("fetchPeriodIncomeExpense reports zero rather than every company's profit", async () => {
      activeBusinessId = null;
      await expect(fetchPeriodIncomeExpense(USER, "2026-08-01", "2026-08-31")).resolves.toEqual({
        income: 0,
        expense: 0,
        netSales: 0,
        netPurchases: 0,
      });
    });
  });
});
