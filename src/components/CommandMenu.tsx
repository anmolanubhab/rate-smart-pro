// CommandMenu.tsx - Fixed version
import { useEffect, useState } from "react";
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

  // Calculate position when menu opens (ABOVE the trigger)
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        bottom: window.innerHeight - rect.top + window.scrollY,
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
          bottom: window.innerHeight - rect.top + window.scrollY,
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          onOpenChange(false);
          onSearchChange("");
        }}
      />
      
      {/* Dropdown Command Menu - Positioned ABOVE the search box */}
      <div
        className="fixed z-50 animate-in fade-in zoom-in-95 duration-200"
        style={{
          bottom: position.bottom + 8,
          left: position.left,
          width: position.width,
          minWidth: "280px",
          maxHeight: "500px",
        }}
      >
        <Command
          className="rounded-lg border shadow-xl bg-popover text-popover-foreground overflow-hidden"
          shouldFilter={false}
        >
          <CommandInput
            placeholder="Search pages and actions..."
            value={searchValue}
            onValueChange={onSearchChange}
            className="h-10 border-b rounded-none px-3 text-sm focus:outline-none focus:ring-0"
          />

          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Quick Actions - only show when search is empty */}
            {!searchValue && (
              <>
                <CommandGroup heading="Quick Actions">
                  {quickActions.map((action) => (
                    <CommandItem
                      key={action.label}
                      onSelect={() => handleSelect(action.path)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <action.icon className="h-4 w-4" />
                        <span>{action.label}</span>
                      </div>
                      {action.shortcut && (
                        <kbd className="hidden sm:inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                          {action.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Filtered Navigation Items */}
            {Object.entries(groupedItems).map(([group, items]) => {
              const filteredItems = items.filter(item =>
                searchValue === "" ||
                item.label.toLowerCase().includes(searchValue.toLowerCase()) ||
                (item.group && item.group.toLowerCase().includes(searchValue.toLowerCase()))
              );
              
              if (filteredItems.length === 0) return null;
              
              return (
                <CommandGroup key={group} heading={group}>
                  {filteredItems.map((item) => (
                    <CommandItem
                      key={item.label}
                      onSelect={() => handleSelect(item.path)}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </div>
    </>
  );
}
