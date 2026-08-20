// src/lib/navigation/useGatewayNavigation.ts
//
// Builds the Gateway Mode drill-down tree from each NavItem's `gatewayPath`
// — a parallel, additive categorization to the `module`/`parentId` pair
// Classic Tree (useNavigation.ts) uses. Same registry, same permission
// filter, different shape: instead of an always-expanded nested tree, this
// exposes one level at a time plus drill/back/home actions, matching the
// Tally "Gateway of Tally" navigation the user asked for.
//
// A leaf item's `gatewayPath` names the chain of GROUP labels above it —
// not its own title. `[]` means "a leaf directly at the Gateway root" (e.g.
// Dashboard); `["Masters","Inventory"]` means "drill Masters -> Inventory,
// then this item appears in that list". Groups are synthesized from these
// paths, never declared as separate NavItems, so there is exactly one
// source of truth (the same registry Classic Tree and Search read).

import { useMemo, useState } from "react";
import { NAV_ITEMS } from "./registry";
import type { NavItem } from "./types";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular, isOwner, canAccessMaintenance } from "@/lib/permissions";

// Fixed root sequence, per the user's spec — anything not listed here
// (shouldn't normally happen) falls back to first-seen order, appended
// after the known ones, so a new top-level group never silently disappears.
const GATEWAY_ROOT_ORDER = [
  "Dashboard",
  "Masters",
  "Transactions",
  "Orders",
  "GST",
  "Reports",
  "Utilities",
  "Administration",
  "Configuration",
  "Help & Support",
];

export type GatewayEntry =
  | { kind: "group"; name: string }
  | { kind: "leaf"; item: NavItem };

function isPrefix(prefix: string[], full: string[]): boolean {
  if (prefix.length > full.length) return false;
  return prefix.every((seg, i) => full[i] === seg);
}

export function useGatewayNavigation() {
  const { role, permissions } = useBusiness();
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  const isVisible = useMemo(() => {
    return (item: NavItem) => {
      if (!item.perm) return true;
      if (item.perm === "owner") return isOwner(role);
      if (item.perm === "maintenance") return canAccessMaintenance(role);
      return canGranular(role, item.perm, permissions);
    };
  }, [role, permissions]);

  const gatewayItems = useMemo(
    () => NAV_ITEMS.filter((item) => !!item.gatewayPath && (item.route || item.disabled) && isVisible(item)),
    [isVisible],
  );

  const entriesAt = useMemo(() => {
    return (path: string[]): GatewayEntry[] => {
      const groupNames: string[] = [];
      const seenGroups = new Set<string>();
      const leaves: NavItem[] = [];

      for (const item of gatewayItems) {
        const gp = item.gatewayPath!;
        if (!isPrefix(path, gp)) continue;
        if (gp.length === path.length) {
          leaves.push(item);
        } else {
          const next = gp[path.length];
          if (!seenGroups.has(next)) {
            seenGroups.add(next);
            groupNames.push(next);
          }
        }
      }

      const orderedGroups = path.length === 0
        ? [
            ...GATEWAY_ROOT_ORDER.filter((g) => groupNames.includes(g)),
            ...groupNames.filter((g) => !GATEWAY_ROOT_ORDER.includes(g)),
          ]
        : groupNames;

      const entries: GatewayEntry[] = [
        ...orderedGroups.map((name): GatewayEntry => ({ kind: "group", name })),
        ...leaves.map((item): GatewayEntry => ({ kind: "leaf", item })),
      ];

      // At root, Dashboard (an empty-path leaf) belongs before the groups,
      // matching the user's spec order (Dashboard -> Masters -> ...).
      if (path.length === 0) {
        entries.sort((a, b) => {
          const nameA = a.kind === "group" ? a.name : a.item.title;
          const nameB = b.kind === "group" ? b.name : b.item.title;
          const orderA = GATEWAY_ROOT_ORDER.indexOf(nameA);
          const orderB = GATEWAY_ROOT_ORDER.indexOf(nameB);
          return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
        });
      }

      return entries;
    };
  }, [gatewayItems]);

  const currentEntries = useMemo(() => entriesAt(currentPath), [entriesAt, currentPath]);

  return {
    currentPath,
    currentEntries,
    isAtRoot: currentPath.length === 0,
    drillInto: (name: string) => setCurrentPath((p) => [...p, name]),
    goBack: () => setCurrentPath((p) => p.slice(0, -1)),
    goHome: () => setCurrentPath([]),
  };
}
