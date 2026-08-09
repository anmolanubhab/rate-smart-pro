import { ReactNode, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, PlusCircle, ListOrdered, BarChart3,
  Wallet, UserCircle, LogOut, Menu, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSalesmanPortalProfile } from "@/hooks/useSalesmanPortalProfile";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const PRIMARY_NAV: NavItem[] = [
  { to: "/salesman/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/salesman/parties", label: "My Parties", icon: Users },
  { to: "/salesman/orders", label: "Orders", icon: ListOrdered },
  { to: "/salesman/sales", label: "Sales", icon: BarChart3 },
  { to: "/salesman/outstanding", label: "Outstanding", icon: Wallet },
  { to: "/salesman/profile", label: "Profile", icon: UserCircle },
];

const MOBILE_MORE_NAV: NavItem[] = [
  { to: "/salesman/orders", label: "Orders", icon: ListOrdered },
  { to: "/salesman/outstanding", label: "Outstanding", icon: Wallet },
  { to: "/salesman/profile", label: "Profile", icon: UserCircle },
];

export default function SalesmanLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { salesmanUser, signOut } = useSalesmanAuth();
  const { data: profile } = useSalesmanPortalProfile(salesmanUser?.salesman_id);
  const salesmanName = profile?.name;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-md gradient-primary flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">RD Pro · Salesman Portal</div>
              {salesmanName && <div className="text-xs text-muted-foreground truncate">{salesmanName}</div>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex max-w-6xl w-full mx-auto">
        {!isMobile && (
          <aside className="w-56 shrink-0 border-r bg-card px-3 py-4 hidden md:block">
            <nav className="space-y-1">
              {PRIMARY_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <Button className="w-full mt-4" onClick={() => navigate("/salesman/orders/new")}>
              <PlusCircle className="h-4 w-4 mr-1.5" /> New Order
            </Button>
          </aside>
        )}

        <main className={cn("flex-1 min-w-0 p-4 md:p-6", isMobile && "pb-24")}>
          {children ?? <Outlet />}
        </main>
      </div>

      {isMobile && (
        <>
          <nav className="fixed bottom-0 inset-x-0 z-30 border-t bg-card flex items-stretch h-16">
            <NavLink to="/salesman/dashboard" className={({ isActive }) => cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              <LayoutDashboard className="h-5 w-5" /> Dashboard
            </NavLink>
            <NavLink to="/salesman/parties" className={({ isActive }) => cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              <Users className="h-5 w-5" /> Parties
            </NavLink>
            <button
              onClick={() => navigate("/salesman/orders/new")}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] text-primary"
            >
              <span className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center -mt-6 shadow-lg">
                <PlusCircle className="h-6 w-6 text-white" />
              </span>
              New Order
            </button>
            <NavLink to="/salesman/sales" className={({ isActive }) => cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              <BarChart3 className="h-5 w-5" /> Sales
            </NavLink>
            <button
              onClick={() => setMoreOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
            >
              <Menu className="h-5 w-5" /> More
            </button>
          </nav>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 mt-4 pb-4">
                {MOBILE_MORE_NAV.map((item) => (
                  <button
                    key={item.to}
                    onClick={() => { setMoreOpen(false); navigate(item.to); }}
                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
