import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileDown, AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, Product } from "@/lib/products";
import { computeItem, OrderItem } from "@/lib/orders";
import { downloadOrderTemplate, downloadErrorReport } from "@/lib/excelTemplates";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  defaultDiscount?: number;
  onImport: (items: OrderItem[]) => void;
}

type Parsed = {
  raw: any;
  part_number: string;
  name: string;
  qty: number;
  mrp: number;
  rate: number;
  discount: number;
  gst: number;
  hsn: string;
  matched?: Product;
  error?: string;
};

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/[, ₹]/g, ""));
  return isFinite(n) ? n : 0;
};
const pick = (row: any, keys: string[]) => {
  const lower: Record<string, any> = {};
  Object.keys(row).forEach((k) => (lower[k.toLowerCase().trim()] = row[k]));
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};

export default function OrderExcelUpload({ open, onOpenChange, userId, defaultDiscount = 0, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupMode, setDupMode] = useState<"merge" | "separate">("merge");

  const reset = () => { setRows([]); setFileName(""); };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) throw new Error("Empty file");

      const products = await fetchProducts(userId);
      const byPart = new Map(products.map((p) => [p.part_number.trim().toLowerCase(), p]));
      const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));

      const parsed: Parsed[] = json.map((r) => {
        const part = String(pick(r, ["part number", "part_no", "partno", "part", "sku", "code"]) || "").trim();
        const name = String(pick(r, ["product name", "name", "item", "description"]) || "").trim();
        const qty = num(pick(r, ["quantity", "qty"]));
        const mrp = num(pick(r, ["mrp", "price"]));
        const rate = num(pick(r, ["rate", "selling price", "net rate"]));
        const discount = num(pick(r, ["discount %", "discount", "disc %", "disc"])) || defaultDiscount;
        const gst = num(pick(r, ["gst %", "gst", "tax %"]));
        const hsn = String(pick(r, ["hsn", "hsn/sac", "hsn code"]) || "").trim();

        let matched: Product | undefined;
        if (part) matched = byPart.get(part.toLowerCase());
        if (!matched && name) matched = byName.get(name.toLowerCase());

        let error: string | undefined;
        if (!part && !name) error = "Missing part number / name";
        else if (qty <= 0) error = "Invalid quantity";
        else if (!matched && !mrp) error = "Product not found and MRP missing";

        return {
          raw: r,
          part_number: matched?.part_number || part,
          name: matched?.name || name,
          qty, mrp: mrp || matched?.mrp || 0,
          rate: rate || matched?.mrp || mrp || 0,
          discount, gst: gst || matched?.gst_pct || 0,
          hsn, matched, error,
        };
      });
      setRows(parsed);
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const merged = (() => {
    if (dupMode === "separate") return valid;
    const map = new Map<string, Parsed>();
    for (const r of valid) {
      const key = (r.part_number || r.name).toLowerCase() + "|" + r.discount + "|" + r.gst;
      const existing = map.get(key);
      if (existing) existing.qty += r.qty;
      else map.set(key, { ...r });
    }
    return Array.from(map.values());
  })();

  const totalValue = merged.reduce((s, r) => s + r.qty * (r.mrp * (1 - r.discount / 100)) * (1 + r.gst / 100), 0);

  const handleConfirm = async () => {
    const items: OrderItem[] = merged.map((r) =>
      computeItem({
        product_id: r.matched?.id ?? null,
        part_number: r.part_number,
        description: r.name,
        mrp: r.mrp,
        qty: r.qty,
        discount_pct: r.discount,
        gst_pct: r.gst,
      }),
    );

    try {
      await supabase.from("order_import_logs" as any).insert({
        user_id: userId,
        file_name: fileName,
        import_mode: dupMode === "merge" ? "append-merged" : "append-separate",
        total_rows: rows.length,
        success_count: items.length,
        failed_count: invalid.length,
        summary: { total_value: totalValue, valid: valid.length, merged_to: merged.length },
        errors: invalid.map((r) => ({ row: r.raw, error: r.error })),
      });
    } catch { /* log only */ }

    onImport(items);
    toast.success(`Imported ${items.length} item(s)`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload Items from Excel</DialogTitle>
          <DialogDescription>
            Drop an .xlsx / .xls / .csv file. Items auto-match against your product catalog.
          </DialogDescription>
        </DialogHeader>

        {!rows.length ? (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:bg-muted/30 cursor-pointer transition"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Click or drag file here</p>
              <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv up to 10MB</p>
              {busy && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-3" />}
            </div>
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Need a starting point?</span>
              <Button variant="outline" size="sm" onClick={downloadOrderTemplate}>
                <FileDown className="h-4 w-4" /> Download Sample Template
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile icon={CheckCircle2} label="Valid" value={valid.length} color="text-emerald-600" />
              <Tile icon={AlertCircle} label="Invalid" value={invalid.length} color="text-destructive" />
              <Tile label="After merge" value={merged.length} />
              <Tile label="Est. value" value={`₹${totalValue.toFixed(0)}`} />
            </div>

            <div className="flex items-center gap-4 px-1">
              <Label className="text-sm font-medium">Duplicates:</Label>
              <RadioGroup value={dupMode} onValueChange={(v: any) => setDupMode(v)} className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="merge" id="m" /><Label htmlFor="m">Merge quantities</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="separate" id="s" /><Label htmlFor="s">Keep separate</Label></div>
              </RadioGroup>
            </div>

            <div className="flex-1 overflow-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Part</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">MRP</th>
                    <th className="px-2 py-2 text-right">Disc%</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono">{r.part_number || "—"}</td>
                      <td className="px-2 py-1.5">{r.name || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.mrp.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.discount}</td>
                      <td className="px-2 py-1.5">
                        {r.error
                          ? <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">{r.error}</Badge>
                          : r.matched
                            ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/5">Matched</Badge>
                            : <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5">New</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2">
              {invalid.length > 0 && (
                <Button variant="outline" onClick={() => downloadErrorReport(invalid.map((r) => ({ ...r.raw, _error: r.error })))}>
                  <FileDown className="h-4 w-4" /> Failed rows
                </Button>
              )}
              <Button variant="outline" onClick={reset}><X className="h-4 w-4" /> Discard</Button>
              <Button onClick={handleConfirm} disabled={!merged.length} className="gradient-primary text-white border-0">
                Confirm Import ({merged.length})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ icon: Icon, label, value, color }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />}
      </div>
      <div className="font-display text-xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
