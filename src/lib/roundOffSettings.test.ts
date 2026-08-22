import { describe, it, expect } from "vitest";
import { calculateRoundOff, resolveRoundOff, type RoundOffSettings } from "@/lib/roundOffSettings";

// Base settings shared by every scenario below, overridden per-test the same
// way each document screen reads its own applyXxx flag off a live
// accounting_settings row.
const baseSettings: RoundOffSettings = {
  enabled: true,
  method: "nearest",
  applySalesInvoice: true,
  applyPurchaseInvoice: true,
  applyDebitNote: true,
  applyCreditNote: true,
  applySalesOrder: false,
  applyPurchaseOrder: false,
};

describe("calculateRoundOff — the one rounding engine every document defers to", () => {
  // The rule's own worked example (1234.47 -> +0.03 -> 1234.50) illustrates
  // the general Round Off concept, but this app's "nearest" method rounds to
  // the nearest whole rupee (SQL ROUND(x) with no scale, mirrored by
  // Math.round here) -- so 1234.47's nearest rupee is 1234, not 1234.50.
  it("nearest: 1234.47 rounds to the nearest whole rupee -> -0.47 -> 1234", () => {
    const { roundOffAmount, finalTotal } = calculateRoundOff(1234.47, "nearest");
    expect(roundOffAmount).toBe(-0.47);
    expect(finalTotal).toBe(1234);
  });

  it("nearest: 1234.53 rounds up to the nearest whole rupee -> +0.47 -> 1235", () => {
    const { roundOffAmount, finalTotal } = calculateRoundOff(1234.53, "nearest");
    expect(roundOffAmount).toBe(0.47);
    expect(finalTotal).toBe(1235);
  });

  it("round_down: 1234.47 -> -0.47 -> 1234", () => {
    const { roundOffAmount, finalTotal } = calculateRoundOff(1234.47, "round_down");
    expect(roundOffAmount).toBe(-0.47);
    expect(finalTotal).toBe(1234);
  });

  it("round_up: 1234.47 -> +0.53 -> 1235", () => {
    const { roundOffAmount, finalTotal } = calculateRoundOff(1234.47, "round_up");
    expect(roundOffAmount).toBe(0.53);
    expect(finalTotal).toBe(1235);
  });

  it("an already-whole total never picks up a spurious adjustment", () => {
    const { roundOffAmount, finalTotal } = calculateRoundOff(1234, "nearest");
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(1234);
  });
});

describe("resolveRoundOff — the OFF-means-exact-amount gate every screen must go through", () => {
  it("ON (master + type flag both true) rounds exactly like calculateRoundOff", () => {
    const { roundOffAmount, finalTotal } = resolveRoundOff(1234.47, baseSettings, true);
    expect(roundOffAmount).toBe(-0.47);
    expect(finalTotal).toBe(1234);
  });

  it("OFF via the master switch preserves the exact calculated amount, no matter the type flag", () => {
    const settings: RoundOffSettings = { ...baseSettings, enabled: false };
    const { roundOffAmount, finalTotal } = resolveRoundOff(1234.47, settings, true);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(1234.47);
  });

  it("OFF via the per-document-type flag preserves the exact amount even with the master switch on", () => {
    const { roundOffAmount, finalTotal } = resolveRoundOff(1234.47, baseSettings, false);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(1234.47);
  });

  // --- Sales Return / Credit Note (CreateSalesReturn.tsx: applyCreditNote) ---
  it("Sales Return — Round Off ON (applyCreditNote true): shows the adjustment", () => {
    const settings: RoundOffSettings = { ...baseSettings, method: "nearest" };
    const { roundOffAmount, finalTotal } = resolveRoundOff(999.6, settings, settings.applyCreditNote);
    expect(roundOffAmount).toBe(0.4);
    expect(finalTotal).toBe(1000);
  });

  it("Sales Return — Round Off OFF (applyCreditNote false): grand total stays exact, no line shown", () => {
    const settings: RoundOffSettings = { ...baseSettings, applyCreditNote: false };
    const { roundOffAmount, finalTotal } = resolveRoundOff(999.6, settings, settings.applyCreditNote);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(999.6);
  });

  // --- Quotation (CreateQuotation.tsx: gated on the master switch only) ---
  it("Quotation — master switch ON: rounds even though quotations have no dedicated flag", () => {
    const { roundOffAmount, finalTotal } = resolveRoundOff(555.2, baseSettings, true);
    expect(roundOffAmount).toBe(-0.2);
    expect(finalTotal).toBe(555);
  });

  it("Quotation — master switch OFF: exact amount, never silently rounds", () => {
    const settings: RoundOffSettings = { ...baseSettings, enabled: false };
    const { roundOffAmount, finalTotal } = resolveRoundOff(555.2, settings, true);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(555.2);
  });

  // --- Purchase Invoice (CreatePurchaseInvoice.tsx: applyPurchaseInvoice) ---
  it("Purchase Invoice — Round Off ON: preview matches applyPurchaseInvoiceRoundOff()'s server-side result", () => {
    const settings: RoundOffSettings = { ...baseSettings, method: "nearest" };
    const { roundOffAmount, finalTotal } = resolveRoundOff(138068.63, settings, settings.applyPurchaseInvoice);
    expect(roundOffAmount).toBe(0.37);
    expect(finalTotal).toBe(138069);
  });

  it("Purchase Invoice — Round Off OFF: UI total equals the exact saved total (no drift)", () => {
    const settings: RoundOffSettings = { ...baseSettings, applyPurchaseInvoice: false };
    const { roundOffAmount, finalTotal } = resolveRoundOff(138068.63, settings, settings.applyPurchaseInvoice);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(138068.63);
  });

  // --- Purchase Return / Debit Note (CreatePurchaseReturn.tsx: applyDebitNote) ---
  it("Purchase Return — Round Off ON: preview matches create_purchase_return()'s server-side result", () => {
    const settings: RoundOffSettings = { ...baseSettings, method: "round_up" };
    const { roundOffAmount, finalTotal } = resolveRoundOff(354.0, settings, settings.applyDebitNote);
    // Already whole -- round_up of an exact integer is a no-op, not a
    // spurious +1.
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(354);
  });

  it("Purchase Return — Round Off OFF: exact amount, independent of Sales Invoice's own setting", () => {
    const settings: RoundOffSettings = { ...baseSettings, applyDebitNote: false, applySalesInvoice: true };
    const { roundOffAmount, finalTotal } = resolveRoundOff(300.37, settings, settings.applyDebitNote);
    expect(roundOffAmount).toBe(0);
    expect(finalTotal).toBe(300.37);
    // Enabling Sales Invoice's flag must never leak into Debit Note's result.
    expect(settings.applySalesInvoice).toBe(true);
  });

  it("document types round independently: Purchase Invoice ON does not imply Purchase Return ON", () => {
    const settings: RoundOffSettings = { ...baseSettings, applyPurchaseInvoice: true, applyDebitNote: false };
    const pi = resolveRoundOff(100.5, settings, settings.applyPurchaseInvoice);
    const pr = resolveRoundOff(100.5, settings, settings.applyDebitNote);
    expect(pi.roundOffAmount).not.toBe(0);
    expect(pr.roundOffAmount).toBe(0);
    expect(pr.finalTotal).toBe(100.5);
  });
});
