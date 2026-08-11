import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ShieldCheck, LogOut, LayoutDashboard, Users, KeyRound, Building2, CheckSquare, ListChecks, SlidersHorizontal, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; perm?: string };

const NAV: NavItem[] = [
  { to: "/platform", label: "Dashboard", icon: LayoutDashboard },
  { to: "/platform/businesses", label: "Businesses", icon: Briefcase, perm: "business.view" },
  { to: "/platform/approvals", label: "Approvals", icon: CheckSquare, perm: "approval.approve" },
  { to: "/platform/my-requests", label: "My Requests", icon: ListChecks },
  { to: "/platform/approval-rules", label: "Approval Rules", icon: SlidersHorizontal, perm: "approval_rule.manage" },
  { to: "/platform/staff", label: "Staff", icon: Users, perm: "staff.manage" },
  { to: "/platform/roles", label: "Roles & Permissions", icon: KeyRound, perm: "role.manage" },
  { to: "/platform/organization", label: "Organization", icon: Building2 },
];

export default function PlatformLayout({ children }: { children?: ReactNode }) {
  const { platformStaff, roles, hasPermission, signOut } = usePlatformAuth();
  const visibleNav = NAV.filter((item) => !item.perm || hasPermission(item.perm));

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-md gradient-primary flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">RD-Pro Control Center</div>
              {platformStaff?.full_name && (
                <div className="text-xs text-muted-foreground truncate">
                  {platformStaff.full_name}
                  {roles.length > 0 && ` · ${roles.map((r) => r.name).join(", ")}`}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex items-center gap-1 overflow-x-auto">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/platform"}
              className={({ isActive }) => cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap",
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-w-0 max-w-6xl w-full mx-auto p-4 md:p-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
