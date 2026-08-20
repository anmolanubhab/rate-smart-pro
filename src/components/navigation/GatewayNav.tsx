// src/components/navigation/GatewayNav.tsx
//
// The Gateway Mode drill-down list — one compact screen at a time, Tally
// "Gateway of Tally" style. Renders inside SidebarContent's scrollable nav
// area (same slot Classic Tree's tree.map(...) occupies), so the company
// card and Favorites block above it are shared by both modes unchanged.
//
// Keyboard handling is scoped to this container's own onKeyDown (never
// `window`), so it can never swallow Escape meant for an unrelated open
// dialog elsewhere in the app.

import { useEffect, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { ChevronRight, ArrowLeft, LogOut, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GatewayEntry } from "@/lib/navigation/useGatewayNavigation";
import type { useGatewayNavigation } from "@/lib/navigation/useGatewayNavigation";
import type { NavItem } from "@/lib/navigation/types";

interface GatewayNavProps {
  gateway: ReturnType<typeof useGatewayNavigation>;
  collapsed?: boolean;
  onNavigate?: (item: NavItem) => void;
}

export default function GatewayNav({ gateway, collapsed = false, onNavigate }: GatewayNavProps) {
  const navigate = useNavigate();
  const { currentPath, currentEntries, isAtRoot, drillInto, goBack, goHome } = gateway;
  const containerRef = useRef<HTMLDivElement>(null);

  // Drilling in/back/home swaps the row buttons for a new level, so
  // whichever row the user just clicked/focused no longer exists in the DOM
  // — focus would otherwise fall back to <body> and Escape/Home would stop
  // reaching handleKeyDown. Re-focus the container itself on every path
  // change so keyboard driving keeps working across drills.
  useEffect(() => {
    containerRef.current?.focus();
  }, [currentPath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Backspace") {
      if (!isAtRoot) {
        e.preventDefault();
        goBack();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      goHome();
    }
  };

  const quit = () => {
    goHome();
    navigate("/dashboard");
  };

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className="space-y-1 outline-none">
      {!collapsed && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sidebar-foreground/60">
          {!isAtRoot && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-muted hover:text-foreground"
              title="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="truncate font-medium uppercase tracking-wide">
            {isAtRoot ? "Gateway" : currentPath.join(" / ")}
          </span>
        </div>
      )}

      <div className="space-y-0.5">
        {currentEntries.map((entry) => (
          <GatewayRow key={entry.kind === "group" ? entry.name : entry.item.id} entry={entry} collapsed={collapsed} drillInto={drillInto} onNavigate={onNavigate} />
        ))}
      </div>

      {isAtRoot && !collapsed && (
        <button
          type="button"
          onClick={quit}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-sidebar-foreground/50 transition-smooth hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="truncate">Quit</span>
        </button>
      )}
    </div>
  );
}

function GatewayRow({
  entry,
  collapsed,
  drillInto,
  onNavigate,
}: {
  entry: GatewayEntry;
  collapsed: boolean;
  drillInto: (name: string) => void;
  onNavigate?: (item: NavItem) => void;
}) {
  if (entry.kind === "group") {
    return (
      <button
        type="button"
        onClick={() => drillInto(entry.name)}
        title={collapsed ? entry.name : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-sidebar-foreground/80 transition-smooth hover:bg-muted hover:text-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        <Folder className="h-5 w-5 shrink-0" />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{entry.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
          </span>
        )}
      </button>
    );
  }

  const item = entry.item;

  if (item.disabled) {
    const Icon = item.icon;
    return (
      <div
        aria-disabled="true"
        tabIndex={-1}
        title={item.disabledReason ?? "Coming soon"}
        className={cn(
          "flex cursor-not-allowed select-none items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-sidebar-foreground/35",
          collapsed && "justify-center px-0",
        )}
      >
        {Icon && <Icon className="h-5 w-5 shrink-0" />}
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 rounded-full border border-sidebar-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/40">
              Soon
            </span>
          </span>
        )}
      </div>
    );
  }

  const Icon = item.icon;
  return (
    <NavLink
      to={item.route!}
      onClick={() => onNavigate?.(item)}
      title={collapsed ? item.title : undefined}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-smooth",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-soft"
            : "text-sidebar-foreground/70 hover:bg-muted hover:text-foreground",
        )
      }
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" />}
      {!collapsed && <span className="truncate">{item.title}</span>}
    </NavLink>
  );
}
