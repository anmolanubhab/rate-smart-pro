// Pricing & Promotion Engine — Phase 1B.1 Budget Check.
//
// Same adapter shape as src/lib/gstProvider.ts and src/lib/pricing/providers.ts
// (this session's established pattern for "one interface, swappable
// implementation"). No promotion_budgets table exists yet (deferred to a
// later Claim & Settlement phase), so stubBudgetProvider is the only
// implementation today — it always reports NOT_CONFIGURED, honestly. The
// Pricing Engine itself never knows whether a real budget module exists;
// getBudgetProvider() is the one line Phase 6/7 changes to plug one in.
//
// BudgetCheckContext deliberately carries every dimension a real budget
// could be scoped to (branch/brand/product group/product/party group/
// party/salesman) even though the stub ignores all of them — so a future
// provider can scope-match against any of them without an interface change.

export type BudgetCheckStatus = "NOT_CONFIGURED" | "OK" | "WARNING" | "EXCEEDED" | "APPROVAL_REQUIRED";

export interface BudgetCheckResult {
  enabled: boolean;
  status: BudgetCheckStatus;
  budgetId?: string;
  budgetName?: string;
  allocatedAmount?: number;
  consumedAmount?: number;
  remainingAmount?: number;
  utilizationPercent?: number;
  message?: string;
  requiresApproval?: boolean;
}

export interface BudgetCheckContext {
  businessId: string;
  branchId?: string | null;
  brandId?: string | null;
  productGroupId?: string | null;
  productId?: string | null;
  partyGroupId?: string | null;
  partyId?: string | null;
  salesmanId?: string | null;
  ruleId: string;
  ruleType: string;
  date: string;
}

export interface BudgetProvider {
  id: string;
  checkBudget(context: BudgetCheckContext): Promise<BudgetCheckResult>;
}

export const stubBudgetProvider: BudgetProvider = {
  id: "stub",
  async checkBudget(): Promise<BudgetCheckResult> {
    return { enabled: false, status: "NOT_CONFIGURED", message: "Promotion Budget Engine not configured." };
  },
};

/** Phase 6/7 swaps this one line for a real provider — nothing else in the engine, Test Bench, or any future UI changes. */
export function getBudgetProvider(): BudgetProvider {
  return stubBudgetProvider;
}
