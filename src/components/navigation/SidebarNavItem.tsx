// src/components/navigation/SidebarNavItem.tsx
//
// Renders one NavItem in the sidebar. If it has a route, it's a clickable
// NavLink. If it doesn't (a pure group header, e.g. "Vouchers" inside
// "Accounts"), it renders a label and recurses into its children — so the
// sidebar supports arbitrarily deep nesting with the same component.

import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation/types";

interface SidebarNavItemProps {
  item: NavItem;
  childrenOf: Map<string, NavItem[]>;
  depth?: number;
  onNavigate?: (item: NavItem) => void;
}

export default function SidebarNavItem({ item, childrenOf, depth = 0, onNavigate }: SidebarNavItemProps) {
  const children = childrenOf.get(item.id) ?? [];

  if (item.route) {
    const Icon = item.icon;
    return (
      <NavLink
        to={item.route}
        onClick={() => onNavigate?.(item)}
        className={({ isActive }) =>
          cn(
            "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            depth > 0 && "py-1.5 text-[13px]",
            isActive
              ? "bg-sidebar-accent text-sidebar-primary shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-0.5 before:rounded-full before:bg-primary before:shadow-glow"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5",
          )
        }
      >
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", depth > 0 && "h-3.5 w-3.5")} />}
        <span className="truncate">{item.title}</span>
      </NavLink>
    );
  }

  // Pure group header — label + nested children, indented one level.
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
