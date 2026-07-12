// src/components/navigation/SidebarContent.tsx
//
// The actual sidebar content (company card + nav tree + favorites). Shared
// between the desktop <aside> in AppLayout and the mobile Sheet drawer, so
// there's exactly one implementation to keep in sync with the registry.

import { Building2, ChevronDown, ChevronRight, Repeat, Star } from "lucide-react";
import type { NavItem } from "@/lib/navigation/types";
import type { NavModuleGroup } from "@/lib/navigation/useNavigation";
import SidebarNavItem from "@/components/navigation/SidebarNavItem";

interface SidebarContentProps {
  collapsed?: boolean;
  tree: NavModuleGroup[];
  childrenOf: Map<string, NavItem[]>;
  favoriteItems: NavItem[];
  openSection: string;
  onToggleSection: (section: string) => void;
  onNavigate?: (item: NavItem) => void;
  business: { business_name: string; business_type?: string | null };
  role?: string | null;
  fyLabel: string;
  onSwitchCompany: () => void;
}

export default function SidebarContent({
  collapsed = false,
  tree,
  childrenOf,
  favoriteItems,
  openSection,
  onToggleSection,
  onNavigate,
  business,
  role,
  fyLabel,
  onSwitchCompany,
}: SidebarContentProps) {
  return (
    <>
      {/* ========== FIXED TOP AREA ========== */}
      <div className="border-b border-sidebar-border bg-sidebar p-3">
        {/* Company Card — light indigo gradient */}
        <div
          className={`relative rounded-2xl bg-gradient-to-br from-primary-light to-primary/5 border border-primary/10 ${
            collapsed ? "p-2" : "p-4"
          }`}
        >
          {!collapsed && (
            <button
              type="button"
              title="Switch company"
              className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-primary/70 transition-smooth hover:bg-primary/10 hover:text-primary"
              onClick={onSwitchCompany}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          )}
          <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground" title={business.business_name}>
                  {business.business_name}
                </p>
                {business.business_type && (
                  <p className="truncate text-[11px] text-muted-foreground">{business.business_type}</p>
                )}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {fyLabel}
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary">
                {role ?? "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ========== SCROLLABLE MENU AREA ========== */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1 scrollbar-thin">
        {/* Favorites — pinned pages, synced from the Command Search */}
        {favoriteItems.length > 0 && (
          <div className="mb-3">
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-sidebar-foreground/80">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                <span>Favorites</span>
              </div>
            )}
            <div className="space-y-0.5">
              {favoriteItems.map((item) => (
                <SidebarNavItem
                  key={item.id}
                  item={item}
                  childrenOf={childrenOf}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        )}

        {collapsed
          ? tree.map((group) => (
              <div key={group.module} className="mb-3 space-y-0.5 border-b border-sidebar-border/60 pb-3 last:border-0">
                {group.items.map((item) => (
                  <SidebarNavItem key={item.id} item={item} childrenOf={childrenOf} collapsed onNavigate={onNavigate} />
                ))}
              </div>
            ))
          : tree.map((group) => (
              <div key={group.module} className="mb-1">
                <button
                  type="button"
                  onClick={() => onToggleSection(group.module)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-sidebar-foreground/80 transition-smooth hover:bg-muted hover:text-foreground"
                >
                  <span>{group.module}</span>
                  {openSection === group.module ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    openSection === group.module ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="ml-2 space-y-0.5">
                      {group.items.map((item) => (
                        <SidebarNavItem key={item.id} item={item} childrenOf={childrenOf} onNavigate={onNavigate} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
      </nav>
    </>
  );
}
