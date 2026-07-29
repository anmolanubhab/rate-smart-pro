// src/lib/navigation/types.ts
//
// Single source of truth for every navigable page in RD Pro.
// Sidebar, Command Search, Breadcrumbs, Favorites and Recent Pages all read
// from this shape — nothing else in the app should hold its own menu array.

import type { LucideIcon } from "lucide-react";

/** Permission string understood by `can(role, perm)` in useBusiness.tsx */
export type PermissionKey = string;

export interface QuickAction {
  /** Short imperative label shown in the "Quick Actions" group, e.g. "Create Order" */
  label: string;
  /** Optional keyboard shortcut hint, purely cosmetic (e.g. "⌘N") */
  shortcut?: string;
}

export interface NavItem {
  /** Stable unique id. Defaults to `route` when not supplied. */
  id: string;
  /** Display title, e.g. "Ledger Accounts" */
  title: string;
  /** One-line helper text shown under the title in search results */
  description?: string;
  /** Route this item navigates to. Omit for pure section/group headers. */
  route?: string;
  icon?: LucideIcon;
  /** Top-level module this item belongs to, e.g. "Accounts", "GST", "Sales" */
  module: string;
  /** Optional id of a parent NavItem — enables unlimited nested menus */
  parentId?: string;
  /** Extra search terms that aren't in the title (module names, synonyms) */
  keywords?: string[];
  /** Alternate names/abbreviations users might type, e.g. ["GRN"] for Goods Receipt Note */
  aliases?: string[];
  /** Permission required to see/use this item. Omitted = visible to all ERP roles. */
  perm?: PermissionKey;
  /** Marks this item as eligible for the "Quick Actions" group in search */
  quickAction?: QuickAction;
  /** Sort weight within its group; lower shows first */
  order?: number;
  /**
   * Set to false to keep this item fully working (route, Command Search,
   * breadcrumbs, and lookups via byId/byRoute) while removing it from the
   * Sidebar tree specifically. Use this for items that have been
   * consolidated into a hub page (e.g. individual reports now reachable
   * only through Report Center) — the route and registry entry stay real,
   * just the sidebar row goes away. Defaults to true.
   */
  showInSidebar?: boolean;
  /**
   * Marks a planned-but-not-yet-built page. A disabled item must NOT carry
   * a `route` — there is no page to link to yet, so it renders as a
   * greyed-out, non-interactive placeholder (no click, no keyboard focus,
   * a tooltip explaining why) instead of a real NavLink. It's excluded from
   * Command Search automatically (search only indexes items with a route).
   * This is a generic navigation-framework feature, not GST-specific — any
   * module can use it to show its planned structure ahead of the pages
   * actually existing. Once the real page ships, just add its `route` and
   * remove `disabled` — no other change needed.
   */
  disabled?: boolean;
  /** Tooltip shown on a disabled item. Defaults to "Coming soon" when omitted. */
  disabledReason?: string;
}

/** A NavItem enriched with the fully joined breadcrumb path (root → item) */
export interface NavItemWithPath extends NavItem {
  path: NavItem[];
}
