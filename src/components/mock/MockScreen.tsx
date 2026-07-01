// MOCK SCREEN HELPER — used by frontend-only placeholder pages.
// Wire to Supabase in a future phase.
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Download, Plus, Search, Filter } from "lucide-react";

export type MockColumn = { key: string; label: string; align?: "left" | "right" | "center"; render?: (row: any) => ReactNode };

export function comingSoon(what = "This action") {
  toast({ title: `${what} — coming in next phase`, description: "This screen is UI-only for now." });
}

export default function MockScreen({
  eyebrow,
  title,
  description,
  actions,
  filters,
  columns,
  rows,
  footer,
  emptyText = "No records yet",
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  filters?: ReactNode;
  columns?: MockColumn[];
  rows?: any[];
  footer?: ReactNode;
  emptyText?: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          {eyebrow && <p className="text-sm text-muted-foreground font-medium">{eyebrow}</p>}
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {actions ?? (
            <>
              <Button variant="outline" onClick={() => comingSoon("Export")}><Download className="h-4 w-4 mr-2" />Export</Button>
              <Button onClick={() => comingSoon("Add")}><Plus className="h-4 w-4 mr-2" />Add</Button>
            </>
          )}
        </div>
      </header>

      {(filters !== undefined || columns) && (
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-9" onChange={() => {}} />
          </div>
          {filters ?? (
            <Button variant="outline" onClick={() => comingSoon("Filter")}><Filter className="h-4 w-4 mr-2" />Filters</Button>
          )}
        </div>
      )}

      {children}

      {columns && (
        <div className="rounded-md border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">{emptyText}</TableCell></TableRow>
              ) : (rows ?? []).map((r, i) => (
                <TableRow key={r.id ?? i} className="cursor-pointer">
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}>
                      {c.render ? c.render(r) : (r[c.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {footer}
        </div>
      )}
    </div>
  );
}

export { Badge };
