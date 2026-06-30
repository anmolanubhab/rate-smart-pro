// AppLayout.tsx – Collapsible Sidebar + Sticky Top (Phase 2)
import { ReactNode, useRef, useState, useEffect } from "react";
import { NavLink, useLocation, Navigate, useNavigate } from "react-router-dom";
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
  Building2,
  Repeat,
  ShoppingBag,
  TruckIcon,
  FileText,
  CreditCard,
  FilePlus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useBusiness, setActiveBusinessId } from "@/hooks/useBusiness";
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
      { to: "/reports", label: "Business Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/orders/new", label: "Create Order", icon: PlusSquare },
      { to: "/orders", label: "Orders", icon: ShoppingCart },
      { to: "/pending", label: "Pending Orders", icon: Boxes },
      { to: "/dispatch", label: "Dispatch", icon: Package },
      { to: "/sales/invoices", label: "Sales Invoices", icon: Receipt },
      { to: "/parties", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Purchase",
    items: [
      { to: "/purchase", label: "Purchase Dashboard", icon: ShoppingBag },
      { to: "/purchase/orders", label: "Purchase Orders", icon: ClipboardList },
      { to: "/purchase/grn", label: "Goods Receipt Note", icon: TruckIcon },
      { to: "/purchase/invoices", label: "Purchase Invoices", icon: FileText },
      { to: "/purchase/payments", label: "Supplier Payments", icon: CreditCard },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/products", label: "Products", icon: Package },
      { to: "/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    label: "Accounts",
    items: [
      { to: "/accounts/vouchers", label: "Voucher Center", icon: Receipt },
      { to: "/accounting/vouchers", label: "Vouchers", icon: FilePlus },
      { to: "/accounts/ledgers", label: "Ledger Accounts", icon: BookOpen },
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
    items: [{ to: "/gst/summary", label: "GST Summary", icon: FileSpreadsheet }],
  },
  {
    label: "Administration",
    items: [
      { to: "/approval-center", label: "Approval Center", icon: ShieldCheck },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ShieldCheck },
      { to: "/settings/voucher-numbering", label: "Voucher Numbering", icon: Receipt },
      { to: "/settings/sales-config", label: "Sales Configuration", icon: SettingsIcon },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/settings/business-profile", label: "Business Profile", icon: Landmark },
      { to: "/settings/company-users", label: "Company Users", icon: Users },
      { to: "/settings/team", label: "Team & Roles", icon: Users },
    ],
  },
  {
    label: "My Account",
    items: [
      { to: "/profile", label: "Profile", icon: User },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { business, role, loading: bizLoading } = useBusiness();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Collapsible sidebar state – default open "Overview"
  const [openSection, setOpenSection] = useState("Overview");

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? "" : section));
  };

  // Keyboard shortcuts
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

  useEffect(() => {
    if (commandMenuOpen) searchInputRef.current?.focus();
  }, [commandMenuOpen]);

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? "⌘K" : "Ctrl+K";

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (bizLoading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading workspace…</div>;
  if (!business) return <Navigate to="/companies" replace />;
  if (!business.setup_completed) return <Navigate to="/setup/business" replace />;

  const switchCompany = () => {
    setActiveBusinessId(null);
    navigate("/companies");
  };

  const fyStart = business.fy_start_month ?? 4;
  const now = new Date();
  const fyYear = (now.getMonth() + 1) >= fyStart ? now.getFullYear() : now.getFullYear() - 1;
  const fyLabel = `FY ${String(fyYear).slice(-2)}-${String(fyYear + 1).slice(-2)}`;

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

        <aside className="hidden md:flex w-64 flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          {/* ========== FIXED TOP AREA ========== */}
          <div className="border-b border-sidebar-border bg-sidebar">
            {/* Logo */}
            <div className="p-6">
              <div className="flex items-center gap-3 group cursor-default">
                <div className="h-10 w-10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                  <img src={rdProLogo} alt="RD Pro" className="h-10 w-10 object-contain" />
                </div>
                <div>
                  <h1 className="font-bold text-sidebar-foreground text-lg tracking-tight transition-colors duration-200 group-hover:text-primary">
                    RD Pro
                  </h1>
                  <div className="relative">
                    <p className="text-[11px] text-sidebar-foreground/50 leading-tight transition-all duration-300 group-hover:opacity-0 group-hover:translate-y-1">
                      BOS
                    </p>
                    <p className="text-[11px] text-primary/80 leading-tight absolute top-0 left-0 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 whitespace-nowrap">
                      Business Operating System
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Company Card */}
            <div className="px-4 pb-1">
              <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/20 p-3">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-sidebar-foreground/40">Company</p>
                    <p className="text-sm font-semibold text-sidebar-foreground truncate" title={business.business_name}>
                      {business.business_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-sidebar-foreground/60">
                      {business.business_type && <span className="truncate">{business.business_type}</span>}
                      <span>•</span>
                      <span>{fyLabel}</span>
                    </div>
                    <div className="text-[10px] text-primary/80 capitalize mt-0.5">Role: {role ?? "—"}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={switchCompany}
                  className="w-full mt-2 h-7 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                >
                  <Repeat className="h-3 w-3 mr-1.5" />Switch Company
                </Button>
              </div>
            </div>

            {/* Search Box */}
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
          </div>

          {/* ========== SCROLLABLE MENU AREA ========== */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {navGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection(group.label)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/80 hover:text-sidebar-foreground"
                >
                  <span>{group.label}</span>
                  {openSection === group.label ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {openSection === group.label && (
                  <div className="mt-1 ml-2 space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setCommandMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5"
                          )
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* ========== FIXED BOTTOM AREA ========== */}
          <div className="border-t border-sidebar-border p-4 space-y-2 bg-sidebar">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start text-sidebar-foreground/70 hover:text-red-400"
            >
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
