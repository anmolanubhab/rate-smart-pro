// AppLayout.tsx - Find box as INPUT field for cursor focus
import { ReactNode, useRef, useState, useEffect } from "react";
import { NavLink, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calculator,
  History,
  User,
  LogOut,
  Moon,
  Sun,
  Users,
  ShoppingCart,
  PlusSquare,
  Package,
  Boxes,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  BookOpen,
  FileSpreadsheet,
  Receipt,
  Scale,
  Wallet,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";


import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import CommandMenu from "@/components/CommandMenu";
import OfflinePage from "@/components/pwa/OfflinePage";
import UpdateNotification from "@/components/pwa/UpdateNotification";
import rdProLogo from "/rdpro-logo.png";

type NavItem = {
  to: string;
  label: string;
  icon: any;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/calculator", label: "RD Calculator", icon: Calculator },
    ],
  },
  {
    label: "Orders",
    items: [
      { to: "/orders", label: "Orders", icon: ShoppingCart },
      { to: "/orders/new", label: "Create Order", icon: PlusSquare },
      { to: "/pending", label: "Pending Orders", icon: Boxes },
      { to: "/dispatch", label: "Dispatch", icon: Package },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/parties", label: "Parties", icon: Users },
      { to: "/products", label: "Products", icon: Package },
      { to: "/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/history", label: "History", icon: History },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Accounts",
    items: [
      { to: "/accounts/ledgers", label: "Ledger Accounts", icon: BookOpen },
      { to: "/accounts/vouchers", label: "Voucher Center", icon: Receipt },
      { to: "/accounts/day-book", label: "Day Book", icon: ClipboardList },
      { to: "/accounts/cash-book", label: "Cash Book", icon: Wallet },
      { to: "/accounts/bank-book", label: "Bank Book", icon: Landmark },
      { to: "/accounts/trial-balance", label: "Trial Balance", icon: Scale },
      { to: "/accounts/profit-loss", label: "Profit & Loss", icon: PieChart },
      { to: "/accounts/balance-sheet", label: "Balance Sheet", icon: FileSpreadsheet },
      { to: "/accounts/receivables", label: "Receivables", icon: ArrowUpRight },
      { to: "/accounts/payables", label: "Payables", icon: ArrowDownRight },
    ],
  },
  {
    label: "GST",
    items: [
      { to: "/gst/summary", label: "GST Summary", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ShieldCheck },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/profile", label: "Profile", icon: User },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { business, loading: bizLoading } = useBusiness();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Handle keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setCommandMenuOpen(true);
      }
      if (e.key === "Escape" && commandMenuOpen) {
        setCommandMenuOpen(false);
        setSearchValue("");
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [commandMenuOpen]);

  // Auto focus when command menu opens
  useEffect(() => {
    if (commandMenuOpen) {
      searchInputRef.current?.focus();
    }
  }, [commandMenuOpen]);

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? "⌘K" : "Ctrl+K";

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Business setup gate
  if (bizLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading workspace…</div>;
  }
  if ((!business || !business.setup_completed) && location.pathname !== "/setup/business") {
    return <Navigate to="/setup/business" replace />;
  }

  return (
    <OfflinePage>
      <div className="min-h-screen flex w-full bg-background gradient-mesh">
        <CommandMenu 
          open={commandMenuOpen} 
          onOpenChange={setCommandMenuOpen}
          triggerRef={searchInputRef}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />

        <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <div className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3 group cursor-default">
              <div className="h-10 w-10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <img src={rdProLogo} alt="RD Pro" className="h-10 w-10 object-contain" />
              </div>
              <div>
                <h1 className="font-bold text-white text-lg tracking-tight transition-colors duration-200 group-hover:text-primary">
                  RD Pro
                </h1>
                <div className="relative">
                  <p className="text-[11px] text-sidebar-foreground/50 leading-tight transition-all duration-300 group-hover:opacity-0 group-hover:translate-y-1">
                    SPMS
                  </p>
                  <p className="text-[11px] text-primary/80 leading-tight absolute top-0 left-0 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 whitespace-nowrap">
                    Sale Purchase<br />Management System
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 🔍 Find Box - Now an INPUT field with cursor */}
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/50" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Find..."
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  setCommandMenuOpen(true);
                }}
                onFocus={() => setCommandMenuOpen(true)}
                className={`
                  w-full
                  pl-9 pr-12
                  py-2
                  rounded-lg
                  border
                  border-sidebar-border
                  bg-sidebar-accent/10
                  text-sm
                  text-sidebar-foreground
                  placeholder:text-sidebar-foreground/50
                  focus:outline-none
                  focus:ring-2
                  focus:ring-primary/50
                  focus:border-transparent
                  transition-all
                  duration-200
                  ${commandMenuOpen ? 'bg-sidebar-accent/20 ring-2 ring-primary/50' : ''}
                `}
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-sidebar-border bg-sidebar-background px-1.5 py-0.5 text-xs font-mono text-sidebar-foreground/60">
                {shortcutKey}
              </kbd>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
            {navGroups.map((group) => (
              <div key={group.label}>
                {group.label && (
                  <p className="px-3 py-2 text-[10px] uppercase text-sidebar-foreground/40 tracking-wider">
                    {group.label}
                  </p>
                )}
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setCommandMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5"
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-sidebar-border space-y-2">
            <Button variant="ghost" size="sm" onClick={toggle} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/70 hover:text-red-400">
              <LogOut className="h-4 w-4" />
              <span className="ml-2">Sign out</span>
            </Button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>

        <UpdateNotification />
      </div>
    </OfflinePage>
  );
}
