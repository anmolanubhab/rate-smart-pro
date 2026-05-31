// CommandMenu.tsx - Final Version with Input Focus Support
import { useEffect, useState, useRef } from "react";
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
  triggerRef?: React.RefObject<HTMLInputElement>;
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
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);
  
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

  // Get all menu items for keyboard navigation
  const getAllItems = () => {
    const items: { label: string; path: string; icon: any; shortcut?: string }[] = [];
    
    if (!searchValue) {
      items.push(...quickActions);
      items.push(...navigationItems);
    } else {
      const filtered = navigationItems.filter(item =>
        item.label.toLowerCase().includes(searchValue.toLowerCase()) ||
        item.group.toLowerCase().includes(searchValue.toLowerCase())
      );
      items.push(...filtered);
    }
    
    return items;
  };

  // Calculate position to open BELOW the input field
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      setSelectedIndex(-1);
    }
  }, [open, triggerRef]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getAllItems();
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < items.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < items.length) {
            const item = items[selectedIndex];
            handleSelect(item.path);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          onSearchChange("");
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, searchValue]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemsRef.current[selectedIndex]) {
      itemsRef.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 4,
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
    setSelectedIndex(-1);
  };

  // Filter and group items for search
  const getGroupedFilteredItems = () => {
    if (!searchValue) return {};
    
    const filtered = navigationItems.filter(item =>
      item.label.toLowerCase().includes(searchValue.toLowerCase()) ||
      item.group.toLowerCase().includes(searchValue.toLowerCase())
    );
    
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
  let itemCounter = 0;

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
      
      {/* Popup - Positioned BELOW input field */}
      <div
        className="fixed z-[9999] animate-in fade-in slide-in-from-top-2 duration-200"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
        }}
      >
        <div
          className="rounded-lg shadow-2xl overflow-hidden"
          style={{
            backgroundColor: "#000000",
            border: "1px solid #27272a",
          }}
        >
          {/* Scrollable Results */}
          <div 
            className="overflow-y-auto"
            style={{ 
              backgroundColor: "#000000",
              maxHeight: "400px",
              minHeight: "auto",
            }}
          >
            {/* No Search - Show All Items */}
            {!searchValue && (
              <>
                {/* Quick Actions Section */}
                <div style={{ padding: "8px 12px" }}>
                  <div 
                    className="text-xs font-semibold mb-2 px-2"
                    style={{ 
                      color: "#a1a1aa",
                      letterSpacing: "0.05em",
                    }}
                  >
                    QUICK ACTIONS
                  </div>
                  {quickActions.map((action) => {
                    const isSelected = selectedIndex === itemCounter;
                    const ref = (el: HTMLDivElement | null) => {
                      itemsRef.current[itemCounter] = el;
                    };
                    itemCounter++;
                    return (
                      <div
                        key={action.label}
                        ref={ref}
                        onClick={() => handleSelect(action.path)}
                        className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150"
                        style={{ 
                          color: "#f4f4f5",
                          backgroundColor: isSelected ? "#27272a" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <action.icon className="h-4 w-4" style={{ color: "#a1a1aa" }} />
                          <span className="text-sm">{action.label}</span>
                        </div>
                        {action.shortcut && (
                          <kbd className="hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono"
                            style={{ 
                              border: "1px solid #3f3f46",
                              color: "#a1a1aa",
                              backgroundColor: "transparent",
                            }}>
                            {action.shortcut}
                          </kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div style={{ height: "1px", backgroundColor: "#27272a", margin: "4px 0" }} />
                
                {/* Orders Section */}
                <div style={{ padding: "8px 12px" }}>
                  <div 
                    className="text-xs font-semibold mb-2 px-2"
                    style={{ 
                      color: "#a1a1aa",
                      letterSpacing: "0.05em",
                    }}
                  >
                    ORDERS
                  </div>
                  {navigationItems.filter(i => i.group === "Orders").map((item) => {
                    const isSelected = selectedIndex === itemCounter;
                    const ref = (el: HTMLDivElement | null) => {
                      itemsRef.current[itemCounter] = el;
                    };
                    itemCounter++;
                    return (
                      <div
                        key={item.label}
                        ref={ref}
                        onClick={() => handleSelect(item.path)}
                        className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150"
                        style={{ 
                          color: "#f4f4f5",
                          backgroundColor: isSelected ? "#27272a" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" style={{ color: "#a1a1aa" }} />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <ChevronRight className="h-3 w-3" style={{ opacity: 0.3 }} />
                      </div>
                    );
                  })}
                </div>
                
                <div style={{ height: "1px", backgroundColor: "#27272a", margin: "4px 0" }} />
                
                {/* Catalog Section */}
                <div style={{ padding: "8px 12px" }}>
                  <div 
                    className="text-xs font-semibold mb-2 px-2"
                    style={{ 
                      color: "#a1a1aa",
                      letterSpacing: "0.05em",
                    }}
                  >
                    CATALOG
                  </div>
                  {navigationItems.filter(i => i.group === "Catalog").map((item) => {
                    const isSelected = selectedIndex === itemCounter;
                    const ref = (el: HTMLDivElement | null) => {
                      itemsRef.current[itemCounter] = el;
                    };
                    itemCounter++;
                    return (
                      <div
                        key={item.label}
                        ref={ref}
                        onClick={() => handleSelect(item.path)}
                        className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150"
                        style={{ 
                          color: "#f4f4f5",
                          backgroundColor: isSelected ? "#27272a" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" style={{ color: "#a1a1aa" }} />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <ChevronRight className="h-3 w-3" style={{ opacity: 0.3 }} />
                      </div>
                    );
                  })}
                </div>
                
                <div style={{ height: "1px", backgroundColor: "#27272a", margin: "4px 0" }} />
                
                {/* Insights & Account Section */}
                <div style={{ padding: "8px 12px" }}>
                  <div 
                    className="text-xs font-semibold mb-2 px-2"
                    style={{ 
                      color: "#a1a1aa",
                      letterSpacing: "0.05em",
                    }}
                  >
                    MORE
                  </div>
                  {navigationItems.filter(i => i.group === "Insights" || i.group === "Account").map((item) => {
                    const isSelected = selectedIndex === itemCounter;
                    const ref = (el: HTMLDivElement | null) => {
                      itemsRef.current[itemCounter] = el;
                    };
                    itemCounter++;
                    return (
                      <div
                        key={item.label}
                        ref={ref}
                        onClick={() => handleSelect(item.path)}
                        className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150"
                        style={{ 
                          color: "#f4f4f5",
                          backgroundColor: isSelected ? "#27272a" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" style={{ color: "#a1a1aa" }} />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <ChevronRight className="h-3 w-3" style={{ opacity: 0.3 }} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Search Results */}
            {searchValue && !hasResults && (
              <div className="py-6 text-center text-sm" style={{ color: "#a1a1aa" }}>
                No results found for "{searchValue}"
              </div>
            )}

            {/* Filtered Navigation Items for Search */}
            {searchValue && Object.entries(filteredItems).map(([group, items]) => (
              <div key={group} style={{ padding: "8px 12px" }}>
                <div 
                  className="text-xs font-semibold mb-2 px-2"
                  style={{ 
                    color: "#a1a1aa",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group.toUpperCase()}
                </div>
                {items.map((item) => {
                  const isSelected = selectedIndex === itemCounter;
                  const ref = (el: HTMLDivElement | null) => {
                    itemsRef.current[itemCounter] = el;
                  };
                  itemCounter++;
                  return (
                    <div
                      key={item.label}
                      ref={ref}
                      onClick={() => handleSelect(item.path)}
                      className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150"
                      style={{ 
                        color: "#f4f4f5",
                        backgroundColor: isSelected ? "#27272a" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#27272a";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" style={{ color: "#a1a1aa" }} />
                        <span className="text-sm">{item.label}</span>
                      </div>
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
