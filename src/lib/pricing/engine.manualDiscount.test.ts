import { describe, it, expect, vi } from "vitest";

// Regression test: a negative manual discount % used to flow straight into
// discountAmount with no floor, silently turning a "discount" field into a
// markup on the invoice with no warning. benefitAmount() (rule-based
// discounts) already floors at 0 — the manual-override path in
// calculateLine() must do the same.

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(...args: unknown[]): MockQuery;
  eq(...args: unknown[]): MockQuery;
  or(...args: unknown[]): MockQuery;
  lte(...args: unknown[]): MockQuery;
  order(...args: unknown[]): MockQuery;
  limit(...args: unknown[]): MockQuery;
  maybeSingle(): Promise<MockResult>;
}

function makeQuery(result: MockResult): MockQuery {
  const q: MockQuery = {
    select: () => q,
    eq: () => q,
    or: () => q,
    lte: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return q;
}

const PRODUCT_ROW = { mrp: 1000, dealer_rate: 800, cost_price: 500, gst_pct: 18, brand: null, category: null, group_id: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "products") return makeQuery({ data: PRODUCT_ROW, error: null });
      // party_price_assignments / price_lists / price_list_items / businesses / parties / accounting_settings
      return makeQuery({ data: null, error: null });
    },
    rpc: () => Promise.resolve({ data: false, error: null }),
  },
}));

import { calculatePricing } from "./engine";
import type { PricingContext } from "./types";

describe("calculatePricing — manual discount override", () => {
  const baseContext: Omit<PricingContext, "lines"> = {
    businessId: "biz-1",
    branchId: null,
    partyId: null,
    partyGroupId: null,
    salesmanId: null,
    warehouseId: null,
    date: "2026-08-14",
    voucherType: "sales_invoice",
  };

  it("floors a negative manual discount % at 0 instead of inflating the price", async () => {
    const context: PricingContext = {
      ...baseContext,
      lines: [{ lineId: "l1", productId: "prod-1", qty: 2, manualDiscountPct: -10 }],
    };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    expect(line.discountAmount).toBe(0);
    // basePrice is dealer_rate (800) * qty(2) = 1600, unaffected by a negative "discount".
    expect(line.taxableValue).toBe(1600);
  });

  it("still applies a normal positive manual discount correctly", async () => {
    const context: PricingContext = {
      ...baseContext,
      lines: [{ lineId: "l1", productId: "prod-1", qty: 2, manualDiscountPct: 10 }],
    };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    // 1600 - 10% = 1440
    expect(line.discountAmount).toBe(160);
    expect(line.taxableValue).toBe(1440);
  });
});
