import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  created_at: string;
  user_id: string;
  business_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  device: string | null;
};

const PAGE_SIZES = [10, 25, 50, 100];

export default function AuditLogs() {
  const { business } = useBusiness();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  useEffect(() => { document.title = "Audit Logs — RD Pro"; }, []);

  const q = useQuery({
    queryKey: ["audit-logs", business?.id, page, pageSize, search],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, business_id, action, entity_type, entity_id, reason, device", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (business) query = query.eq("business_id", business.id);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`action.ilike.${s},entity_type.ilike.${s},reason.ilike.${s}`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="font-display text-3xl font-bold mt-1">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-2">Immutable trail of user actions across the application.</p>
      </header>

      <div className="rounded-2xl bg-card border p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <Input className="md:w-80" placeholder="Search action, entity, reason…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page size</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPage(0); setPageSize(Number(v)); }}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && (q.data?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm py-8 text-muted-foreground">No audit events yet.</TableCell></TableRow>
              )}
              {(q.data?.rows ?? []).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}…</TableCell>
                  <TableCell><span className="px-2 py-0.5 rounded bg-muted text-xs">{r.action}</span></TableCell>
                  <TableCell className="text-xs">{r.entity_type ?? "—"}{r.entity_id ? ` · ${r.entity_id.slice(0,8)}…` : ""}</TableCell>
                  <TableCell className="text-xs">{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-xs truncate max-w-[240px]" title={r.device ?? ""}>{r.device ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
          <span>{total} total events</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
            <span>Page {page + 1} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
