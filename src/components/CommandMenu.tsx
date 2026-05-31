import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
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

export default function CommandMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  
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

  // Add to recent pages
  const addToRecent = (to: string) => {
    setRecentPages((prev) => {
      const filtered = prev.filter((item) => item !== to);
      return [to, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  // Handle navigation
  const handleNavigate = (to: string) => {
    const page = pages.find((p) => p.to === to);
    if (page) {
      navigate(to);
      addToRecent(to);
      setOpen(false);
    }
  };

  // Handle quick actions
  const handleQuickAction = (action: () => string) => {
    const to = action();
    navigate(to);
    addToRecent(to);
    setOpen(false);
  };

  // Keyboard shortcut to open command menu
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Get recent page objects
  const recentPageObjects = recentPages
    .map((to) => pages.find((page) => page.to === to))
    .filter((page): page is typeof pages[0] => page !== undefined);

  // Filter pages by category (excluding recent pages from main)
  const actionPages = pages.filter(
    (page) => page.category === "actions"
  );
  
  const mainPages = pages.filter(
    (page) => 
      page.category === "main" && 
      !recentPages.includes(page.to)
  );

  const toolsPages = pages.filter((page) => page.category === "tools");
  const settingsPages = pages.filter((page) => page.category === "settings");

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Quick Actions Section */}
        <CommandGroup heading="Quick Actions">
          {quickActions.map((action) => (
            <CommandItem
              key={action.label}
              onSelect={() => handleQuickAction(action.action)}
              className="flex items-center justify-between"
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
                <kbd className="ml-auto text-xs text-muted-foreground">
                  {action.shortcut}
                </kbd>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Recent Pages Section */}
        {recentPageObjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Pages">
              {recentPageObjects.map((page) => (
                <CommandItem
                  key={page.to}
                  onSelect={() => handleNavigate(page.to)}
                  className="flex items-center gap-2"
                >
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Actions Section - Create Order will appear here */}
        {actionPages.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actionPages.map((page) => (
                <CommandItem
                  key={page.to}
                  onSelect={() => handleNavigate(page.to)}
                  className="flex items-center gap-2"
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
                  className="flex items-center gap-2"
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
                  className="flex items-center gap-2"
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
                  className="flex items-center gap-2"
                >
                  <page.icon className="h-4 w-4" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
