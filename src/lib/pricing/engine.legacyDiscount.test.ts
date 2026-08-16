import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the Sales Order integration's legacy-discount fallback:
// every business today prices via party.agreed_discount/default_discount
// (see src/lib/parties.ts), with NO price_lists/pricing_rules configured.
// calculatePricing() must reproduce that exact number when nothing in the
// new pricing system applies — and must NEVER combine it with a configured
// Price List or Pricing Rule (that always takes precedence instead).

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(...args: unknown[]): MockQuery;
  eq(...args: unknown[]): MockQuery;
  or(...args: unknown[]): MockQuery;
  lte(...args: unknown[]): MockQuery;
  in(...args: unknown[]): MockQuery;
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
    in: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return q;
}

const PRODUCT_ROW = { mrp: 1000, dealer_rate: 800, cost_price: 500, gst_pct: 18, brand: null, category: null, group_id: null };
let partyRow: { discount_type: string; agreed_discount: number; default_discount: number } | null = null;
let priceListItemRow: { price: number; mrp: number | null; cost: number | null } | null = null;
let defaultPriceListRow: { id: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "products") return makeQuery({ data: PRODUCT_ROW, error: null });
      if (table === "parties") return makeQuery({ data: partyRow, error: null });
      if (table === "pricing_rules") return makeQuery({ data: [], error: null });
      if (table === "price_lists") return makeQuery({ data: defaultPriceListRow, error: null });
      if (table === "price_list_items") return makeQuery({ data: priceListItemRow, error: null });
      // party_price_assignments / businesses / accounting_settings
      return makeQuery({ data: null, error: null });
    },
    rpc: () => Promise.resolve({ data: false, error: null }),
  },
}));

import { calculatePricing } from "./engine";
import type { PricingContext } from "./types";

describe("calculatePricing — legacy party-discount fallback (no Price List, no Pricing Rule)", () => {
  const baseContext: Omit<PricingContext, "lines" | "partyId"> = {
    businessId: "biz-1",
    branchId: null,
    partyGroupId: null,
    salesmanId: null,
    warehouseId: null,
    date: "2026-08-14",
    voucherType: "sales_invoice",
  };

  beforeEach(() => {
    partyRow = null;
    priceListItemRow = null;
    defaultPriceListRow = null;
  });

  it("applies party.agreed_discount when discount_type is RD, using product MRP as base (matching legacy CreateOrder.tsx)", async () => {
    partyRow = { discount_type: "RD", agreed_discount: 15, default_discount: 999 };
    const context: PricingContext = { ...baseContext, partyId: "party-1", lines: [{ lineId: "l1", productId: "prod-1", qty: 2 }] };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    expect(line.priceSource).toBe("legacy_party_discount");
    expect(line.basePrice).toBe(1000); // product MRP, not dealer_rate (800)
    expect(line.discountAmount).toBe(300); // 1000 * 2 * 15%
    expect(line.taxableValue).toBe(1700);
  });

  it("applies party.default_discount when discount_type is CD", async () => {
    partyRow = { discount_type: "CD", agreed_discount: 999, default_discount: 10 };
    const context: PricingContext = { ...baseContext, partyId: "party-1", lines: [{ lineId: "l1", productId: "prod-1", qty: 1 }] };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    expect(line.discountAmount).toBe(100); // 1000 * 1 * 10%
  });

  it("falls back to plain product MRP with zero discount when there's no party at all", async () => {
    partyRow = null;
    const context: PricingContext = { ...baseContext, partyId: null, lines: [{ lineId: "l1", productId: "prod-1", qty: 1 }] };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    expect(line.priceSource).toBe("product_fallback");
    expect(line.discountAmount).toBe(0);
    expect(line.basePrice).toBe(1000);
  });

  it("a configured default Price List takes precedence over the legacy party discount — no double-apply", async () => {
    partyRow = { discount_type: "RD", agreed_discount: 15, default_discount: 999 };
    defaultPriceListRow = { id: "pl-1" };
    priceListItemRow = { price: 750, mrp: null, cost: null };
    const context: PricingContext = { ...baseContext, partyId: "party-1", lines: [{ lineId: "l1", productId: "prod-1", qty: 1 }] };
    const result = await calculatePricing(context);
    const line = result.lines[0];
    expect(line.priceSource).toBe("price_list");
    expect(line.basePrice).toBe(750); // price list price, not MRP
    expect(line.discountAmount).toBe(0); // legacy 15% must NOT also apply on top
    expect(line.priceListId).toBe("pl-1");
  });
});
