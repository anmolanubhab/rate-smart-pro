import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Search, Clock, ArrowRight } from "lucide-react";
const flatNav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/calculator", label: "RD Calculator" },
  { to: "/orders", label: "Orders" },
  { to: "/orders/new", label: "Create Order" },
  { to: "/pending", label: "Pending Orders" },
  { to: "/dispatch", label: "Dispatch" },
  { to: "/parties", label: "Parties" },
  { to: "/products", label: "Products" },
  { to: "/inventory", label: "Inventory" },
  { to: "/history", label: "History" },
  { to: "/reports", label: "Reports" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
];
import { cn } from "@/lib/utils";

interface CommandMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export default function CommandMenu({ open, setOpen }: CommandMenuProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [recentPages, setRecentPages] = useState<{ to: string; label: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recently visited items from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("rd_recent_pages");
    if (saved) {
      try {
        setRecentPages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse recent pages", e);
      }
    }
  }, [open]);

  // Global Ctrl+K / Cmd+K shortcut toggle ke liye
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  // Agar dropdown ke bahar click ho to use close karne ke liye
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  const handleSelect = (to: string, label: string) => {
    setOpen(false);
    setSearch("");
    
    const updatedRecents = [
      { to, label },
      ...recentPages.filter((item) => item.to !== to),
    ].slice(0, 3);
    
    setRecentPages(updatedRecents);
    localStorage.setItem("rd_recent_pages", JSON.stringify(updatedRecents));
    
    navigate(to);
  };

  // CRITICAL FIX: Jab open na ho, tab hum null return nahi karenge balki layout hidden rakhenge
  // Taaki state events parent element se attach reh sakein.
  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute left-3 right-3 top-[105px] z-50 overflow-hidden rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl transition-all duration-200 origin-top",
        open 
          ? "opacity-100 scale-100 pointer-events-auto visible" 
          : "opacity-0 scale-95 pointer-events-none invisible"
      )}
    >
      <Command label="Global Navigation" className="flex flex-col h-full">
        {/* Dropdown ke andar ka Search Input bar */}
        <div className="flex items-center gap-3 px-3 border-b border-border bg-transparent">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type page name..."
            className="flex h-10 w-full bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
          />
          <kbd className="hidden sm:inline-flex h-4 select-none items-center rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[240px] overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
          <Command.Empty className="py-4 text-center text-xs text-muted-foreground">
            No pages found.
          </Command.Empty>

          {/* Recent Activity Items */}
          {recentPages.length > 0 && !search && (
            <Command.Group
              heading={
                <span className="flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">
                  Recent
                </span>
              }
            >
              {recentPages.map((page) => (
                <Command.Item
                  key={`recent-${page.to}`}
                  value={page.label}
                  onSelect={() => handleSelect(page.to, page.label)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-foreground/80 cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground transition-colors"
                >
                  <span>{page.label}</span>
                  <ArrowRight className="h-3 w-3 opacity-40" />
                </Command.Item>
              ))}
              <div className="h-px bg-border my-1" />
            </Command.Group>
          )}

          {/* All Available Dashboard Pages */}
          <Command.Group
            heading={
              <span className="px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold">
                Pages
              </span>
            }
          >
            {flatNav.map(({ to, label, icon: Icon }) => (
              <Command.Item
                key={to}
                value={label}
                onSelect={() => handleSelect(to, label)}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-foreground/80 cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground transition-colors"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
