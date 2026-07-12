// src/components/navigation/SidebarNavItem.tsx
//
// Renders one NavItem in the sidebar. If it has a route, it's a clickable
// NavLink. If it doesn't (a pure group header, e.g. "Vouchers" inside
// "Accounts"), it renders a label and recurses into its children — so the
// sidebar supports arbitrarily deep nesting with the same component.
//
// When `collapsed` is true (icon-rail mode), group header labels are
// skipped and every item renders as a centered icon with a native tooltip.

import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation/types";

interface SidebarNavItemProps {
  item: NavItem;
  childrenOf: Map<string, NavItem[]>;
  depth?: number;
  collapsed?: boolean;
  onNavigate?: (item: NavItem) => void;
}

export default function SidebarNavItem({
  item,
  childrenOf,
  depth = 0,
  collapsed = false,
  onNavigate,
}: SidebarNavItemProps) {
  const children = childrenOf.get(item.id) ?? [];

  if (item.route) {
    const Icon = item.icon;
    return (
      <NavLink
        to={item.route}
        onClick={() => onNavigate?.(item)}
        title={collapsed ? item.title : undefined}
        className={({ isActive }) =>
          cn(
            "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-smooth",
            collapsed && "justify-center px-0",
            depth > 0 && !collapsed && "py-2 text-[13px]",
            isActive
              ? "bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-soft before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:rounded-full before:bg-primary-foreground/90"
              : "text-sidebar-foreground/70 hover:bg-muted hover:text-foreground",
          )
        }
      >
        {Icon && <Icon className={cn("h-5 w-5 shrink-0", depth > 0 && !collapsed && "h-4 w-4")} />}
        {!collapsed && <span className="truncate">{item.title}</span>}
      </NavLink>
    );
  }

  // Pure group header — label + nested children, indented one level.
  // In collapsed (icon-rail) mode there's no room for the label, so its
  // children render directly as a flat icon list instead.
  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {children.map((child) => (
          <SidebarNavItem
            key={child.id}
            item={child}
            childrenOf={childrenOf}
            depth={depth + 1}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
        {item.title}
      </div>
      <div className="ml-2 space-y-0.5 border-l border-sidebar-border/60 pl-2">
        {children.map((child) => (
          <SidebarNavItem key={child.id} item={child} childrenOf={childrenOf} depth={depth + 1} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
