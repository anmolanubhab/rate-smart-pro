import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Search, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const CommandMenu = ({ open, setOpen }: CommandMenuProps) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [recentPages, setRecentPages] = useState<{ to: string; label: string }[]>([]);

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

  // Handle global keyboard shortcuts
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

  // Navigate and update recent pages tracking
  const handleSelect = (to: string, label: string) => {
    setOpen(false);
    setSearch("");
    
    // Save to recents tracking list
    const updatedRecents = [
      { to, label },
      ...recentPages.filter((item) => item.to !== to),
    ].slice(0, 3); // Track last 3 unique visits
    
    setRecentPages(updatedRecents);
    localStorage.setItem("rd_recent_pages", JSON.stringify(updatedRecents));
    
    navigate(to);
  };

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] bg-background/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setOpen(false)}
    >
      <div 
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Global Navigation Command Palette" className="flex flex-col h-full">
          {/* Search Input Box */}
          <div className="flex items-center gap-3 px-4 border-b border-border bg-transparent">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Type a page or command to navigate..."
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {/* Empty State */}
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No matching pages found.
            </Command.Empty>

            {/* Recently Visited Pages Section */}
            {recentPages.length > 0 && !search && (
              <Command.Group 
                heading={
                  <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">
                    <Clock className="h-3 w-3" /> Recent Activity
                  </div>
                }
              >
                {recentPages.map((page) => (
                  <Command.Item
                    key={`recent-${page.to}`}
                    value={page.label}
                    onSelect={() => handleSelect(page.to, page.label)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-accent/80 hover:text-accent-foreground cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground transition-all duration-150"
                  >
                    <span className="font-medium">{page.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-40" />
                  </Command.Item>
                ))}
                <div className="h-px bg-border my-2 mx-1" />
              </Command.Group>
            )}

            {/* All Searchable Pages Section */}
            <Command.Group 
              heading={
                <span className="px-2 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">
                  Jump to Page
                </span>
              }
            >
              {flatNav.map(({ to, label, icon: Icon }) => (
                <Command.Item
                  key={to}
                  value={label}
                  onSelect={() => handleSelect(to, label)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-accent/80 hover:text-accent-foreground cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent transition-all duration-150"
                >
                  <Icon className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-accent-foreground shrink-0" />
                  <span className="font-medium flex-1">{label}</span>
                  <span className="text-[11px] text-muted-foreground/50 truncate max-w-[120px] font-mono hidden sm:inline">
                    {to}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
