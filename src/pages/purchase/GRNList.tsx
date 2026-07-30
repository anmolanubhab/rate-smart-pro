import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Truck as TruckIcon } from "lucide-react";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchGoodsReceipts, type GoodsReceipt, type GRNStatus } from "@/lib/goodsReceipts";
import { useFormatDate } from "@/lib/dateFormat";

const STATUS_TONE: Record<GRNStatus, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  received: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  closed: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
};

export default function GRNList() {
  useEffect(() => { document.title = "Goods Receipt Notes — RD Pro"; }, []);
  const navigate = useNavigate();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();

  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      setRows(await fetchGoodsReceipts(businessId));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load goods receipts");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.grn_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.po_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Purchase</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Goods Receipt Notes</h1>
          <p className="text-muted-foreground mt-1 text-sm">Every GRN recorded against a purchase order — click one to view what was received.</p>
        </div>
        <Button onClick={() => navigate("/purchase/grn/new")}><Plus className="h-4 w-4 mr-2" />New GRN</Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search GRN #, supplier, PO…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Purchase Order</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <TruckIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {rows.length === 0 ? "No goods receipts yet. Record your first one." : "No GRNs match your search."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/purchase/grn/${r.id}`)}>
                  <TableCell className="font-mono text-sm font-medium">{r.grn_number}</TableCell>
                  <TableCell>{fd(r.grn_date)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.po_number ?? "—"}</TableCell>
                  <TableCell>{r.supplier_name ?? "—"}</TableCell>
                  <TableCell>{r.warehouse_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
