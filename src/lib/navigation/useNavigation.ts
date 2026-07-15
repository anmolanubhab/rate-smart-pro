// src/lib/navigation/useNavigation.ts
//
// Builds the navigation index ONCE (memoized) from NAV_ITEMS and exposes:
//  - tree: items grouped by module, nested by parentId (drives the Sidebar)
//  - byId / byRoute: fast lookups (drives Breadcrumbs)
//  - getPath: root -> item chain (drives Breadcrumbs)
//  - quickActions: flagged items (drives Search empty-state)
//  - search(query): fuzzy-ranked, permission-filtered results (drives Search)
//
// Permission filtering is centralized here so Sidebar and Search never
// diverge on "who can see what".

import { useMemo } from "react";
import { NAV_ITEMS } from "./registry";
import type { NavItem, NavItemWithPath } from "./types";
import { scoreItem } from "./fuzzy";
import { useBusiness, can } from "@/hooks/useBusiness";

export interface NavModuleGroup {
  module: string;
  /** Top-level items in this module (no parentId) */
  items: NavItem[];
}

function buildChildrenMap(items: NavItem[]): Map<string, NavItem[]> {
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const list = map.get(item.parentId) ?? [];
    list.push(item);
    map.set(item.parentId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
  }
  return map;
}

export function useNavigation() {
  const { role } = useBusiness();

  const isVisible = useMemo(() => {
    return (item: NavItem) => !item.perm || can(role, item.perm);
  }, [role]);

  // Everything below depends only on the static registry + role, so it's
  // rebuilt at most once per role change — not on every render/keystroke.
  const index = useMemo(() => {
    const visibleItems = NAV_ITEMS.filter(isVisible);

    const byId = new Map<string, NavItem>();
    for (const item of visibleItems) byId.set(item.id, item);

    const byRoute = new Map<string, NavItem>();
    for (const item of visibleItems) {
      if (item.route) byRoute.set(item.route, item);
    }

    const childrenOf = buildChildrenMap(visibleItems);

    // Module order follows first-seen order in the registry so it stays
    // predictable without needing a manually maintained order list.
    const moduleOrder: string[] = [];
    for (const item of visibleItems) {
      if (!moduleOrder.includes(item.module)) moduleOrder.push(item.module);
    }

    const tree: NavModuleGroup[] = moduleOrder.map((module) => ({
      module,
      items: visibleItems
        .filter((item) => item.module === module && !item.parentId && item.showInSidebar !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));

    const getPath = (id: string): NavItem[] => {
      const path: NavItem[] = [];
      let current = byId.get(id);
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        path.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return path;
    };

    // Flat, navigable (has a route), permission-filtered list — this is what
    // Search operates over. Each entry carries its full breadcrumb path.
    const searchable: NavItemWithPath[] = visibleItems
      .filter((item) => !!item.route)
      .map((item) => ({ ...item, path: getPath(item.id) }));

    const quickActions = searchable.filter((item) => !!item.quickAction);

    return { byId, byRoute, childrenOf, tree, getPath, searchable, quickActions };
  }, [isVisible]);

  function search(query: string, limit = 50): Array<NavItemWithPath & { score: number }> {
    const q = query.trim();
    if (!q) return [];

    const results = index.searchable
      .map((item) => ({
        ...item,
        score: scoreItem(q, {
          title: item.title,
          aliases: item.aliases,
          keywords: item.keywords,
          module: item.module,
          description: item.description,
        }),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  return {
    tree: index.tree,
    childrenOf: index.childrenOf,
    byId: index.byId,
    byRoute: index.byRoute,
    getPath: index.getPath,
    quickActions: index.quickActions,
    searchable: index.searchable,
    search,
  };
}
