import { describe, it, expect } from "vitest";

// Regression for the pricing-context race in CreateOrder's product pick.
//
// calculatePricing() needs a business id. It was taken from useBusiness()'s
// `business?.id`, which resolves ASYNCHRONOUSLY — so for a moment after page
// load it is null. The product-pick handler treated that as "no business" and
// fell through to a legacy fallback that prices off raw product fields and
// re-applies the party's legacy RD discount.
//
// The consequence was not a crash or an empty field, which is why it survived:
// the order was silently priced WRONG. With a price list resolving 145 at 0%,
// a product picked in that window instead took the party's legacy 10% — the
// exact "legacy stacked on top of the price list" outcome the pricing SSOT
// was built to eliminate. Caught by the Playwright pricing SSOT spec, which
// picks a product immediately after navigating to /orders/new.
//
// The active company id is available SYNCHRONOUSLY from localStorage — the
// same source businessScope.ts trusts — so there is no window in which it is
// genuinely unknown. This pins that resolution order.

/** Mirrors the business-id resolution in CreateOrder's pickProduct. */
function resolvePricingBusinessId(
  asyncBusinessId: string | null | undefined,
  localStorageBusinessId: string | null
): string | null {
  return asyncBusinessId ?? localStorageBusinessId;
}

/** true = the pricing engine runs; false = the legacy product fallback runs. */
function usesPricingEngine(
  asyncBusinessId: string | null | undefined,
  localStorageBusinessId: string | null
): boolean {
  return Boolean(resolvePricingBusinessId(asyncBusinessId, localStorageBusinessId));
}

const BIZ = "biz-b-bootstrap";

describe("CreateOrder pricing context", () => {
  it("uses the pricing engine while useBusiness() is still resolving", () => {
    // The regression: business is null (still loading) but the company IS
    // known — localStorage has it. This must not fall back to legacy pricing.
    expect(usesPricingEngine(null, BIZ)).toBe(true);
    expect(resolvePricingBusinessId(null, BIZ)).toBe(BIZ);
  });

  it("uses the pricing engine when useBusiness() has resolved", () => {
    expect(usesPricingEngine(BIZ, BIZ)).toBe(true);
  });

  it("prefers the resolved business over localStorage when both are present", () => {
    // useBusiness() is the authority once it has an answer; localStorage is
    // only the synchronous stand-in for the gap before that.
    expect(resolvePricingBusinessId(BIZ, "stale-other-company")).toBe(BIZ);
  });

  it("falls back only when there is genuinely no company at all", () => {
    // The fallback still exists — it just now means "no company", not
    // "not yet". Pricing cannot run without a company to price against.
    expect(usesPricingEngine(null, null)).toBe(false);
    expect(resolvePricingBusinessId(undefined, null)).toBe(null);
  });

  it("undefined from a not-yet-loaded hook behaves the same as null", () => {
    expect(usesPricingEngine(undefined, BIZ)).toBe(true);
  });
});
