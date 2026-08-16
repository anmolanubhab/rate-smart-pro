// Pricing & Promotion Engine — Phase 1B profit estimation.
//
// Cost comes from price_list_items.cost (when the resolved price list sets
// one) or products.cost_price otherwise — the latter is kept live by the
// existing sync_cost_price_from_purchases RPC (src/pages/Products.tsx), so
// no new cost tracking is needed here. A true FIFO/landed-cost Costing
// Engine (inventory_cost_layers/inventory_valuation, already schema-shaped
// but unwired) is deferred, per the Phase 1A plan.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ProfitEstimate {
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
}

// Profit is measured against the TAXABLE value (post-discount, pre-GST), not
// the GST-inclusive final amount. Output GST is collected on the government's
// behalf and paid out again — it never belongs to the business, so counting it
// as revenue overstates both profit and margin by the GST rate (an 18% line
// with zero cost otherwise reports a 100% margin on a number the seller never
// keeps). Callers pass `taxableValue` from the engine for this reason.
export function calculateProfit(taxableValue: number, qty: number, unitCost: number | null): ProfitEstimate {
  const estimatedCost = round2((unitCost ?? 0) * qty);
  const estimatedProfit = round2(taxableValue - estimatedCost);
  const estimatedMarginPct = taxableValue > 0 ? round2((estimatedProfit / taxableValue) * 100) : 0;
  return { estimatedCost, estimatedProfit, estimatedMarginPct };
}
