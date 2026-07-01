// MOCK DATA - to be wired to Supabase in Phase X
// Minimal external-facing layout for dealers (separate from internal AppLayout).
import { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Tag, Wallet, BookOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dealer/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dealer/order", label: "Place Order", icon: ShoppingCart },
  { to: "/dealer/pricing", label: "My Pricing", icon: Tag },
  { to: "/dealer/outstanding", label: "Outstanding", icon: Wallet },
  { to: "/dealer/ledger", label: "Ledger", icon: BookOpen },
];

export default function DealerLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md gradient-primary" />
            <div>
              <div className="font-semibold leading-tight">RD Pro · Dealer Portal</div>
              <div className="text-xs text-muted-foreground">Kumar Enterprises · DLR-00142</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dealer/login")}><LogOut className="h-4 w-4 mr-2" />Sign out</Button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => cn(
              "flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px",
              isActive ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
              <i.icon className="h-4 w-4" />{i.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-6">{children ?? <Outlet />}</main>
    </div>
  );
}
