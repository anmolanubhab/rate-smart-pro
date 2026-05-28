import { ReactNode } from "react";
import { NavLink, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calculator,
  History,
  User,
  LogOut,
  Moon,
  Sun,
  Sparkles,
  Users,
  ShoppingCart,
  PlusSquare,
  Package,
  FileSpreadsheet,
  Boxes,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: any };
type NavGroup = { label?: string; items: NavItem[] };

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
    label: "Account",
    items: [
      { to: "/profile", label: "Profile", icon: User },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const flatNav = navGroups.flatMap((g) => g.items);
// Mobile bottom nav (5 most-used)
const mobileNav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/orders/new", label: "Order", icon: PlusSquare },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/calculator", label: "RD", icon: Calculator },
  { to: "/parties", label: "Parties", icon: Users },
];

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, loading, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  return (
    <div className="min-h-screen flex w-full bg-background gradient-mesh">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base text-white leading-tight">RD Calculator</h1>
              <p className="text-xs text-sidebar-foreground/60">Pro · Spare Parts</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {group.label && (
                <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">
                  {group.label}
                </p>
              )}
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/orders"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-smooth",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary shadow-soft"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
          <Button variant="ghost" size="sm" onClick={toggle} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            <span className="ml-2">Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="no-print md:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-display font-bold">RD Calculator</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border z-40">
          <div className="grid grid-cols-5">
            {mobileNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/orders"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-3 text-xs transition-smooth",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
};

// Re-export for convenience
export { flatNav };
