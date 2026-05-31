// AppLayout.tsx - Updated with search state management
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
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import CommandMenu from "@/components/CommandMenu";
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
  
  // Command menu state and refs
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Handle keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open command menu on Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandMenuOpen(true);
        setSearchValue("");
        // Focus will be handled by the CommandInput auto-focus
      }
      // Close on Escape
      if (e.key === "Escape" && commandMenuOpen) {
        setCommandMenuOpen(false);
        setSearchValue("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [commandMenuOpen]);

  // Auto-focus search input when command menu opens
  useEffect(() => {
    if (commandMenuOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [commandMenuOpen]);

  // Detect platform for correct keyboard shortcut display
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? "⌘K" : "Ctrl+K";

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
      {/* Command Menu Dropdown - Opens ABOVE the search box */}
      <CommandMenu 
        open={commandMenuOpen} 
        onOpenChange={setCommandMenuOpen}
        triggerRef={searchButtonRef}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
      />

      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        {/* Logo Section with Image and Hover Effect */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3 group cursor-default">
            {/* Logo Image */}
            <div className="h-10 w-10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <img
                src={rdProLogo}
                alt="RD Pro"
                className="h-10 w-10 object-contain"
              />
            </div>
            
            {/* Text Section with Hover Effect */}
            <div>
              <h1 className="font-bold text-white text-lg tracking-tight transition-colors duration-200 group-hover:text-primary">
                RD Pro
              </h1>
              
              {/* Hover Effect: Shows full name on hover, SPMS normally */}
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

        {/* 🔍 Vercel-Style Find Button - The ONLY search box */}
        <div className="px-4 py-3">
          <button
            ref={searchButtonRef}
            onClick={() => {
              setCommandMenuOpen(true);
              setSearchValue("");
            }}
            className={`
              w-full
              flex
              items-center
              justify-between
              rounded-lg
              border
              border-sidebar-border
              bg-sidebar-accent/10
              px-3
              py-2
              text-sm
              text-sidebar-foreground/70
              hover:bg-sidebar-accent/20
              hover:text-sidebar-foreground
              transition-all
              duration-200
              group
              ${commandMenuOpen ? 'bg-sidebar-accent/20 ring-2 ring-primary/50' : ''}
            `}
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              <span>Find...</span>
            </span>
            <kbd className="
              hidden
              sm:inline-flex
              items-center
              rounded
              border
              border-sidebar-border
              bg-sidebar-background
              px-1.5
              py-0.5
              text-xs
              font-mono
              text-sidebar-foreground/60
              group-hover:text-sidebar-foreground
              group-hover:border-sidebar-foreground/20
              transition-all
              duration-200
            ">
              {shortcutKey}
            </kbd>
          </button>
        </div>

        {/* Navigation */}
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
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5"
                    )
                  }
                >
                  <Icon className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    "group-hover:scale-110"
                  )} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all duration-200 hover:translate-x-0.5"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            ) : (
              <Moon className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
            )}
            <span className="ml-2">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-red-400 transition-all duration-200 hover:translate-x-0.5"
          >
            <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            <span className="ml-2">Sign out</span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
