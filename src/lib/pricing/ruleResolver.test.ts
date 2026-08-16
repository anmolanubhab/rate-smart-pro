import { describe, it, expect, vi } from "vitest";

// Regression test: a failed pricing_rules query used to be treated
// identically to "this business has zero active rules" (both returned an
// empty candidate list), which would silently price the line as if no
// pricing rules existed instead of surfacing the failure. resolveApplicableRules
// must now throw so the engine/caller sees the error instead of a wrong price.

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(...args: unknown[]): MockQuery;
  eq(...args: unknown[]): MockQuery;
  or(...args: unknown[]): MockQuery;
  in(...args: unknown[]): MockQuery;
  maybeSingle(): Promise<MockResult>;
}

function makeQuery(result: MockResult): MockQuery {
  const q: MockQuery = {
    select: () => q,
    eq: () => q,
    or: () => q,
    in: () => q,
    maybeSingle: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      table === "pricing_rules"
        ? makeQuery({ data: null, error: { message: "connection reset" } })
        : makeQuery({ data: [], error: null }),
  },
}));

import { resolveApplicableRules } from "./ruleResolver";
import type { PricingContext, PricingContextLine } from "./types";

describe("resolveApplicableRules — database error handling", () => {
  it("throws instead of silently returning zero rules when pricing_rules query fails", async () => {
    const context: PricingContext = {
      businessId: "biz-1",
      branchId: null,
      partyId: null,
      partyGroupId: null,
      salesmanId: null,
      warehouseId: null,
      date: "2026-08-14",
      voucherType: "sales_invoice",
      lines: [],
    };
    const line: PricingContextLine = { lineId: "l1", productId: "prod-1", qty: 1 };

    await expect(resolveApplicableRules(context, line, 100)).rejects.toThrow(/Failed to load pricing rules/);
  });
});
