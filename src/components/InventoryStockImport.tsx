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
import { downloadStockTemplate, downloadErrorReport } from "@/lib/excelTemplates";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onDone: () => void;
}

type Row = {
  raw: any;
  part_number: string;
  stock_value: number;
  matched?: Product;
  previous?: number;
  final?: number;
  error?: string;
};

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return isFinite(n) ? n : NaN;
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

export default function InventoryStockImport({ open, onOpenChange, userId, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  const reset = () => { setRows([]); setFileName(""); };

  const recompute = (parsed: Row[], m: "replace" | "add") => parsed.map((r) => {
    if (r.error && r.error !== "Negative stock") return r;
    if (!r.matched) return { ...r, error: "Part number not found" };
    const prev = Number(r.matched.stock) || 0;
    const final = m === "replace" ? r.stock_value : prev + r.stock_value;
    const err = final < 0 ? "Negative stock" : undefined;
    return { ...r, previous: prev, final, error: err };
  });

  const handleFile = async (file: File) => {
    setBusy(true); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) throw new Error("Empty file");

      const products = await fetchProducts(userId);
      const byPart = new Map(products.map((p) => [p.part_number.trim().toLowerCase(), p]));

      const parsed: Row[] = json.map((r) => {
        const part = String(pick(r, ["part number", "part_no", "partno", "part", "sku", "code"]) || "").trim();
        const stock = num(pick(r, ["qty", "quantity", "current stock", "stock"]));
        const matched = part ? byPart.get(part.toLowerCase()) : undefined;
        let error: string | undefined;
        if (!part) error = "Missing part number";
        else if (!isFinite(stock)) error = "Invalid qty";
        else if (!matched) error = "Part number not found";
        return { raw: r, part_number: part, stock_value: isFinite(stock) ? stock : 0, matched, error };
      });
      setRows(recompute(parsed, mode));
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally { setBusy(false); }
  };

  const changeMode = (m: "replace" | "add") => {
    setMode(m);
    setRows((rs) => recompute(rs, m));
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const applyUpdate = async () => {
    if (!valid.length) return;
    setApplying(true);
    const errors: any[] = [];
    let success = 0;
    try {
      for (const r of valid) {
        const before = r.previous ?? 0;
        const after = r.final ?? 0;
        const { error } = await supabase
          .from("products")
          .update({ stock: after })
          .eq("id", r.matched!.id)
          .eq("user_id", userId);
        if (error) { errors.push({ part: r.part_number, error: error.message }); continue; }
        success++;
        // Log movement (atomic per-row)
        await supabase.from("inventory_movements" as any).insert({
          user_id: userId,
          product_id: r.matched!.id,
          movement_type: "import",
          qty: after - before,
          stock_before: before,
          stock_after: after,
          reference_type: "stock_import",
          notes: `Excel import (${mode}) — ${fileName}`,
        });
        await supabase.from("inventory_adjustments").insert({
          user_id: userId,
          product_id: r.matched!.id,
          delta: after - before,
          reason: `Excel import (${mode}) — ${fileName}`,
        });
      }
    } finally {
      await supabase.from("inventory_import_logs" as any).insert({
        user_id: userId,
        file_name: fileName,
        import_mode: mode,
        total_rows: rows.length,
        success_count: success,
        failed_count: invalid.length + errors.length,
        summary: { valid: valid.length, replaced: mode === "replace" ? success : 0, added: mode === "add" ? success : 0 },
        errors: [...invalid.map((r) => ({ row: r.raw, error: r.error })), ...errors],
      });
      setApplying(false);
      toast.success(`Updated ${success} product(s)`);
      reset();
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Update Stock via Excel</DialogTitle>
          <DialogDescription>
            Upload a sheet with only <strong>Part Number</strong> and <strong>Qty</strong>. Choose Replace or Add mode.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 px-1">
          <Label className="text-sm font-medium">Mode:</Label>
          <RadioGroup value={mode} onValueChange={(v: any) => changeMode(v)} className="flex gap-4">
            <div className="flex items-center gap-2"><RadioGroupItem value="replace" id="rep" /><Label htmlFor="rep">Replace existing stock</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="add" id="add" /><Label htmlFor="add">Add to existing stock</Label></div>
          </RadioGroup>
        </div>

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
              <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv · only Part Number + Qty</p>
              {busy && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-3" />}
            </div>
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Need a starting point?</span>
              <Button variant="outline" size="sm" onClick={downloadStockTemplate}>
                <FileDown className="h-4 w-4" /> Download Sample Template
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile icon={CheckCircle2} label="Valid" value={valid.length} color="text-emerald-600" />
              <Tile icon={AlertCircle} label="Invalid" value={invalid.length} color="text-destructive" />
              <Tile label="Mode" value={mode === "replace" ? "Replace" : "Add"} />
              <Tile label="File" value={fileName.slice(0, 18)} />
            </div>

            <div className="flex-1 overflow-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Part</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2 text-right">Previous</th>
                    <th className="px-2 py-2 text-right">Excel</th>
                    <th className="px-2 py-2 text-right">Final</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono">{r.part_number || "—"}</td>
                      <td className="px-2 py-1.5">{r.matched?.name || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.previous ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.stock_value}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.final ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.error
                          ? <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">{r.error}</Badge>
                          : <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/5">Ready</Badge>}
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
              <Button variant="outline" onClick={reset} disabled={applying}><X className="h-4 w-4" /> Discard</Button>
              <Button onClick={applyUpdate} disabled={!valid.length || applying} className="gradient-primary text-white border-0">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Apply Update ({valid.length})
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
      <div className="font-display text-xl font-bold mt-1 tabular-nums truncate">{value}</div>
    </div>
  );
}
