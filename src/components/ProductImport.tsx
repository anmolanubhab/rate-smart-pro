import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { z } from "zod";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/lib/products";

type Step = 1 | 2 | 3 | 4;
type DupMode = "skip" | "update" | "duplicate";

interface Row {
  part_number: string;
  name: string;
  vehicle_model: string;
  category: ProductCategory;
  mrp: number;
  dealer_rate: number;
  stock: number;
  gst_pct: number;
  barcode: string;
  _errors: string[];
  _duplicate?: boolean;
}

const FIELDS = [
  { key: "part_number", label: "Part Number", required: true },
  { key: "name", label: "Product Name", required: true },
  { key: "vehicle_model", label: "Vehicle Model", required: false },
  { key: "category", label: "Category", required: false },
  { key: "mrp", label: "MRP", required: false },
  { key: "dealer_rate", label: "Dealer Rate", required: false },
  { key: "stock", label: "Stock", required: false },
  { key: "gst_pct", label: "GST %", required: false },
  { key: "barcode", label: "Barcode", required: false },
] as const;

const ALIASES: Record<string, string[]> = {
  part_number: ["part number", "part no", "part#", "partno", "item code", "sku", "code"],
  name: ["product name", "name", "description", "item name", "product"],
  vehicle_model: ["vehicle", "vehicle model", "model", "applicable", "fitment"],
  category: ["category", "type", "group"],
  mrp: ["mrp", "list price", "rate", "price"],
  dealer_rate: ["dealer rate", "dealer", "net rate", "purchase rate", "cost"],
  stock: ["stock", "qty", "quantity", "on hand", "available"],
  gst_pct: ["gst", "gst %", "gst%", "tax", "tax %"],
  barcode: ["barcode", "ean", "upc"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9% ]/g, "").trim();

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of Object.keys(ALIASES)) {
    const aliases = ALIASES[field].map(norm);
    const found = headers.find((h) => aliases.includes(norm(h)));
    if (found) map[field] = found;
  }
  return map;
}

function detectCategory(raw: string): ProductCategory {
  const s = (raw || "").toLowerCase();
  if (/oil|lubric|grease|coolant/.test(s)) return "lubricant";
  if (/access|helmet|cover|mat/.test(s)) return "accessory";
  if (/spare|part|brake|filter|clutch|bearing|chain/.test(s)) return "spare";
  if (s && !["spare", "lubricant", "accessory", "other"].includes(s)) return "other";
  return (s as ProductCategory) || "spare";
}

const rowSchema = z.object({
  part_number: z.string().trim().min(1, "Part Number required").max(64),
  name: z.string().trim().min(1, "Name required").max(200),
  mrp: z.number().min(0, "MRP must be ≥ 0"),
  dealer_rate: z.number().min(0),
  stock: z.number().int("Stock must be integer").min(0),
  gst_pct: z.number().min(0).max(100),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

export default function ProductImport({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [existingPNs, setExistingPNs] = useState<Set<string>>(new Set());
  const [dupMode, setDupMode] = useState<DupMode>("update");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState({ total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 });
  const [failedRows, setFailedRows] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setRows([]);
    setExistingPNs(new Set());
    setDupMode("update");
    setProcessing(false);
    setProgress(0);
    setSummary({ total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 });
    setFailedRows([]);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        "Part Number": "TVS-001",
        "Product Name": "Engine Oil",
        "Vehicle Model": "TVS Apache",
        "Category": "lubricant",
        "MRP": 450,
        "Dealer Rate": 380,
        "Stock": 50,
        "GST %": 18,
        "Barcode": "1234567890123",
      },
      {
        "Part Number": "TVS-022",
        "Product Name": "Air Filter",
        "Vehicle Model": "TVS Sport",
        "Category": "spare",
        "MRP": 280,
        "Dealer Rate": 200,
        "Stock": 30,
        "GST %": 18,
        "Barcode": "1234567890124",
      },
      {
        "Part Number": "LUB-100",
        "Product Name": "Gear Oil",
        "Vehicle Model": "TVS Heavy Bike",
        "Category": "lubricant",
        "MRP": 550,
        "Dealer Rate": 420,
        "Stock": 25,
        "GST %": 18,
        "Barcode": "1234567890125",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products-template.xlsx");
  };

  const parseFile = async (file: File) => {
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (!json.length) return toast.error("File is empty");
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRawRows(json);
      setMapping(autoMap(hdrs));
      setStep(2);
    } catch (e: any) {
      toast.error("Parse failed: " + e.message);
    }
  };

  const onFile = (f: File | undefined) => f && parseFile(f);

  const buildPreview = useCallback(async () => {
    if (!user) return;
    if (!mapping.part_number) {
      return toast.error("Map Part Number to continue");
    }
    const built: Row[] = rawRows.map((r) => {
      const num = (v: any) => {
        const n = parseFloat(String(v ?? "").replace(/[,₹\s]/g, ""));
        return isFinite(n) ? n : 0;
      };
      const row: Row = {
        part_number: String(r[mapping.part_number] ?? "").trim(),
        name: String(r[mapping.name] ?? "").trim(),
        vehicle_model: mapping.vehicle_model ? String(r[mapping.vehicle_model] ?? "").trim() : "",
        category: mapping.category ? detectCategory(String(r[mapping.category] ?? "")) : "spare",
        mrp: mapping.mrp ? num(r[mapping.mrp]) : 0,
        dealer_rate: mapping.dealer_rate ? num(r[mapping.dealer_rate]) : 0,
        stock: mapping.stock ? Math.floor(num(r[mapping.stock])) : 0,
        gst_pct: mapping.gst_pct ? num(r[mapping.gst_pct]) : 18,
        barcode: mapping.barcode ? String(r[mapping.barcode] ?? "").trim() : "",
        _errors: [],
      };
      const parsed = rowSchema.safeParse(row);
      if (!parsed.success) row._errors = parsed.error.errors.map((e) => e.message);
      return row;
    });

    // Fetch existing part numbers for duplicate detection
    const pns = Array.from(new Set(built.map((r) => r.part_number).filter(Boolean)));
    const existing = new Set<string>();
    const chunk = 500;
    for (let i = 0; i < pns.length; i += chunk) {
      const slice = pns.slice(i, i + chunk);
      const { data } = await supabase
        .from("products")
        .select("part_number")
        .eq("user_id", user.id)
        .in("part_number", slice);
      data?.forEach((d) => existing.add(d.part_number));
    }
    built.forEach((r) => {
      if (existing.has(r.part_number)) r._duplicate = true;
    });
    setExistingPNs(existing);
    setRows(built);
    setStep(3);
  }, [mapping, rawRows, user]);

  const updateCell = (idx: number, key: keyof Row, val: any) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], [key]: val };
      const parsed = rowSchema.safeParse(r);
      r._errors = parsed.success ? [] : parsed.error.errors.map((e) => e.message);
      next[idx] = r;
      return next;
    });
  };

  const validCount = rows.filter((r) => r._errors.length === 0).length;
  const errorCount = rows.length - validCount;
  const dupCount = rows.filter((r) => r._duplicate).length;

  const runImport = async () => {
    if (!user) return;
    setProcessing(true);
    setProgress(0);
    const failed: any[] = [];
    let inserted = 0,
      updated = 0,
      skipped = 0;

    const valid = rows.filter((r) => r._errors.length === 0);
    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    for (const r of valid) {
      const payload = {
        user_id: user.id,
        part_number: r.part_number,
        name: r.name,
        vehicle_model: r.vehicle_model || null,
        category: r.category,
        mrp: r.mrp,
        dealer_rate: r.dealer_rate,
        stock: r.stock,
        gst_pct: r.gst_pct,
        barcode: r.barcode || null,
        status: "active",
      };
      if (r._duplicate) {
        if (dupMode === "skip") {
          skipped++;
        } else if (dupMode === "update") {
          toUpdate.push(payload);
        } else {
          toInsert.push({ ...payload, part_number: `${payload.part_number}-${Date.now().toString(36)}` });
        }
      } else {
        toInsert.push(payload);
      }
    }

    rows.filter((r) => r._errors.length > 0).forEach((r) => {
      failed.push({ ...r, error: r._errors.join("; ") });
    });

    const total = toInsert.length + toUpdate.length;
    let done = 0;
    const chunk = 200;

    for (let i = 0; i < toInsert.length; i += chunk) {
      const slice = toInsert.slice(i, i + chunk);
      const { error, data } = await supabase.from("products").insert(slice).select("id");
      if (error) {
        slice.forEach((s) => failed.push({ ...s, error: error.message }));
      } else {
        inserted += data?.length || slice.length;
      }
      done += slice.length;
      setProgress(Math.round((done / Math.max(total, 1)) * 100));
    }

    for (const p of toUpdate) {
      const { error } = await supabase
        .from("products")
        .update({
          name: p.name,
          vehicle_model: p.vehicle_model,
          category: p.category,
          mrp: p.mrp,
          dealer_rate: p.dealer_rate,
          stock: p.stock,
          gst_pct: p.gst_pct,
          barcode: p.barcode,
        })
        .eq("user_id", user.id)
        .eq("part_number", p.part_number);
      if (error) failed.push({ ...p, error: error.message });
      else updated++;
      done++;
      setProgress(Math.round((done / Math.max(total, 1)) * 100));
    }

    setSummary({
      total: rows.length,
      inserted,
      updated,
      skipped,
      failed: failed.length,
      duplicates: dupCount,
    });
    setFailedRows(failed);
    setProcessing(false);
    setStep(4);
    onImported();
    toast.success(`Imported ${inserted + updated} products`);
  };

  const downloadFailed = () => {
    if (!failedRows.length) return;
    const ws = XLSX.utils.json_to_sheet(failedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Failed");
    XLSX.writeFile(wb, "failed-imports.xlsx");
  };

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        header: "#",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.index + 1}</span>,
        size: 40,
      },
      {
        header: "Status",
        cell: ({ row }) =>
          row.original._errors.length ? (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Error</Badge>
          ) : row.original._duplicate ? (
            <Badge className="bg-amber-500 hover:bg-amber-500 gap-1">Duplicate</Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge>
          ),
      },
      { header: "Part #", accessorKey: "part_number", cell: ({ row }) => (
        <Input value={row.original.part_number} onChange={(e) => updateCell(row.index, "part_number", e.target.value)} className="h-8 w-32 font-mono text-xs" />
      ) },
      { header: "Name", accessorKey: "name", cell: ({ row }) => (
        <Input value={row.original.name} onChange={(e) => updateCell(row.index, "name", e.target.value)} className="h-8 w-48" />
      ) },
      { header: "Vehicle", accessorKey: "vehicle_model", cell: ({ row }) => (
        <Input value={row.original.vehicle_model} onChange={(e) => updateCell(row.index, "vehicle_model", e.target.value)} className="h-8 w-36" />
      ) },
      { header: "Cat.", accessorKey: "category", cell: ({ row }) => (
        <Select value={row.original.category} onValueChange={(v) => updateCell(row.index, "category", v)}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="spare">Spare</SelectItem>
            <SelectItem value="lubricant">Lubricant</SelectItem>
            <SelectItem value="accessory">Accessory</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      ) },
      { header: "MRP", accessorKey: "mrp", cell: ({ row }) => (
        <Input type="number" value={row.original.mrp} onChange={(e) => updateCell(row.index, "mrp", parseFloat(e.target.value) || 0)} className="h-8 w-20 text-right tabular-nums" />
      ) },
      { header: "Dealer", accessorKey: "dealer_rate", cell: ({ row }) => (
        <Input type="number" value={row.original.dealer_rate} onChange={(e) => updateCell(row.index, "dealer_rate", parseFloat(e.target.value) || 0)} className="h-8 w-20 text-right tabular-nums" />
      ) },
      { header: "Stock", accessorKey: "stock", cell: ({ row }) => (
        <Input type="number" value={row.original.stock} onChange={(e) => updateCell(row.index, "stock", parseInt(e.target.value) || 0)} className="h-8 w-16 text-right tabular-nums" />
      ) },
      { header: "GST", accessorKey: "gst_pct", cell: ({ row }) => (
        <Input type="number" value={row.original.gst_pct} onChange={(e) => updateCell(row.index, "gst_pct", parseFloat(e.target.value) || 0)} className="h-8 w-16 text-right tabular-nums" />
      ) },
      { header: "Errors", cell: ({ row }) => row.original._errors.length ? (
        <span className="text-xs text-destructive">{row.original._errors.join(", ")}</span>
      ) : null },
    ],
    [],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="font-display flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Product Import
          </DialogTitle>
          <div className="flex items-center gap-2 mt-4 text-xs">
            {(["Upload", "Map Columns", "Preview", "Done"] as const).map((label, i) => {
              const n = (i + 1) as Step;
              const active = step === n;
              const past = step > n;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={cn(
                    "h-7 w-7 rounded-full grid place-items-center text-xs font-semibold border",
                    active && "bg-primary text-primary-foreground border-primary",
                    past && "bg-emerald-600 text-white border-emerald-600",
                    !active && !past && "bg-muted text-muted-foreground",
                  )}>{past ? <CheckCircle2 className="h-4 w-4" /> : n}</div>
                  <span className={cn("font-medium", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                  {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  onFile(e.dataTransfer.files[0]);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                )}
              >
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-display font-semibold">Drag & drop your Excel file here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse — supports .xlsx, .xls, .csv</p>
                {fileName && <p className="text-sm font-medium mt-3 text-primary">{fileName}</p>}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">Don't have a file? Start from our sample template.</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" /> Download Sample Template
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We auto-mapped <span className="font-semibold text-foreground">{Object.keys(mapping).length}</span> of {FIELDS.length} fields. Review and adjust if needed.
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-2 items-center gap-3">
                    <Label className="flex items-center gap-1">
                      {f.label}
                      {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] || "__none__"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="— skip —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— skip —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                Detected {rawRows.length} rows in <span className="font-mono">{fileName}</span>.
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">Total: {rows.length}</Badge>
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid: {validCount}</Badge>
                {errorCount > 0 && <Badge variant="destructive">Errors: {errorCount}</Badge>}
                {dupCount > 0 && <Badge className="bg-amber-500 hover:bg-amber-500">Duplicates: {dupCount}</Badge>}
              </div>

              {dupCount > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm font-medium mb-2">How should we handle duplicate Part Numbers?</p>
                  <RadioGroup value={dupMode} onValueChange={(v) => setDupMode(v as DupMode)} className="flex flex-col md:flex-row gap-4">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="update" /> Update Existing (recommended)</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="skip" /> Skip Existing</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="duplicate" /> Create New Duplicate</label>
                  </RadioGroup>
                </div>
              )}

              <div className="rounded-lg border overflow-auto max-h-[50vh]">
                <table className="text-sm">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((h) => (
                          <th key={h.id} className="text-left px-2 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className={cn(
                        "border-t",
                        row.original._errors.length && "bg-destructive/5",
                        !row.original._errors.length && row.original._duplicate && "bg-amber-500/5",
                      )}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-2 py-1 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {processing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">Importing... {progress}%</p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
                <h3 className="font-display text-2xl font-bold mt-3">Import Complete</h3>
                <p className="text-sm text-muted-foreground">Your catalog has been updated.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Total Rows", value: summary.total },
                  { label: "Imported", value: summary.inserted, tone: "emerald" },
                  { label: "Updated", value: summary.updated, tone: "blue" },
                  { label: "Skipped", value: summary.skipped, tone: "amber" },
                  { label: "Failed", value: summary.failed, tone: "red" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                    <p className={cn("font-display text-3xl font-bold mt-1",
                      s.tone === "emerald" && "text-emerald-600",
                      s.tone === "blue" && "text-primary",
                      s.tone === "amber" && "text-amber-500",
                      s.tone === "red" && "text-destructive",
                    )}>{s.value}</p>
                  </div>
                ))}
              </div>
              {summary.failed > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span>{summary.failed} rows failed to import.</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={downloadFailed}>
                    <Download className="h-4 w-4" /> Download Failed Rows
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/30">
          {step === 1 && (
            <Button variant="outline" onClick={close}>Cancel</Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={buildPreview} className="gradient-primary text-white border-0 hover:opacity-90">
                Continue to Preview
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={processing}>Back</Button>
              <Button
                onClick={runImport}
                disabled={processing || validCount === 0}
                className="gradient-primary text-white border-0 hover:opacity-90"
              >
                {processing ? (<><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>) : `Import ${validCount} Products`}
              </Button>
            </>
          )}
          {step === 4 && (
            <Button onClick={close} className="gradient-primary text-white border-0 hover:opacity-90">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
