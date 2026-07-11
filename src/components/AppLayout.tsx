// AppLayout.tsx – Enterprise navigation: Sidebar + Search + Breadcrumbs all
// driven by the centralized registry in src/lib/navigation. No hardcoded
// menu arrays live here anymore — add a page to the registry and it shows
// up in the sidebar, the command search, and breadcrumbs automatically.
import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  Moon,
  Sun,
  Building2,
  Repeat,
  Search,
  ChevronDown,
  ChevronRight,
  Star,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useBusiness, setActiveBusinessId } from "@/hooks/useBusiness";
import { useTheme } from "@/hooks/useTheme";
import { canAccessErp, getLandingForRole } from "@/lib/roleRouting";
import { Button } from "@/components/ui/button";

import EnterpriseCommandMenu from "@/components/search/EnterpriseCommandMenu";
import PageBreadcrumbs from "@/components/navigation/PageBreadcrumbs";
import SidebarNavItem from "@/components/navigation/SidebarNavItem";
import OfflinePage from "@/components/pwa/OfflinePage";
import UpdateNotification from "@/components/pwa/UpdateNotification";
import rdProLogo from "/rdpro-logo.png";

import { useNavigation } from "@/lib/navigation/useNavigation";
import { useFavoritePages } from "@/lib/navigation/useFavoritePages";
import { useRecentPages } from "@/lib/navigation/useRecentPages";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { business, role, loading: bizLoading } = useBusiness();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { tree, childrenOf, byId } = useNavigation();
  const { favoriteIds } = useFavoritePages();
  const { recordVisit } = useRecentPages();

  // Collapsible sidebar state – default open the first module (e.g. "Dashboard")
  const [openSection, setOpenSection] = useState(tree[0]?.module ?? "");

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? "" : section));
  };

  // Track every route change against the registry so "Recent Pages" in
  // search stays in sync no matter how the user navigated (sidebar, search,
  // deep link, browser back/forward).
  useEffect(() => {
    const match = [...byId.values()].find((item) => item.route === location.pathname);
    if (match) recordVisit(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, byId]);

  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘K" : "Ctrl+K";

  const favoriteItems = favoriteIds.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => !!i && !!i.route);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (bizLoading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading workspace…</div>;
  if (!business) return <Navigate to="/companies" replace />;
  if (!business.setup_completed) return <Navigate to="/setup/business" replace />;
  // Role-based portal gate: send non-ERP roles (dealer, retailer, wholesaler…) to their portal.
  if (role && !canAccessErp(role)) {
    return <Navigate to={getLandingForRole(role)} replace />;
  }

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
      <div className="h-screen overflow-hidden flex w-full bg-background gradient-mesh">
        {/* Centralized Command Search — reads the same registry as the sidebar */}
        <EnterpriseCommandMenu />

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

            {/* Search trigger — opens the same Command Search everywhere (Ctrl+K) */}
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("rdpro:open-search"))}
                className="relative w-full pl-9 pr-14 py-2 rounded-lg border border-sidebar-border bg-sidebar-accent/10 text-sm text-left text-sidebar-foreground/50 hover:bg-sidebar-accent/20 hover:text-sidebar-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                Find...
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-sidebar-border bg-sidebar-background px-1.5 py-0.5 text-xs font-mono text-sidebar-foreground/60">
                  {shortcutKey}
                </kbd>
              </button>
            </div>
          </div>

          {/* ========== SCROLLABLE MENU AREA ========== */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1 scrollbar-thin">
            {/* Favorites — pinned pages, synced from the Command Search */}
            {favoriteItems.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-sidebar-foreground/80">
                  <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                  <span>Favorites</span>
                </div>
                <div className="space-y-1">
                  {favoriteItems.map((item) => (
                    <SidebarNavItem key={item.id} item={item} childrenOf={childrenOf} />
                  ))}
                </div>
              </div>
            )}

            {tree.map((group) => (
              <div key={group.module} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection(group.module)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/80 hover:text-sidebar-foreground"
                >
                  <span>{group.module}</span>
                  {openSection === group.module ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {openSection === group.module && (
                  <div className="mt-1 ml-2 space-y-1">
                    {group.items.map((item) => (
                      <SidebarNavItem key={item.id} item={item} childrenOf={childrenOf} />
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

        <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <PageBreadcrumbs />
          {children}
        </main>

        <UpdateNotification />
      </div>
    </OfflinePage>
  );
}
