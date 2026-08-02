import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface DocumentToolbarAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Shown in the tooltip and appended to the label as a hint, e.g. "Ctrl+S". */
  shortcut?: string;
  variant?: "default" | "outline" | "ghost" | "primary";
  disabled?: boolean;
  hidden?: boolean;
}

/**
 * Top action bar shared by every document create/edit page — the row of
 * Save Draft / Submit / Print / PDF / etc. buttons. Extracted from the
 * `print:hidden flex items-center justify-between` block duplicated in
 * CreateOrder.tsx/CreateQuotation.tsx. Renders a left-side status/label
 * slot and a right-side action button group.
 */
export function DocumentToolbar({
  statusSlot,
  actions,
}: {
  statusSlot?: ReactNode;
  actions: DocumentToolbarAction[];
}) {
  return (
    <div className="print:hidden flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-2">{statusSlot}</div>
      <div className="flex gap-1.5 flex-wrap">
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <DocumentToolbarButton key={a.key} action={a} />
          ))}
      </div>
    </div>
  );
}

export function DocumentToolbarButton({ action }: { action: DocumentToolbarAction }) {
  const Icon = action.icon;
  const isPrimary = action.variant === "primary";
  return (
    <Button
      size="sm"
      variant={isPrimary ? undefined : (action.variant ?? "outline")}
      onClick={action.onClick}
      disabled={action.disabled}
      className={`h-8${isPrimary ? " gradient-primary text-white border-0" : ""}`}
      title={action.shortcut ? `Shortcut: ${action.shortcut}` : undefined}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />} {action.label}
      {action.shortcut ? ` (${action.shortcut})` : ""}
    </Button>
  );
}
