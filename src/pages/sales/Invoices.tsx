import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, FileText, Ban } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchInvoices, cancelInvoice, SalesInvoice } from "@/lib/salesInvoices";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusTone: Record<string, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  posted: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

const PAGE_SIZES = [10, 25, 50, 100];

export default function InvoicesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { document.title = "Sales Invoices — RD Pro"; }, []);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["sales-invoices", user?.id],
    enabled: !!user,
    queryFn: () => fetchInvoices(user!.id),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q && !`${i.invoice_number} ${i.party_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [search, status, pageSize]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, i) => {
      acc.count += 1;
      acc.amount += Number(i.grand_total) || 0;
      if (i.status === "posted") acc.posted += 1;
      return acc;
    }, { count: 0, amount: 0, posted: 0 });
  }, [filtered]);

  const onCancel = async (inv: SalesInvoice) => {
    if (!confirm(`Cancel invoice ${inv.invoice_number}?`)) return;
    try { await cancelInvoice(inv.id); toast.success("Invoice cancelled"); refetch(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Sales</p>
          <h1 className="font-display text-3xl font-bold mt-1">Sales Invoices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate invoices from approved orders. Posted invoices auto-create a sales voucher.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice / party" className="pl-9 w-72"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Invoices" value={totals.count} />
        <Kpi label="Posted" value={totals.posted} />
        <Kpi label="Total Value" value={`₹${totals.amount.toFixed(2)}`} />
        <Kpi label="Pages" value={`${page} / ${totalPages}`} />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : paged.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-60" />
            <p>No invoices yet. Generate one from the Orders page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Invoice #</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">GST</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((i) => (
                  <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-4 py-2.5">{i.invoice_date}</td>
                    <td className="px-4 py-2.5">{i.party_name ?? "—"}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className={statusTone[i.status]}>{i.status}</Badge></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">₹{Number(i.gst_total).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">₹{Number(i.grand_total).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {i.status === "posted" && (
                        <Button size="sm" variant="ghost" onClick={() => onCancel(i)} className="text-destructive">
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 text-xs">
                <tr>
                  <td colSpan={5} className="px-4 py-2 font-medium text-right">Page total:</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    ₹{paged.reduce((s, i) => s + Number(i.grand_total), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between p-3 border-t border-border text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}
