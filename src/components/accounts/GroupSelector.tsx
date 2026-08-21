import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getGroupPath, type AccountGroupNode } from "@/lib/accounting";

const NATURE_LABEL: Record<string, string> = {
  asset: "Asset", liability: "Liability", income: "Income", expense: "Expense", capital: "Capital",
};

interface Props {
  groups: AccountGroupNode[];
  value: string | null;
  onChange: (groupId: string) => void;
  placeholder?: string;
  /** Excluded from the list -- used by Group Master's "Under Group" field so
   *  a group (and its own descendants, since they'd become circular anyway)
   *  can't be picked as its own parent. The real circular-hierarchy guard
   *  lives in the DB trigger; this is just a friendlier UI that never shows
   *  the invalid choice in the first place. */
  excludeIds?: Set<string>;
  disabled?: boolean;
}

/** Searchable, hierarchical group picker -- built on the same Command/
 *  Popover primitives every other combobox in this codebase uses, over the
 *  already-fetched account_groups tree (fetchAccountGroupTree). Renders
 *  every group flattened with its full ancestor path so search matches on
 *  a leaf name (e.g. "Sundry Debtors") while still showing where it lives
 *  ("Assets > Current Assets > Sundry Debtors") -- no separate tree-walk UI
 *  needed for a list this size, and it's identically usable on mobile
 *  (Popover already handles both). Groups with allow_ledger_creation=false
 *  are shown but disabled, with a reason, instead of being hidden. */
export default function GroupSelector({ groups, value, onChange, placeholder = "Select group…", excludeIds, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    return groups
      .filter((g) => !excludeIds?.has(g.id))
      .map((g) => {
        const path = getGroupPath(g.id, groups);
        return {
          id: g.id,
          name: g.name,
          nature: g.nature,
          allowed: g.allow_ledger_creation ?? true,
          pathLabel: path.length > 1 ? path.slice(0, -1).map((p) => p.name).join(" > ") : null,
          searchText: [g.name, ...path.map((p) => p.name)].join(" "),
        };
      })
      .sort((a, b) => a.searchText.localeCompare(b.searchText));
  }, [groups, excludeIds]);

  const selected = groups.find((g) => g.id === value) ?? null;
  const selectedPath = selected ? getGroupPath(selected.id, groups).map((p) => p.name).join(" > ") : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">{selectedPath ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search groups…" />
          <CommandList>
            <CommandEmpty>No group found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={opt.searchText}
                  disabled={!opt.allowed}
                  onSelect={() => {
                    if (!opt.allowed) return;
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <div className="flex w-full items-center gap-2">
                    <Check className={cn("h-4 w-4 shrink-0", value === opt.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{opt.name}</span>
                    {opt.nature && (
                      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                        {NATURE_LABEL[opt.nature] ?? opt.nature}
                      </Badge>
                    )}
                  </div>
                  {opt.pathLabel && (
                    <span className="pl-6 text-xs text-muted-foreground truncate w-full">{opt.pathLabel}</span>
                  )}
                  {!opt.allowed && (
                    <span className="pl-6 text-xs text-destructive w-full">Ledgers/sub-groups cannot post directly here</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
