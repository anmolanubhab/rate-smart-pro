// src/components/search/EnterpriseCommandMenu.tsx
//
// Enterprise Command Search — the single search surface for the entire app.
// Reads exclusively from the centralized navigation registry (useNavigation),
// so any page added there is automatically searchable here with zero extra
// wiring. Styled entirely with the project's existing theme tokens.
//
// Opens with Ctrl+K / Cmd+K, or via the `rdpro:open-search` window event
// (dispatched by the sidebar's "Find..." input so both stay in sync with a
// single implementation instead of two).

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ArrowRight, Sparkles, Clock, LayoutGrid } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/navigation/useNavigation";
import { useRecentPages } from "@/lib/navigation/useRecentPages";
import { useFavoritePages } from "@/lib/navigation/useFavoritePages";
import { scoreItem } from "@/lib/navigation/fuzzy";
import type { NavItem } from "@/lib/navigation/types";

/** Custom cmdk filter: score against title + aliases + keywords + module + description. */
function commandFilter(_value: string, search: string, keywords?: string[]): number {
  if (!search) return 1;
  const combined = (keywords ?? []).join(" ");
  return scoreItem(search, { title: combined || _value });
}

function itemKeywords(item: NavItem): string[] {
  return [item.title, item.module, ...(item.aliases ?? []), ...(item.keywords ?? []), item.description ?? ""].filter(
    Boolean,
  ) as string[];
}

export default function EnterpriseCommandMenu() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { tree, byId, getPath, quickActions, searchable } = useNavigation();
  const { recentIds, recordVisit } = useRecentPages();
  const { favoriteIds, isFavorite, toggleFavorite } = useFavoritePages();

  // Global Ctrl+K / Cmd+K, plus an escape hatch other components can dispatch
  // (used by the sidebar search box so there's still only one implementation).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onExternalOpen = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("rdpro:open-search", onExternalOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("rdpro:open-search", onExternalOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const favorites = useMemo(
    () => favoriteIds.map((id) => byId.get(id)).filter((i): i is NavItem => !!i && !!i.route),
    [favoriteIds, byId],
  );
  const recents = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((i): i is NavItem => !!i && !!i.route),
    [recentIds, byId],
  );

  const goTo = (item: NavItem) => {
    if (!item.route) return;
    recordVisit(item.id);
    navigate(item.route);
    setOpen(false);
  };

  const renderPathLabel = (item: NavItem) => {
    const path = getPath(item.id);
    const trail = path.slice(0, -1).map((p) => p.title);
    return trail.length ? trail.join(" › ") : item.module;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "top-[12%] translate-y-0 gap-0 overflow-hidden rounded-xl border-border bg-popover p-0 shadow-2xl",
          "sm:max-w-2xl",
        )}
      >
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, reports and quick actions across RD Pro
        </DialogDescription>

        <Command
          shouldFilter
          filter={commandFilter}
          className="rounded-xl bg-popover text-popover-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search pages, reports, actions… (try “ledger” or “gst”)"
            className="h-12 text-sm"
          />
          <CommandList className="max-h-[65vh] scrollbar-thin">
            <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
              No results found{search ? ` for "${search}"` : ""}.
            </CommandEmpty>

            {/* Quick Actions */}
            {quickActions.length > 0 && (
              <CommandGroup heading="Quick Actions">
                {quickActions.map((item) => (
                  <CommandItem
                    key={`qa-${item.id}`}
                    value={`qa-${item.id}`}
                    keywords={itemKeywords(item)}
                    onSelect={() => goTo(item)}
                    className="group gap-2 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{item.quickAction?.label ?? item.title}</span>
                    {item.quickAction?.shortcut && <CommandShortcut>{item.quickAction.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Favorites */}
            {favorites.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Favorites">
                  {favorites.map((item) => (
                    <CommandItem
                      key={`fav-${item.id}`}
                      value={`fav-${item.id}`}
                      keywords={itemKeywords(item)}
                      onSelect={() => goTo(item)}
                      className="group gap-2 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      {item.icon ? <item.icon className="h-4 w-4 text-muted-foreground" /> : <Star className="h-4 w-4" />}
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{renderPathLabel(item)}</span>
                      <FavoriteToggle active onClick={() => toggleFavorite(item.id)} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Recent Pages */}
            {recents.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent Pages">
                  {recents.map((item) => (
                    <CommandItem
                      key={`recent-${item.id}`}
                      value={`recent-${item.id}`}
                      keywords={itemKeywords(item)}
                      onSelect={() => goTo(item)}
                      className="group gap-2 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{renderPathLabel(item)}</span>
                      <FavoriteToggle active={isFavorite(item.id)} onClick={() => toggleFavorite(item.id)} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Main Navigation — every registered page, grouped by module */}
            <CommandSeparator />
            {tree.map((group) => {
              const itemsInModule = searchable.filter((i) => i.module === group.module);
              if (itemsInModule.length === 0) return null;
              return (
                <CommandGroup key={group.module} heading={group.module}>
                  {itemsInModule.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`nav-${item.id}`}
                      keywords={itemKeywords(item)}
                      onSelect={() => goTo(item)}
                      className="group gap-2 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      {item.icon ? (
                        <item.icon className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-accent-foreground" />
                      ) : (
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{item.title}</span>
                        {item.description && (
                          <span className="truncate text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground/80">
                            {item.description}
                          </span>
                        )}
                      </div>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {renderPathLabel(item)}
                      </span>
                      <FavoriteToggle active={isFavorite(item.id)} onClick={() => toggleFavorite(item.id)} />
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-data-[selected=true]:opacity-60" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span><kbd className="rounded border border-border bg-background px-1 py-0.5">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-border bg-background px-1 py-0.5">↵</kbd> open</span>
              <span><kbd className="rounded border border-border bg-background px-1 py-0.5">esc</kbd> close</span>
            </span>
            <span>RD Pro Search</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function FavoriteToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100"
      data-active={active}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      title={active ? "Remove from favorites" : "Pin to favorites"}
    >
      <Star className={cn("h-3.5 w-3.5", active ? "fill-primary text-primary" : "text-muted-foreground")} />
    </Button>
  );
}
