import { useCallback, useEffect, useState } from "react";
import { Search, Pencil, Printer, Barcode as BarcodeIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface ProductRow {
  id: string;
  part_number: string;
  name: string;
  mrp: number;
  barcode: string | null;
}

// Deterministic bar pattern derived from the code's characters — a scan-code
// generation library is a separate later phase (see original mock comment);
// this keeps the label human-readable (text underneath) in the meantime.
function barSpans(code: string): number[] {
  return code.split("").map((c) => (c.charCodeAt(0) % 3) + 1);
}

function BarcodeVisual({ code, height = 32 }: { code: string; height?: number }) {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="flex items-end gap-[1px]" style={{ height }}>
        {barSpans(code).map((w, i) => (
          <div key={i} style={{ width: w, height: "100%" }} className="bg-foreground" />
        ))}
      </div>
      <span className="text-[10px] font-mono tracking-wider">{code}</span>
    </div>
  );
}

export default function Barcodes() {
  useEffect(() => { document.title = "Barcodes — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      let query = supabase
        .from("products")
        .select("id, part_number, name, mrp, barcode")
        .eq("business_id", businessId)
        .eq("status", "active")
        .order("name", { ascending: true });
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`part_number.ilike.${q},name.ilike.${q},barcode.ilike.${q}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as ProductRow[]);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load products");
    } finally {
      setLoading(false);
    }
  }, [businessId, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const openEdit = (p: ProductRow) => { setEditing(p); setBarcodeInput(p.barcode ?? ""); };

  const saveBarcode = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ barcode: barcodeInput.trim() || null })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Barcode saved");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.code === "23505" ? "This barcode is already assigned to another product" : e.message ?? "Could not save barcode");
    } finally {
      setSaving(false);
    }
  };

  const printOne = (p: ProductRow) => {
    if (!p.barcode) { toast.error("Assign a barcode first"); return; }
    printLabels([p]);
  };

  const printLabels = (items: ProductRow[]) => {
    const withCodes = items.filter((p) => p.barcode);
    if (!withCodes.length) { toast.error("None of the selected products have a barcode assigned yet"); return; }
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) { toast.error("Pop-up blocked — allow pop-ups to print labels"); return; }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bars = (code: string) =>
      barSpans(code).map((wd, i) => `<div style="display:inline-block;width:${wd}px;height:100%;background:#000;"></div>`).join("");
    const labels = withCodes
      .map((p) => `<div style="text-align:center;padding:14px;page-break-inside:avoid;border-bottom:1px dashed #ccc;">
          <div style="font-size:12px;font-weight:600;">${esc(p.part_number)} — ${esc(p.name)}</div>
          <div style="height:40px;margin-top:6px;">${bars(p.barcode!)}</div>
          <div style="font-size:11px;font-family:ui-monospace,monospace;letter-spacing:1px;margin-top:2px;">${esc(p.barcode!)}</div>
          <div style="font-size:11px;color:#555;">MRP ₹${Number(p.mrp).toFixed(2)}</div>
        </div>`)
      .join("");
    w.document.write(`<!doctype html><html><head><title>Barcode Labels</title></head><body style="font-family:ui-monospace,monospace;">${labels}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Barcodes</h1>
          <p className="text-muted-foreground mt-1 text-sm">Assign and print barcode labels for products.</p>
        </div>
        <Button
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => printLabels(rows.filter((r) => selected.has(r.id)))}
        >
          <Printer className="h-4 w-4 mr-2" />Print Sheet ({selected.size})
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search part / name / barcode…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <BarcodeIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">No products match your search.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelected(p.id)} aria-label={`Select ${p.name}`} /></TableCell>
                  <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{Number(p.mrp).toFixed(2)}</TableCell>
                  <TableCell>{p.barcode ? <BarcodeVisual code={p.barcode} /> : <span className="text-xs text-muted-foreground">Not assigned</span>}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => printOne(p)} disabled={!p.barcode}><Printer className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Barcode — {editing?.part_number}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Barcode</Label>
            <Input value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} placeholder="e.g. 8901234000121" autoFocus />
            <p className="text-[11px] text-muted-foreground">Leave blank to remove the assigned barcode.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveBarcode} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
