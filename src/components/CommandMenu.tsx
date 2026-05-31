// CommandMenu.tsx - Completely Solid Background
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
  PlusSquare,
  Boxes,
  Package,
  Users,
  History,
  BarChart3,
  User,
  Settings as SettingsIcon,
  ChevronRight,
  Search,
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
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate position to OVERLAY exactly on the Find button
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      
      // Focus the input when opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open, triggerRef]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top + window.scrollY,
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

  // Group navigation items by category
  const groupedItems = navigationItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof navigationItems>);

  if (!open) return null;

  return (
    <>
      {/* Backdrop - only for clicking outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          onOpenChange(false);
          onSearchChange("");
        }}
      />
      
      {/* Overlay Command Menu - COMPLETELY SOLID background */}
      <div
        className="fixed z-50"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
        }}
      >
        <div
          className="rounded-lg shadow-xl overflow-hidden"
          style={{
            backgroundColor: "hsl(var(--sidebar))",
            border: "1px solid hsl(var(--sidebar-border))",
            backdropFilter: "none",
            opacity: 1,
          }}
        >
          {/* Search input section */}
          <div 
            className="flex items-center gap-2 px-3 py-2"
            style={{ 
              borderBottom: "1px solid hsl(var(--sidebar-border))",
              backgroundColor: "hsl(var(--sidebar))",
            }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--sidebar-foreground) / 0.5)" }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search pages and actions..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 w-full bg-transparent text-sm outline-none"
              style={{ 
                color: "hsl(var(--sidebar-foreground))",
                backgroundColor: "transparent",
              }}
              autoFocus
            />
            <kbd 
              className="hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono" 
              style={{ 
                border: "1px solid hsl(var(--sidebar-border))",
                color: "hsl(var(--sidebar-foreground) / 0.6)",
                backgroundColor: "hsl(var(--sidebar-background))",
              }}
            >
              ESC
            </kbd>
          </div>

          {/* Results list - SOLID background */}
          <div 
            className="max-h-[400px] overflow-y-auto"
            style={{ 
              backgroundColor: "hsl(var(--sidebar))",
            }}
          >
            {/* Quick Actions */}
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

            {/* Navigation Items */}
            {Object.entries(groupedItems).map(([group, items]) => {
              const filteredItems = items.filter(item =>
                searchValue === "" ||
                item.label.toLowerCase().includes(searchValue.toLowerCase()) ||
                (item.group && item.group.toLowerCase().includes(searchValue.toLowerCase()))
              );
              
              if (filteredItems.length === 0) return null;
              
              return (
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
                  {filteredItems.map((item) => (
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
              );
            })}
            
            {/* Empty state */}
            {searchValue && (
              <div className="py-6 text-center text-sm" style={{ color: "hsl(var(--sidebar-foreground) / 0.6)" }}>
                No results found.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
