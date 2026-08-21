/**
 * Single shared Purchase calculation engine — used by Purchase Order,
 * Purchase Invoice, and any future purchase pricing preview. Replaces the
 * two independent copies that used to live in purchaseOrders.ts
 * (computePOItem) and purchaseInvoices.ts (computeInvoiceItem) — same
 * formula, duplicated by copy-paste, both rounding the discounted RATE to
 * 2 decimals before multiplying by quantity.
 *
 * That rounding-before-multiplying is exactly the precision bug this
 * module exists to close: at qty=130, rate=₹1,078.24, discount=1.5%, the
 * correct discount is ₹2,102.568 → ₹2,102.57, but rounding the rate first
 * (₹1,078.24 × 0.985 = ₹1,062.0664 → ₹1,062.07) silently drifts the
 * result. This module never rounds any intermediate value — only the
 * final monetary outputs (taxable_amount, tax_amount, total_amount,
 * discount amount) are rounded to 2 decimals, computed from one
 * full-precision expression chain.
 *
 * Free-quantity schemes are computed separately from monetary discount:
 * chargeable_qty is always the billed/priced quantity; free_qty is
 * additive stock-only and never folds into the priced amount (spec §6 —
 * a 10+1 scheme on 130 paid units yields 143 total physical qty, but the
 * purchase VALUE is still 130 × rate, never 143 × rate).
 */

export type PurchasePricingMode =
  | "mrp_discount"
  | "mrp_discount_additional"
  | "fixed_ndp"
  | "ndp_additional_discount"
  | "fixed_rate"
  | "manual";

export type PurchaseSchemeType =
  | "buy_x_get_y"
  | "slab"
  | "percentage"
  | "fixed_amount"
  | "rate_benefit"
  | "none";

export interface SlabBreakpoint {
  min_qty: number;
  free_qty: number;
}

export interface PurchaseSchemeConfig {
  // buy_x_get_y
  buy_qty?: number;
  get_qty?: number;
  // slab — highest breakpoint whose min_qty <= chargeable qty wins
  breakpoints?: SlabBreakpoint[];
  // percentage — informational benefit %, not folded into taxable amount
  pct?: number;
  // fixed_amount — informational flat benefit per line, not folded into taxable amount
  amount?: number;
  // rate_benefit — informational benefit per `per_qty` units purchased
  per_qty?: number;
  benefit_amount?: number;
}

export interface PurchaseLineInput {
  qty: number;
  rate: number;
  primaryDiscountPct?: number;
  additionalDiscountPct?: number;
  gstPct?: number;
  schemeType?: PurchaseSchemeType;
  schemeConfig?: PurchaseSchemeConfig | null;
}

export interface PurchaseLineResult {
  chargeableQty: number;
  freeQty: number;
  totalPhysicalQty: number;
  grossAmount: number;
  primaryDiscountAmount: number;
  additionalDiscountAmount: number;
  totalDiscountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** Pure display-only metric (spec §7) — never used as the accounting rate. */
  effectiveCostPerUnit: number;
  /** Informational scheme monetary benefit (percentage/fixed_amount/rate_benefit) — not folded into taxableAmount. */
  schemeBenefitAmount: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Free quantity implied by a scheme, given the chargeable (billed) qty. Never affects monetary calculation. */
export function resolveSchemeFreeQty(qty: number, schemeType?: PurchaseSchemeType, config?: PurchaseSchemeConfig | null): number {
  if (!schemeType || schemeType === "none" || !config) return 0;
  if (schemeType === "buy_x_get_y") {
    const buyQty = Number(config.buy_qty) || 0;
    const getQty = Number(config.get_qty) || 0;
    if (buyQty <= 0 || getQty <= 0) return 0;
    return Math.floor(qty / buyQty) * getQty;
  }
  if (schemeType === "slab") {
    const breakpoints = config.breakpoints ?? [];
    const applicable = breakpoints
      .filter((b) => qty >= Number(b.min_qty))
      .sort((a, b) => Number(b.min_qty) - Number(a.min_qty))[0];
    return applicable ? Number(applicable.free_qty) || 0 : 0;
  }
  return 0;
}

/** Informational-only monetary scheme benefit — never folded into taxable amount (spec §6/§7). */
function resolveSchemeBenefitAmount(qty: number, grossAmount: number, schemeType?: PurchaseSchemeType, config?: PurchaseSchemeConfig | null): number {
  if (!schemeType || schemeType === "none" || !config) return 0;
  if (schemeType === "percentage") return round2(grossAmount * (Number(config.pct) || 0) / 100);
  if (schemeType === "fixed_amount") return round2(Number(config.amount) || 0);
  if (schemeType === "rate_benefit") {
    const perQty = Number(config.per_qty) || 0;
    const benefit = Number(config.benefit_amount) || 0;
    if (perQty <= 0) return 0;
    return round2(Math.floor(qty / perQty) * benefit);
  }
  return 0;
}

export function computePurchaseLine(input: PurchaseLineInput): PurchaseLineResult {
  const qty = Number(input.qty) || 0;
  const rate = Number(input.rate) || 0;
  const primaryPct = Number(input.primaryDiscountPct) || 0;
  const additionalPct = Number(input.additionalDiscountPct) || 0;
  const gstPct = Number(input.gstPct) || 0;

  // No intermediate rounding — the full chain is computed at full
  // precision, and only the final amounts below are rounded once.
  const gross = qty * rate;
  const afterPrimary = gross * (1 - primaryPct / 100);
  const afterAdditional = afterPrimary * (1 - additionalPct / 100);

  const taxableAmount = round2(afterAdditional);
  const primaryDiscountAmount = round2(gross - afterPrimary);
  const additionalDiscountAmount = round2(afterPrimary - afterAdditional);
  const totalDiscountAmount = round2(gross - afterAdditional);
  const taxAmount = round2(afterAdditional * (gstPct / 100));
  const totalAmount = round2(taxableAmount + taxAmount);

  const freeQty = resolveSchemeFreeQty(qty, input.schemeType, input.schemeConfig);
  const totalPhysicalQty = qty + freeQty;
  const schemeBenefitAmount = resolveSchemeBenefitAmount(qty, gross, input.schemeType, input.schemeConfig);

  const effectiveCostPerUnit = totalPhysicalQty > 0 ? round2(totalAmount / totalPhysicalQty) : totalAmount;

  return {
    chargeableQty: qty,
    freeQty,
    totalPhysicalQty,
    grossAmount: round2(gross),
    primaryDiscountAmount,
    additionalDiscountAmount,
    totalDiscountAmount,
    taxableAmount,
    taxAmount,
    totalAmount,
    effectiveCostPerUnit,
    schemeBenefitAmount,
  };
}

/** Resolves the rate to use for a line given a Purchase Pricing Mode and its configured values — pure, no I/O. */
export function resolveRateForMode(
  mode: PurchasePricingMode | null | undefined,
  cfg: { mrp?: number | null; ndp?: number | null; fixedRate?: number | null; primaryDiscountPct?: number | null; additionalDiscountPct?: number | null },
): { rate: number; primaryDiscountPct: number; additionalDiscountPct: number } {
  const mrp = Number(cfg.mrp) || 0;
  const ndp = Number(cfg.ndp) || 0;
  const fixedRate = Number(cfg.fixedRate) || 0;
  const primaryPct = Number(cfg.primaryDiscountPct) || 0;
  const additionalPct = Number(cfg.additionalDiscountPct) || 0;

  switch (mode) {
    case "mrp_discount":
      return { rate: mrp, primaryDiscountPct: primaryPct, additionalDiscountPct: 0 };
    case "mrp_discount_additional":
      return { rate: mrp, primaryDiscountPct: primaryPct, additionalDiscountPct: additionalPct };
    case "fixed_ndp":
      return { rate: ndp, primaryDiscountPct: 0, additionalDiscountPct: 0 };
    case "ndp_additional_discount":
      return { rate: ndp, primaryDiscountPct: 0, additionalDiscountPct: additionalPct };
    case "fixed_rate":
      return { rate: fixedRate, primaryDiscountPct: 0, additionalDiscountPct: 0 };
    case "manual":
    default:
      return { rate: mrp || ndp || fixedRate, primaryDiscountPct: primaryPct, additionalDiscountPct: additionalPct };
  }
}
