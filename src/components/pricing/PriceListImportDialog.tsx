// Pricing & Promotion Engine — Phase 1C Core Slice. Simplified 2-stage
// Import Excel: Upload+Preview -> Import. Not the full 4-step wizard
// (column mapping / validation-as-a-step / summary screen) — that's
// Phase 1C.1. Fixed expected headers ("Part Number", "Price"), same
// XLSX.read()/sheet_to_json() parsing already used in
// src/components/ProductImport.tsx.

import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PreviewRow {
  partNumber: string;
  price: number;
  matched: boolean;
  productId: string | null;
  name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceListId: string;
  businessId: string;
  effectiveFrom: string;
  onImported: () => void;
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export default function PriceListImportDialog({ open, onOpenChange, priceListId, businessId, effectiveFrom, onImported }: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => { setFileName(""); setRows([]); };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (!json.length) { toast.error("File is empty"); return; }

      const headers = Object.keys(json[0]);
      const partCol = findHeader(headers, ["part number", "part_number", "part no", "partno"]);
      const priceCol = findHeader(headers, ["price", "price list price", "selling price"]);
      if (!partCol || !priceCol) {
        toast.error('Expected columns "Part Number" and "Price" not found');
        return;
      }

      const parsed = json
        .map((r) => ({ partNumber: String(r[partCol] ?? "").trim(), price: Number(r[priceCol]) || 0 }))
        .filter((r) => r.partNumber);
      if (!parsed.length) { toast.error("No valid rows found"); return; }

      const { data: products, error } = await supabase
        .from("products")
        .select("id, part_number, name")
        .eq("business_id", businessId)
        .in("part_number", parsed.map((r) => r.partNumber));
      if (error) throw error;
      const byPartNumber = new Map((products ?? []).map((p) => [p.part_number, p]));

      setRows(
        parsed.map((r) => {
          const match = byPartNumber.get(r.partNumber);
          return { partNumber: r.partNumber, price: r.price, matched: !!match, productId: match?.id ?? null, name: match?.name ?? null };
        })
      );
    } catch (e: any) {
      toast.error(e.message ?? "Could not parse file");
    } finally {
      setParsing(false);
    }
  };

  const matchedRows = rows.filter((r) => r.matched);

  const runImport = async () => {
    if (matchedRows.length === 0) return;
    setImporting(true);
    try {
      const productIds = matchedRows.map((r) => r.productId!) as string[];
      const { data: existing, error: existingErr } = await supabase
        .from("price_list_items" as any)
        .select("id, product_id")
        .eq("price_list_id", priceListId)
        .in("product_id", productIds);
      if (existingErr) throw existingErr;
      const existingByProduct = new Map(((existing ?? []) as { id: string; product_id: string }[]).map((e) => [e.product_id, e.id]));

      const toUpdate = matchedRows.filter((r) => existingByProduct.has(r.productId!));
      const toInsert = matchedRows.filter((r) => !existingByProduct.has(r.productId!));

      await Promise.all(
        toUpdate.map((r) => supabase.from("price_list_items" as any).update({ price: r.price } as any).eq("id", existingByProduct.get(r.productId!)!))
      );
      if (toInsert.length) {
        const { error: insertErr } = await supabase.from("price_list_items" as any).insert(
          toInsert.map((r) => ({ price_list_id: priceListId, product_id: r.productId, price: r.price, effective_from: effectiveFrom })) as any
        );
        if (insertErr) throw insertErr;
      }

      toast.success(`Imported ${matchedRows.length} price${matchedRows.length > 1 ? "s" : ""} (${toUpdate.length} updated, ${toInsert.length} added)`);
      onImported();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Excel</DialogTitle>
          <DialogDescription>Expects columns "Part Number" and "Price". Matched rows update the existing price or add a new one.</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-3">
            <Input type="file" accept=".xlsx,.xls,.csv" disabled={parsing} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {parsing && <p className="text-xs text-muted-foreground">Parsing {fileName}…</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload className="h-3.5 w-3.5" /> {fileName} — {rows.length} rows, {matchedRows.length} matched
            </div>
            <div className="border rounded-lg max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="text-xs">Part Number</TableHead><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs text-right">Price</TableHead><TableHead className="text-xs">Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{r.partNumber}</TableCell>
                      <TableCell className="text-xs">{r.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.price}</TableCell>
                      <TableCell>
                        {r.matched ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px]">Matched</Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10 text-[10px]">Not Found</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          {rows.length > 0 && (
            <Button onClick={runImport} disabled={importing || matchedRows.length === 0}>
              {importing ? "Importing…" : `Import ${matchedRows.length} row${matchedRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
