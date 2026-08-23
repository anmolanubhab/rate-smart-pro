import { describe, it, expect } from "vitest";
import { isSalesModeAvailable, isPurchaseModeAvailable, evaluateWorkflowAccess } from "./workflowAccess";
import { DEFAULT_SALES_CONFIG } from "./salesConfig";
import { DEFAULT_PURCHASE_CONFIG } from "./purchaseConfig";

describe("isSalesModeAvailable", () => {
  it("default config: both direct and order_based available (hybrid by default)", () => {
    const cfg = { business_id: "b1", ...DEFAULT_SALES_CONFIG };
    expect(isSalesModeAvailable(cfg, "direct")).toBe(true);
    expect(isSalesModeAvailable(cfg, "order_based")).toBe(true);
  });

  it("direct disabled: order_based still available, default mode unaffected", () => {
    const cfg = { business_id: "b1", ...DEFAULT_SALES_CONFIG, enable_direct_invoice: false };
    expect(isSalesModeAvailable(cfg, "direct")).toBe(false);
    expect(isSalesModeAvailable(cfg, "order_based")).toBe(true);
  });

  it("a business defaulting to direct mode must still have order_based available if enabled -- default is not a hard restriction", () => {
    const cfg = { business_id: "b1", ...DEFAULT_SALES_CONFIG, default_sales_mode: "direct" as const };
    expect(isSalesModeAvailable(cfg, "order_based")).toBe(true);
  });
});

describe("isPurchaseModeAvailable", () => {
  it("default config: both modes available", () => {
    const cfg = { business_id: "b1", ...DEFAULT_PURCHASE_CONFIG };
    expect(isPurchaseModeAvailable(cfg, "direct")).toBe(true);
    expect(isPurchaseModeAvailable(cfg, "order_based")).toBe(true);
  });

  it("order_based disabled: direct still available", () => {
    const cfg = { business_id: "b1", ...DEFAULT_PURCHASE_CONFIG, enable_purchase_order: false };
    expect(isPurchaseModeAvailable(cfg, "order_based")).toBe(false);
    expect(isPurchaseModeAvailable(cfg, "direct")).toBe(true);
  });
});

describe("evaluateWorkflowAccess", () => {
  it("feature off + no permission -> blocked, reason cites the feature layer", () => {
    const r = evaluateWorkflowAccess({ featureAvailable: false, role: "salesman", perm: "sales.create", permissions: null });
    expect(r.allowed).toBe(false);
    expect(r.featureAvailable).toBe(false);
    expect(r.reason).toMatch(/turned on/i);
  });

  it("feature on + owner role -> allowed (legacy fallback grants owner everything)", () => {
    const r = evaluateWorkflowAccess({ featureAvailable: true, role: "owner", perm: "sales.create", permissions: null });
    expect(r.featureAvailable).toBe(true);
    expect(r.permitted).toBe(true);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("feature on + viewer role with no matrix -> permitted layer blocks, not the feature layer", () => {
    const r = evaluateWorkflowAccess({ featureAvailable: true, role: "viewer", perm: "sales.create", permissions: null });
    expect(r.featureAvailable).toBe(true);
    expect(r.permitted).toBe(false);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/permission/i);
  });

  it("the two layers are independent -- business-enabled does not imply user-permitted, and vice versa", () => {
    const bothOff = evaluateWorkflowAccess({ featureAvailable: false, role: "owner", perm: "sales.create", permissions: null });
    expect(bothOff.permitted).toBe(true); // owner is still permitted...
    expect(bothOff.allowed).toBe(false); // ...but feature being off still blocks it
  });
});
