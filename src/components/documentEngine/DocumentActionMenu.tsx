import { Fragment, type ComponentType } from "react";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DocumentRowAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  /** Renders a red/destructive-styled item (Cancel, Delete). */
  destructive?: boolean;
  /** Escape hatch for a one-off item color a document's existing page already relies on (e.g. Invoices.tsx's emerald Post / teal Create Return / orange Cancel) — takes precedence over `destructive` when set. */
  className?: string;
  /** Inserts a separator line above this item. */
  separatorBefore?: boolean;
  hidden?: boolean;
}

/**
 * Generic row-actions dropdown for list pages (View / Edit / Print /
 * Duplicate / Cancel / Delete / ...). Every document's list page
 * (Invoices.tsx, SalesReturnsList.tsx, and the future Purchase list
 * pages) wires the same trigger button + config-driven item list instead
 * of hand-rolling its own DropdownMenu markup.
 */
export function DocumentActionMenu({
  actions,
  label = "Row actions",
  loading = false,
  triggerDisabled = false,
  contentClassName,
}: {
  actions: DocumentRowAction[];
  label?: string;
  /** Swaps the trigger's icon for a spinner (e.g. while a row-level action is in flight). */
  loading?: boolean;
  triggerDisabled?: boolean;
  contentClassName?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={label} disabled={triggerDisabled}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Fragment key={a.key}>
              {a.separatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={a.onClick}
                disabled={a.disabled}
                className={a.className ?? (a.destructive ? "text-destructive focus:text-destructive" : undefined)}
              >
                {Icon && <Icon className="h-3.5 w-3.5 mr-2" />}
                {a.label}
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
