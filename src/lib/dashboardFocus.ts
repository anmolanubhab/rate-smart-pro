// src/lib/dashboardFocus.ts
//
// "Dashboard Focus" (Phase 7 — Department-wise Dashboard): a per-user
// preference that REORDERS the Dashboard's top 4 KPI layers, never hides
// them. Deliberately separate from the free-text business_users.department
// column (which holds real organizational/brand labels today, not this
// fixed taxonomy) — this exists purely to personalize dashboard ordering.
//
// Honest limitation: only "accounts" (-> AccountingLayer) and "inventory"
// (-> InventoryWidgets) map cleanly to one dashboard section. The other 6
// focus values don't have a dedicated section to promote, so they route to
// the closest available proxy (see getSectionOrder below) — this is a
// judgment call, not a precise 1:1 mapping.

export type DashboardFocus =
  | "sales" | "purchase" | "accounts" | "inventory"
  | "warehouse" | "dispatch" | "administration" | "management";

export const DASHBOARD_FOCUS_OPTIONS: { value: DashboardFocus; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "accounts", label: "Accounts" },
  { value: "inventory", label: "Inventory" },
  { value: "warehouse", label: "Warehouse" },
  { value: "dispatch", label: "Dispatch" },
  { value: "administration", label: "Administration" },
  { value: "management", label: "Management" },
];

/** The 4 reorderable Dashboard KPI layers, in today's default order. */
export const SECTION_KEYS = ["health", "operations", "inventory", "accounting"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const DEFAULT_ORDER: SectionKey[] = ["health", "operations", "inventory", "accounting"];

/**
 * Priority order per focus. "administration"/"management" (and no focus set)
 * deliberately return the default order — those roles want the full
 * overview, not a skew toward one function.
 */
const FOCUS_ORDER: Partial<Record<DashboardFocus, SectionKey[]>> = {
  sales: ["operations", "health", "inventory", "accounting"],
  purchase: ["operations", "accounting", "health", "inventory"],
  accounts: ["accounting", "health", "operations", "inventory"],
  inventory: ["inventory", "health", "operations", "accounting"],
  warehouse: ["inventory", "operations", "health", "accounting"],
  dispatch: ["operations", "inventory", "health", "accounting"],
};

/** Returns the Dashboard section render order for a given focus. `null`/unset = today's default order. */
export function getSectionOrder(focus: DashboardFocus | null | undefined): SectionKey[] {
  if (!focus) return DEFAULT_ORDER;
  return FOCUS_ORDER[focus] ?? DEFAULT_ORDER;
}
