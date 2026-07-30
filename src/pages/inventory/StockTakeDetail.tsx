import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Search, Trash2, ListPlus, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchStockTakeSheet, fetchStockTakeItems, addStockTakeItem, loadAllProducts,
  setCountedQty, removeStockTakeItem, postStockTake, cancelStockTake,
  type StockTakeSheet, type StockTakeItem, type StockTakeStatus,
} from "@/lib/stockTake";

const STATUS_STYLE: Record<StockTakeStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-amber-400/50 text-amber-600 bg-amber-50" },
  posted: { label: "Posted", cls: "border-emerald-500/50 text-emerald-700 bg-emerald-50" },
  cancelled: { label: "Cancelled", cls: "border-destructive/40 text-destructive bg-destructive/5" },
};

const PAGE_SIZE = 100;

export default function StockTakeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { business } = useBusiness();
  const fd = useFormatDate();

  const [sheet, setSheet] = useState<StockTakeSheet | null>(null);
  const [items, setItems] = useState<StockTakeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; part_number: string; name: string }[]>([]);

  const [postConfirm, setPostConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  useEffect(() => { document.title = "Stock Take — RD Pro"; }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, i] = await Promise.all([fetchStockTakeSheet(id), fetchStockTakeItems(id, page, PAGE_SIZE)]);
      setSheet(s);
      setItems(i.items);
      setTotal(i.total);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load stock take sheet");
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!business || !sheet || search.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, part_number, name")
        .eq("business_id", business.id)
        .or(`part_number.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(20);
      setSearchResults((data as any[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, business, sheet]);

  const isDraft = sheet?.status === "draft";

  const addProduct = async (p: { id: string; part_number: string; name: string }) => {
    if (!sheet) return;
    try {
      await addStockTakeItem(sheet.id, p.id, sheet.warehouse_id);
      toast.success(`${p.part_number} added`);
      setSearch("");
      setSearchResults([]);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not add product");
    }
  };

  const doLoadAll = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const n = await loadAllProducts(sheet.id);
      toast.success(n > 0 ? `${n} products added` : "All active products are already on this sheet");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not load products");
    } finally {
      setBusy(false);
    }
  };

  const onCountedChange = (itemId: string, value: string) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, counted_qty: value === "" ? null : Number(value) } : it)));
  };

  const saveCounted = async (item: StockTakeItem) => {
    try {
      await setCountedQty(item.id, item.counted_qty);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save count");
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await removeStockTakeItem(itemId);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not remove item");
    }
  };

  const doPost = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await postStockTake(sheet.id);
      toast.success(`${sheet.sheet_no} posted — variances applied to stock`);
      setPostConfirm(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not post stock take");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await cancelStockTake(sheet.id);
      toast.success(`${sheet.sheet_no} cancelled`);
      setCancelConfirm(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel stock take");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !sheet) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!sheet) return <div className="p-8 text-center text-muted-foreground">Stock take sheet not found.</div>;

  const st = STATUS_STYLE[sheet.status];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const countedOnPage = items.filter((i) => i.counted_qty !== null).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/inventory/stock-take")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-mono">{sheet.sheet_no}</h1>
            <Badge variant="outline" className={st.cls}>{st.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sheet.warehouse?.warehouse_name} · {fd(sheet.count_date)} · {total} items{sheet.notes ? ` · ${sheet.notes}` : ""}
          </p>
        </div>
        {isDraft && (
          <div className="flex gap-2">
            <Button variant="outline" className="text-destructive" onClick={() => setCancelConfirm(true)} disabled={busy}>
              <X className="h-4 w-4 mr-1" />Cancel Sheet
            </Button>
            <Button onClick={() => setPostConfirm(true)} disabled={busy || total === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Post
            </Button>
          </div>
        )}
      </div>

      {isDraft && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add products to count</p>
            <Button size="sm" variant="outline" onClick={doLoadAll} disabled={busy}>
              <ListPlus className="h-3.5 w-3.5 mr-1.5" />Load All Products
            </Button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search part number or name to add one…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {searchResults.length > 0 && (
              <div className="mt-1 border rounded-lg max-h-48 overflow-y-auto absolute bg-popover z-10 w-full shadow-md">
                {searchResults.map((p) => (
                  <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => addProduct(p)}>
                    {p.part_number} — {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">System Qty</TableHead>
              <TableHead className="text-right w-32">Counted Qty</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              {isDraft && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No items yet — search above or "Load All Products"</TableCell></TableRow>
            ) : items.map((it) => {
              const variance = it.counted_qty !== null ? Number(it.counted_qty) - Number(it.system_qty) : null;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.products?.part_number}</TableCell>
                  <TableCell className="text-sm max-w-[280px] truncate">{it.products?.name}</TableCell>
                  <TableCell className="text-right">{it.system_qty}</TableCell>
                  <TableCell className="text-right">
                    {isDraft ? (
                      <Input
                        type="number"
                        className="text-right h-8"
                        value={it.counted_qty ?? ""}
                        onChange={(e) => onCountedChange(it.id, e.target.value)}
                        onBlur={() => saveCounted(it)}
                      />
                    ) : (
                      it.counted_qty ?? "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {variance === null ? (
                      <span className="text-muted-foreground text-xs">not counted</span>
                    ) : variance === 0 ? (
                      <Badge variant="outline">0</Badge>
                    ) : (
                      <Badge variant={variance > 0 ? "default" : "destructive"}>{variance > 0 ? `+${variance}` : variance}</Badge>
                    )}
                  </TableCell>
                  {isDraft && (
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages} · {countedOnPage} counted on this page</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <AlertDialog open={postConfirm} onOpenChange={setPostConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post {sheet.sheet_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every counted line with a variance will adjust product stock to match the counted quantity, and write an inventory ledger entry.
              Lines you never entered a count for will be skipped, not zeroed out. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={doPost} disabled={busy}>Post Variance</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {sheet.sheet_no}?</AlertDialogTitle>
            <AlertDialogDescription>No stock has moved yet, so nothing needs to be reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} disabled={busy}>Cancel Sheet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
