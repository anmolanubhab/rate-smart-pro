import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import {
  PERMISSION_MODULES, PERMISSION_ACTIONS,
  type PermissionModule, type PermissionAction, type PermissionMatrix,
} from "@/lib/permissionMatrix";

export { PERMISSION_MODULES, PERMISSION_ACTIONS, emptyPermissionMatrix } from "@/lib/permissionMatrix";
export type { PermissionModule, PermissionAction, PermissionMatrix } from "@/lib/permissionMatrix";

const MODULE_LABEL: Record<PermissionModule, string> = {
  dashboard: "Dashboard", sales: "Sales", purchase: "Purchase", inventory: "Inventory",
  accounts: "Accounts", gst: "GST", reports: "Reports", administration: "Administration",
  settings: "Settings", configuration: "Configuration", crm: "CRM", payroll: "Payroll",
  dealer_portal: "Dealer Portal",
};

const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "View", create: "Create", edit: "Edit", delete: "Delete", cancel: "Cancel",
  approve: "Approve", print: "Print", export: "Export", import: "Import", restore: "Restore",
};

export function PermissionMatrixEditor({
  value, onChange, readOnly, roleOptions, onCopyFromRole,
}: {
  value: PermissionMatrix;
  onChange: (next: PermissionMatrix) => void;
  readOnly?: boolean;
  roleOptions?: { value: string; label: string }[];
  onCopyFromRole?: (role: string) => void;
}) {
  const [search, setSearch] = useState("");

  const modules = useMemo(
    () => PERMISSION_MODULES.filter((m) => MODULE_LABEL[m].toLowerCase().includes(search.trim().toLowerCase())),
    [search],
  );

  const setCell = (mod: string, action: string, checked: boolean) => {
    onChange({ ...value, [mod]: { ...(value[mod] ?? {}), [action]: checked } });
  };

  const setRow = (mod: string, checked: boolean) => {
    const row: Record<string, boolean> = {};
    for (const a of PERMISSION_ACTIONS) row[a] = checked;
    onChange({ ...value, [mod]: row });
  };

  const setAll = (checked: boolean) => {
    const next: PermissionMatrix = {};
    for (const m of PERMISSION_MODULES) {
      const row: Record<string, boolean> = {};
      for (const a of PERMISSION_ACTIONS) row[a] = checked;
      next[m] = row;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search module…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!readOnly && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>Select All</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAll(false)}>Clear All</Button>
            {onCopyFromRole && roleOptions && roleOptions.length > 0 && (
              <Select onValueChange={(v) => onCopyFromRole(v)}>
                <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue placeholder="Copy from role…" /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </>
        )}
      </div>

      <ScrollArea className="h-[360px] rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
            <tr>
              <th className="text-left font-medium p-2 w-[160px]">Module</th>
              {PERMISSION_ACTIONS.map((a) => (
                <th key={a} className="p-2 text-center font-medium whitespace-nowrap">{ACTION_LABEL[a]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const rowFullyChecked = PERMISSION_ACTIONS.every((a) => value[m]?.[a]);
              return (
                <tr key={m} className="border-t">
                  <td className="p-2 font-medium">
                    <button
                      type="button"
                      disabled={readOnly}
                      className="hover:underline disabled:no-underline disabled:cursor-default text-left"
                      onClick={() => setRow(m, !rowFullyChecked)}
                      title={readOnly ? undefined : (rowFullyChecked ? "Clear row" : "Select row")}
                    >
                      {MODULE_LABEL[m]}
                    </button>
                  </td>
                  {PERMISSION_ACTIONS.map((a) => (
                    <td key={a} className="p-2 text-center">
                      <Checkbox
                        checked={!!value[m]?.[a]}
                        onCheckedChange={(c) => setCell(m, a, !!c)}
                        disabled={readOnly}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {modules.length === 0 && (
              <tr><td colSpan={PERMISSION_ACTIONS.length + 1} className="text-center text-muted-foreground py-6">No modules match your search</td></tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
