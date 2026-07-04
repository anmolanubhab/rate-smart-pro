// Central role → landing route map. Data-driven so new roles (dealer,
// retailer, wholesaler, distributor…) can be added without touching call sites.
// Read via getLandingForRole(role). Access checks read via canAccessErp / isPortalRole.

export type PortalKind = "erp" | "dealer" | "retailer" | "salesman";

// Uses `string` (not BusinessRole enum) so roles introduced later in the DB
// automatically flow through without a code change if they match a key here.
const ROLE_HOME: Record<string, string> = {
  owner: "/dashboard",
  admin: "/dashboard",
  manager: "/dashboard",
  accountant: "/dashboard",
  operator: "/dashboard",
  viewer: "/dashboard",
  salesman: "/dashboard",
  // Reserved for future external roles — same-app routes, no new project.
  dealer: "/portal/dashboard",
  wholesaler: "/portal/dashboard",
  distributor: "/portal/dashboard",
  retailer: "/portal/dashboard",
};

const PORTAL_BY_ROLE: Record<string, PortalKind> = {
  owner: "erp", admin: "erp", manager: "erp", accountant: "erp",
  operator: "erp", viewer: "erp", salesman: "erp",
  dealer: "dealer", wholesaler: "dealer", distributor: "dealer", retailer: "dealer",
};

export function getLandingForRole(role: string | null | undefined): string {
  if (!role) return "/companies";
  return ROLE_HOME[role] ?? "/dashboard";
}

export function getPortalForRole(role: string | null | undefined): PortalKind | null {
  if (!role) return null;
  return PORTAL_BY_ROLE[role] ?? "erp";
}

export function canAccessErp(role: string | null | undefined): boolean {
  return getPortalForRole(role) === "erp";
}

export function canAccessDealerPortal(role: string | null | undefined): boolean {
  return getPortalForRole(role) === "dealer";
}
