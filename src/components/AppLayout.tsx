// AppLayout.tsx — Premium ERP shell: TopNav + collapsible Sidebar + Content.
// Sidebar, Search and Breadcrumbs all read from the centralized registry in
// src/lib/navigation — add a page there and it shows up everywhere.
import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useBusiness, setActiveBusinessId } from "@/hooks/useBusiness";
import { canAccessErp, getLandingForRole } from "@/lib/roleRouting";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import TopNav from "@/components/navigation/TopNav";
import EnterpriseCommandMenu from "@/components/search/EnterpriseCommandMenu";
import PageBreadcrumbs from "@/components/navigation/PageBreadcrumbs";
import SidebarContent from "@/components/navigation/SidebarContent";
import OfflinePage from "@/components/pwa/OfflinePage";
import UpdateNotification from "@/components/pwa/UpdateNotification";

import { useNavigation } from "@/lib/navigation/useNavigation";
import { useFavoritePages } from "@/lib/navigation/useFavoritePages";
import { useRecentPages } from "@/lib/navigation/useRecentPages";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { business, role, loading: bizLoading } = useBusiness();
  const location = useLocation();
  const navigate = useNavigate();

  const { tree, childrenOf, byId } = useNavigation();
  const { favoriteIds } = useFavoritePages();
  const { recordVisit } = useRecentPages();

  const [openSection, setOpenSection] = useState(tree[0]?.module ?? "");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? "" : section));
  };

  // TopNav's hamburger button (mobile only) dispatches this to open the drawer.
  useEffect(() => {
    const onOpen = () => setMobileNavOpen(true);
    window.addEventListener("rdpro:open-mobile-nav", onOpen);
    return () => window.removeEventListener("rdpro:open-mobile-nav", onOpen);
  }, []);

  // Close the mobile drawer on every navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Track every route change against the registry so "Recent Pages" in
  // search stays in sync no matter how the user navigated.
  useEffect(() => {
    const match = [...byId.values()].find((item) => item.route === location.pathname);
    if (match) recordVisit(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, byId]);

  const favoriteItems = favoriteIds
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i && !!i.route);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (bizLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  if (!business) return <Navigate to="/companies" replace />;
  if (!business.setup_completed) return <Navigate to="/setup/business" replace />;
  // Role-based portal gate: send non-ERP roles (dealer, retailer, wholesaler…) to their portal.
  if (role && !canAccessErp(role)) {
    return <Navigate to={getLandingForRole(role)} replace />;
  }

  const fyStart = business.fy_start_month ?? 4;
  const now = new Date();
  const fyYear = now.getMonth() + 1 >= fyStart ? now.getFullYear() : now.getFullYear() - 1;
  const fyLabel = `FY ${String(fyYear).slice(-2)}-${String(fyYear + 1).slice(-2)}`;

  const switchCompany = () => {
    setActiveBusinessId(null);
    navigate("/companies");
  };

  return (
    <OfflinePage>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        {/* Centralized Command Search — reads the same registry as the sidebar */}
        <EnterpriseCommandMenu />

        {/* Top navigation bar */}
        <TopNav />

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          <aside
            className={`hidden md:flex flex-col h-full shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 ${
              collapsed ? "w-[84px]" : "w-[280px]"
            }`}
          >
            <SidebarContent
              collapsed={collapsed}
              tree={tree}
              childrenOf={childrenOf}
              favoriteItems={favoriteItems}
              openSection={openSection}
              onToggleSection={toggleSection}
              business={business}
              role={role}
              fyLabel={fyLabel}
              onSwitchCompany={switchCompany}
            />

            {/* Collapse toggle */}
            <div className="border-t border-sidebar-border p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapsed((v) => !v)}
                className={`w-full text-sidebar-foreground/70 hover:text-foreground ${
                  collapsed ? "justify-center px-0" : "justify-start"
                }`}
              >
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                {!collapsed && <span className="ml-2">Collapse</span>}
              </Button>
            </div>
          </aside>

          {/* Mobile drawer */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent side="left" className="flex w-[280px] flex-col p-0 bg-sidebar text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="flex h-full flex-col pt-4">
                <SidebarContent
                  tree={tree}
                  childrenOf={childrenOf}
                  favoriteItems={favoriteItems}
                  openSection={openSection}
                  onToggleSection={toggleSection}
                  onNavigate={() => setMobileNavOpen(false)}
                  business={business}
                  role={role}
                  fyLabel={fyLabel}
                  onSwitchCompany={switchCompany}
                />
              </div>
            </SheetContent>
          </Sheet>

          <main className="flex-1 h-full overflow-y-auto overflow-x-hidden p-4 md:p-8">
            <PageBreadcrumbs />
            {children}
          </main>
        </div>

        <UpdateNotification />
      </div>
    </OfflinePage>
  );
}
