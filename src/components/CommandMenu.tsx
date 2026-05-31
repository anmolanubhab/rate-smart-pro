// src/components/CommandMenu.tsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Calculator,
  ShoppingCart,
  PlusCircle,
  Clock,
  Truck,
  Users,
  Package,
  Warehouse,
  History,
  FileText,
  User,
  Settings,
  Star,
  Search,
} from "lucide-react";

// All existing routes preserved
const pages = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, category: "main" },
  { label: "RD Calculator", to: "/calculator", icon: Calculator, category: "tools" },
  { label: "Orders", to: "/orders", icon: ShoppingCart, category: "main" },
  { label: "Create Order", to: "/orders/new", icon: PlusCircle, category: "actions" },
  { label: "Pending Orders", to: "/pending", icon: Clock, category: "main" },
  { label: "Dispatch", to: "/dispatch", icon: Truck, category: "main" },
  { label: "Parties", to: "/parties", icon: Users, category: "main" },
  { label: "Products", to: "/products", icon: Package, category: "main" },
  { label: "Inventory", to: "/inventory", icon: Warehouse, category: "main" },
  { label: "History", to: "/history", icon: History, category: "main" },
  { label: "Reports", to: "/reports", icon: FileText, category: "main" },
  { label: "Profile", to: "/profile", icon: User, category: "settings" },
  { label: "Settings", to: "/settings", icon: Settings, category: "settings" },
];

// Quick actions with keyboard shortcuts
const quickActions = [
  { 
    label: "Create New Order", 
    action: () => "/orders/new", 
    icon: PlusCircle, 
    shortcut: "⌘N",
    description: "Start a new order" 
  },
  { 
    label: "View Dashboard", 
    action: () => "/dashboard", 
    icon: LayoutDashboard, 
    shortcut: "⌘D",
    description: "Go to dashboard" 
  },
  { 
    label: "Open Calculator", 
    action: () => "/calculator", 
    icon: Calculator, 
    shortcut: "⌘R",
    description: "RD Calculator" 
  },
  { 
    label: "Check Inventory", 
    action: () => "/inventory", 
    icon: Warehouse, 
    shortcut: "⌘I",
    description: "View stock levels" 
  },
];

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export default function CommandMenu({ open, onOpenChange, triggerRef }: CommandMenuProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  
  // Recent pages state with localStorage
  const [recentPages, setRecentPages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("recentPages");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("recentPages", JSON.stringify(recentPages));
  }, [recentPages]);

  // Calculate position when menu opens
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [open, triggerRef]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    window.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);
    
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, triggerRef]);

  // Add to recent pages
  const addToRecent = (to: string) => {
    setRecentPages((prev) => {
      const filtered = prev.filter((item) => item !== to);
      return [to, ...filtered].slice(0, 5);
    });
  };

  // Handle navigation
  const handleNavigate = (to: string) => {
    const page = pages.find((p) => p.to === to);
    if (page) {
      navigate(to);
      addToRecent(to);
      onOpenChange(false);
      setSearch("");
    }
  };

  // Handle quick actions
  const handleQuickAction = (action: () => string) => {
    const to = action();
    navigate(to);
    addToRecent(to);
    onOpenChange(false);
    setSearch("");
  };

  // Get recent page objects
  const recentPageObjects = recentPages
    .map((to) => pages.find((page) => page.to === to))
    .filter((page): page is typeof pages[0] => page !== undefined);

  // Filter pages based on search
  const filterPages = (pageList: typeof pages) => {
    if (!search) return pageList;
    return pageList.filter(page => 
      page.label.toLowerCase().includes(search.toLowerCase())
    );
  };

  // Filter pages by category
  const actionPages = filterPages(pages.filter(page => page.category === "actions"));
  const mainPages = filterPages(pages.filter(page => 
    page.category === "main" && !recentPages.includes(page.to)
  ));
  const toolsPages = filterPages(pages.filter(page => page.category === "tools"));
  const settingsPages = filterPages(pages.filter(page => page.category === "settings"));

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          onOpenChange(false);
          setSearch("");
        }}
      />
      
      {/* Dropdown Command Menu */}
      <div
        className="fixed z-50 animate-in fade-in zoom-in-95 duration-200"
        style={{
          top: position.top + 4,
          left: position.left,
          width: position.width,
          minWidth: "280px",
        }}
      >
        <Command
          className="rounded-lg border shadow-xl bg-popover text-popover-foreground overflow-hidden"
          shouldFilter={false}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search pages and actions..."
              value={search}
              onValueChange={setSearch}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty>No results found.</CommandEmpty>
            
            {/* Quick Actions Section - only show when no search */}
            {!search && (
              <>
                <CommandGroup heading="Quick Actions">
                  {quickActions.map((action) => (
                    <CommandItem
                      key={action.label}
                      onSelect={() => handleQuickAction(action.action)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <action.icon className="h-4 w-4" />
                        <div className="flex flex-col">
                          <span>{action.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {action.description}
                          </span>
                        </div>
                      </div>
                      {action.shortcut && (
                        <kbd className="ml-auto text-xs text-muted-foreground hidden sm:inline-flex items-center rounded border px-1.5 py-0.5 font-mono">
                          {action.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Recent Pages Section */}
            {!search && recentPageObjects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent Pages">
                  {recentPageObjects.map((page) => (
                    <CommandItem
                      key={page.to}
                      onSelect={() => handleNavigate(page.to)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Actions Section */}
            {actionPages.length > 0 && (
              <>
                {(search || (!search && actionPages.length > 0)) && (
                  <CommandSeparator />
                )}
                <CommandGroup heading="Actions">
                  {actionPages.map((page) => (
                    <CommandItem
                      key={page.to}
                      onSelect={() => handleNavigate(page.to)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <page.icon className="h-4 w-4" />
                      <span>{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Main Navigation */}
            {mainPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Main Navigation">
                  {mainPages.map((page) => (
                    <CommandItem
                      key={page.to}
                      onSelect={() => handleNavigate(page.to)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <page.icon className="h-4 w-4" />
                      <span>{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Tools */}
            {toolsPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Tools">
                  {toolsPages.map((page) => (
                    <CommandItem
                      key={page.to}
                      onSelect={() => handleNavigate(page.to)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <page.icon className="h-4 w-4" />
                      <span>{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Settings */}
            {settingsPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                  {settingsPages.map((page) => (
                    <CommandItem
                      key={page.to}
                      onSelect={() => handleNavigate(page.to)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <page.icon className="h-4 w-4" />
                      <span>{page.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </div>
    </>
  );
}
