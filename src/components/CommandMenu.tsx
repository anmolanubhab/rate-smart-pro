// CommandMenu.tsx - Final Fixed Version (Syntax OK)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calculator,
  ShoppingCart,
  PlusSquare,
  Boxes,
  Package,
  Users,
  History,
  BarChart3,
  User,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement>;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export default function CommandMenu({ 
  open, 
  onOpenChange, 
  triggerRef, 
  searchValue, 
  onSearchChange 
}: CommandMenuProps) {
  const navigate = useNavigate();
  const [position, setPosition] = useState({ bottom: 0, left: 0, width: 0 });

  // Calculate position to open ABOVE the Find button
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        bottom: window.innerHeight - rect.top + window.scrollY + 8,
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
          bottom: window.innerHeight - rect.top + window.scrollY + 8,
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

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
    onSearchChange("");
  };

  const quickActions = [
    {
      label: "Create New Order",
      path: "/orders/new",
      icon: PlusSquare,
      shortcut: "⌘N",
    },
    {
      label: "View Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
      shortcut: "⌘D",
    },
    {
      label: "Open Calculator",
      path: "/calculator",
      icon: Calculator,
      shortcut: "⌘R",
    },
    {
      label: "Check Inventory",
      path: "/inventory",
      icon: Boxes,
      shortcut: "⌘I",
    },
  ];

  const navigationItems = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, group: "Main Navigation" },
    { label: "RD Calculator", path: "/calculator", icon: Calculator, group: "Main Navigation" },
    { label: "Orders", path: "/orders", icon: ShoppingCart, group: "Orders" },
    { label: "Create Order", path: "/orders/new", icon: PlusSquare, group: "Orders" },
    { label: "Pending Orders", path: "/pending", icon: Boxes, group: "Orders" },
    { label: "Dispatch", path: "/dispatch", icon: Package, group: "Orders" },
    { label: "Parties", path: "/parties", icon: Users, group: "Catalog" },
    { label: "Products", path: "/products", icon: Package, group: "Catalog" },
    { label: "Inventory", path: "/inventory", icon: Boxes, group: "Catalog" },
    { label: "History", path: "/history", icon: History, group: "Insights" },
    { label: "Reports", path: "/reports", icon: BarChart3, group: "Insights" },
    { label: "Profile", path: "/profile", icon: User, group: "Account" },
    { label: "Settings", path: "/settings", icon: SettingsIcon, group: "Account" },
  ];

  // Filter navigation items based on search
  const getFilteredItems = () => {
    if (!searchValue) return [];
    
    return navigationItems.filter(item =>
      item.label.toLowerCase().includes(searchValue.toLowerCase()) ||
      item.group.toLowerCase().includes(searchValue.toLowerCase())
    );
  };

  // Group filtered items by category
  const getGroupedFilteredItems = () => {
    const filtered = getFilteredItems();
    const grouped: Record<string, typeof navigationItems> = {};
    
    filtered.forEach(item => {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    });
    
    return grouped;
  };

  if (!open) return null;

  const filteredItems = getGroupedFilteredItems();
  const hasResults = Object.keys(filteredItems).length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={() => {
          onOpenChange(false);
          onSearchChange("");
        }}
      />
      
      {/* Popup - Positioned ABOVE the Find button */}
      <div
        className="fixed z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={{
          bottom: position.bottom,
          left: position.left,
          width: position.width,
        }}
      >
        <div
          className="rounded-lg shadow-xl overflow-hidden"
          style={{
            backgroundColor: "hsl(var(--sidebar))",
            border: "1px solid hsl(var(--sidebar-border))",
          }}
        >
          {/* Results */}
          <div 
            className="max-h-[400px] overflow-y-auto"
            style={{ 
              backgroundColor: "hsl(var(--sidebar))",
            }}
          >
            {/* Show quick actions only when no search */}
            {!searchValue && (
              <>
                <div style={{ padding: "8px 12px" }}>
                  <div 
                    className="text-xs font-semibold mb-2 px-2"
                    style={{ 
                      color: "hsl(var(--sidebar-foreground) / 0.5)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    QUICK ACTIONS
                  </div>
                  {quickActions.map((action) => (
                    <div
                      key={action.label}
                      onClick={() => handleSelect(action.path)}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-150"
                      style={{ color: "hsl(var(--sidebar-foreground))" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "hsl(var(--sidebar-accent) / 0.5)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <action.icon className="h-4 w-4" style={{ color: "hsl(var(--sidebar-foreground) / 0.7)" }} />
                        <span className="text-sm">{action.label}</span>
                      </div>
                      {action.shortcut && (
                        <kbd className="hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono"
                          style={{ 
                            border: "1px solid hsl(var(--sidebar-border))",
                            color: "hsl(var(--sidebar-foreground) / 0.5)",
                            backgroundColor: "transparent",
                          }}>
                          {action.shortcut}
                        </kbd>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ height: "1px", backgroundColor: "hsl(var(--sidebar-border))", margin: "4px 0" }} />
              </>
            )}

            {/* Search Results */}
            {searchValue && !hasResults && (
              <div className="py-6 text-center text-sm" style={{ color: "hsl(var(--sidebar-foreground) / 0.6)" }}>
                No results found for "{searchValue}"
              </div>
            )}

            {/* Navigation Items - Filtered */}
            {Object.entries(filteredItems).map(([group, items]) => (
              <div key={group} style={{ padding: "8px 12px" }}>
                <div 
                  className="text-xs font-semibold mb-2 px-2"
                  style={{ 
                    color: "hsl(var(--sidebar-foreground) / 0.5)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group.toUpperCase()}
                </div>
                {items.map((item) => (
                  <div
                    key={item.label}
                    onClick={() => handleSelect(item.path)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-150 group"
                    style={{ color: "hsl(var(--sidebar-foreground))" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "hsl(var(--sidebar-accent) / 0.5)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" style={{ color: "hsl(var(--sidebar-foreground) / 0.7)" }} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
