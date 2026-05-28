import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  Search,
  ArrowRight,
  LayoutDashboard,
  Calculator,
  ShoppingCart,
 PlusSquare,
  Boxes,
  Package,
  Users,
  BarChart3,
  History,
  User,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const flatNav = [
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
  {
    to: "/profile",
    label: "Profile",
    icon: User,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

export default function CommandMenu() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);

    return () => {
      document.removeEventListener("keydown", down);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSelect = (to: string) => {
    navigate(to);

    setOpen(false);
    setSearch("");
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 transition-all",
        open ? "visible opacity-100" : "invisible opacity-0"
      )}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <Command className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="h-4 w-4 text-muted-foreground" />

            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages..."
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No pages found.
            </Command.Empty>

            <Command.Group heading="Pages">
              {flatNav.map(({ to, label, icon: Icon }) => (
                <Command.Item
                  key={to}
                  value={label}
                  onSelect={() => handleSelect(to)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm cursor-pointer hover:bg-muted transition"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />

                  <span className="flex-1">{label}</span>

                  <ArrowRight className="h-4 w-4 opacity-40" />
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
