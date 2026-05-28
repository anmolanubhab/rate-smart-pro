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
  Boxes,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import CommandMenu from "@/components/CommandMenu";

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
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
      },
      {
        to: "/calculator",
        label: "RD Calculator",
        icon: Calculator,
      },
    ],
  },

  {
    label: "Orders",
    items: [
      {
        to: "/orders",
        label: "Orders",
        icon: ShoppingCart,
      },
      {
        to: "/orders/new",
        label: "Create Order",
        icon: PlusSquare,
      },
      {
        to: "/pending",
        label: "Pending Orders",
        icon: Boxes,
      },
      {
        to: "/dispatch",
        label: "Dispatch",
        icon: Package,
      },
    ],
  },

  {
    label: "Catalog",
    items: [
      {
        to: "/parties",
        label: "Parties",
        icon: Users,
      },
      {
        to: "/products",
        label: "Products",
        icon: Package,
      },
      {
        to: "/inventory",
        label: "Inventory",
        icon: Boxes,
      },
    ],
  },

  {
    label: "Insights",
    items: [
      {
        to: "/history",
        label: "History",
        icon: History,
      },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
      },
    ],
  },

  {
    label: "Account",
    items: [
      {
        to: "/profile",
        label: "Profile",
        icon: User,
      },
      {
        to: "/settings",
        label: "Settings",
        icon: SettingsIcon,
      },
    ],
  },
];

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading, signOut } = useAuth();

  const { theme, toggle } = useTheme();

  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/auth"
        state={{ from: location }}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-background gradient-mesh">

      <CommandMenu />

      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>

            <div>
              <h1 className="font-bold text-white">
                RD Calculator
              </h1>

              <p className="text-xs text-sidebar-foreground/60">
                Pro · Spare Parts
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              {group.label && (
                <p className="px-3 py-2 text-[10px] uppercase text-sidebar-foreground/40">
                  {group.label}
                </p>
              )}

              {group.items.map(
                ({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                )
              )}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-full justify-start"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}

            <span className="ml-2">
              {theme === "dark"
                ? "Light mode"
                : "Dark mode"}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4" />

            <span className="ml-2">
              Sign out
            </span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
