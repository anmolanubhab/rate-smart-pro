import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileDown, AlertCircle, CheckCircle2, X, Loader2, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { fetchProducts, Product } from "@/lib/products";
import { computePOItem, POItem, downloadPOImportTemplate } from "@/lib/purchaseOrders";
import { downloadErrorReport } from "@/lib/excelTemplates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onImport: (items: POItem[]) => void;
}

type ParsedRow = {
  raw: any;
  part_number: string;
  description: string;
  qty: number;
  rate: number;
  discount_percent: number;
  gst_percent: number;
  matched?: Product;
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const num = (v: any): number => {
  const n = Number(String(v ?? "").replace(/[, ₹%]/g, ""));
  return isFinite(n) ? n : 0;
};

/** Pick first matching key from a row object (case-insensitive). */
const pick = (row: any, keys: string[]): any => {
  const lower: Record<string, any> = {};
  Object.keys(row).forEach((k) => (lower[k.toLowerCase().trim()] = row[k]));
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};

const fmtInr = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ─── Component ────────────────────────────────────────────────────────────────

export default function POExcelUpload({ open, onOpenChange, userId, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupMode, setDupMode] = useState<"merge" | "separate">("merge");

  const reset = () => { setRows([]); setFileName(""); };

  // ─── Parse uploaded file ────────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10 MB)"); return; }
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) throw new Error("File is empty or has no data rows");

      // Load catalog for matching
      const products = await fetchProducts(userId);
      const byPart = new Map(products.map((p) => [p.part_number.trim().toLowerCase(), p]));
      const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));

      const parsed: ParsedRow[] = json.map((r) => {
        // Column aliases — flexible header names
        const part = String(
          pick(r, ["part number", "part_number", "part_no", "partno", "part", "sku", "code", "item code"]) || ""
        ).trim().toUpperCase();

        const description = String(
          pick(r, ["description", "product name", "name", "item", "item name", "product"]) || ""
        ).trim();

        const qty = num(pick(r, ["qty", "quantity", "order qty", "po qty", "units"]));

        const rate = num(
          pick(r, ["rate", "purchase rate", "unit rate", "cost", "price", "unit price", "purchase price", "mrp"])
        );

        const discount_percent = num(
          pick(r, ["discount %", "disc %", "discount", "disc", "discount percent"])
        );

        const gst_percent = num(
          pick(r, ["gst %", "gst", "tax %", "tax", "igst %", "cgst %"])
        ) || 18; // default 18% if not provided

        // Catalog match
        let matched: Product | undefined;
        if (part) matched = byPart.get(part.toLowerCase());
        if (!matched && description) matched = byName.get(description.toLowerCase());

        // Validation
        let error: string | undefined;
        if (!part && !description) {
          error = "Missing part number / description";
        } else if (qty <= 0) {
          error = "Qty must be > 0";
        } else if (rate <= 0 && !matched) {
          error = "Rate required (product not in catalog)";
        }

        // Prefer catalog data when available
        const resolvedRate = rate || Number(matched?.mrp) || 0;

        return {
          raw: r,
          part_number: matched?.part_number || part,
          description: matched?.name || description,
          qty,
          rate: resolvedRate,
          discount_percent,
          gst_percent: gst_percent || Number(matched?.gst_pct) || 18,
          matched,
          error,
        };
      });

      setRows(parsed);
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const merged: ParsedRow[] = (() => {
    if (dupMode === "separate") return valid;
    const map = new Map<string, ParsedRow>();
    for (const r of valid) {
      const key =
        (r.part_number || r.description).toLowerCase() +
        "|" + r.rate +
        "|" + r.discount_percent +
        "|" + r.gst_percent;
      const existing = map.get(key);
      if (existing) existing.qty += r.qty;
      else map.set(key, { ...r });
    }
    return Array.from(map.values());
  })();

  const estValue = merged.reduce((s, r) => {
    const taxable = r.rate * r.qty * (1 - r.discount_percent / 100);
    return s + taxable * (1 + r.gst_percent / 100);
  }, 0);

  // ─── Confirm import ──────────────────────────────────────────────────────────

  const handleConfirm = () => {
    const items: POItem[] = merged.map((r) =>
      computePOItem({
        product_id: r.matched?.id ?? null,
        part_number: r.part_number,
        description: r.description,
        qty: r.qty,
        rate: r.rate,
        discount_percent: r.discount_percent,
        gst_percent: r.gst_percent,
      })
    );
    onImport(items);
    toast.success(`${items.length} item${items.length !== 1 ? "s" : ""} imported into PO`);
    reset();
    onOpenChange(false);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Import Items from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an .xlsx / .xls / .csv file. Items auto-match against your product catalog.
            Required columns: <strong>Part Number</strong>, <strong>Qty</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Drop zone ────────────────────────────────────── */}
        {!rows.length ? (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:bg-muted/30 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 animate-spin" />
                  <p className="text-muted-foreground text-sm">Matching against catalog…</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium">Click or drag file here</p>
                  <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv — max 10 MB</p>
                </>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />

            {/* Template download */}
            <div className="flex items-center justify-between text-sm border border-border rounded-xl px-4 py-3 bg-muted/20">
              <div>
                <p className="font-medium">Need a template?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Download with sample rows and Instructions sheet.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadPOImportTemplate}>
                <FileDown className="h-4 w-4 mr-1.5" />PO Template
              </Button>
            </div>

            {/* Column reference */}
            <div className="text-xs text-muted-foreground border border-border rounded-xl px-4 py-3 space-y-1 bg-muted/10">
              <p className="font-semibold text-foreground mb-1">Accepted column names (case-insensitive):</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                <span><span className="font-mono text-primary">Part Number</span> / Part No / SKU / Code</span>
                <span><span className="font-mono text-primary">Qty</span> / Quantity / Order Qty</span>
                <span><span className="font-mono text-primary">Rate</span> / Purchase Rate / Cost / MRP</span>
                <span><span className="font-mono text-primary">Discount %</span> / Disc / Disc %</span>
                <span><span className="font-mono text-primary">GST %</span> / Tax % / IGST %</span>
                <span><span className="font-mono text-primary">Description</span> / Product Name / Name</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Step 2: Preview & confirm ────────────────────────────── */
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryTile icon={CheckCircle2} label="Valid" value={valid.length} color="text-emerald-600" />
              <SummaryTile icon={AlertCircle} label="Errors" value={invalid.length} color="text-destructive" />
              <SummaryTile label="After merge" value={merged.length} />
              <SummaryTile label="Est. value" value={`₹ ${fmtInr(estValue)}`} />
            </div>

            {/* Duplicate mode */}
            <div className="flex items-center gap-4 px-1">
              <Label className="text-sm font-medium shrink-0">Duplicates:</Label>
              <RadioGroup
                value={dupMode}
                onValueChange={(v: "merge" | "separate") => setDupMode(v)}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="merge" id="po-merge" />
                  <Label htmlFor="po-merge" className="text-sm cursor-pointer">Merge quantities</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="separate" id="po-separate" />
                  <Label htmlFor="po-separate" className="text-sm cursor-pointer">Keep separate</Label>
                </div>
              </RadioGroup>
              <span className="text-xs text-muted-foreground ml-auto hidden md:block">
                File: {fileName}
              </span>
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto border border-border rounded-lg min-h-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Part No.</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Rate (₹)</th>
                    <th className="px-2 py-2 text-right">Disc %</th>
                    <th className="px-2 py-2 text-right">GST %</th>
                    <th className="px-2 py-2 text-right">Total (₹)</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const taxable = r.rate * r.qty * (1 - r.discount_percent / 100);
                    const total = taxable * (1 + r.gst_percent / 100);
                    return (
                      <tr
                        key={i}
                        className={`border-t border-border ${r.error ? "bg-destructive/5" : "hover:bg-muted/20"}`}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono">{r.part_number || "—"}</td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate">{r.description || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.rate.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.discount_percent}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.gst_percent}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {r.error ? "—" : fmtInr(total)}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.error ? (
                            <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px]">
                              {r.error}
                            </Badge>
                          ) : r.matched ? (
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/5 text-[10px]">
                              Matched
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]">
                              New item
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              {invalid.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadErrorReport(
                      invalid.map((r) => ({ ...r.raw, _error: r.error })),
                      "po-import-errors.xlsx"
                    )
                  }
                >
                  <FileDown className="h-4 w-4 mr-1.5" />
                  Download Errors ({invalid.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1.5" />Discard
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!merged.length}
                className="gradient-primary text-white border-0"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Confirm Import ({merged.length} item{merged.length !== 1 ? "s" : ""})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary tile ─────────────────────────────────────────────────────────────
function SummaryTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon?: any;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />}
      </div>
      <div className="font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
