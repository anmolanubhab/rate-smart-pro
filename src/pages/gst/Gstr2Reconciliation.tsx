import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const columns: MockColumn[] = [
  { key: "document_number", label: "Document #" },
  { key: "supplier_gstin", label: "Supplier GSTIN" },
  { key: "supplier_name", label: "Supplier" },
  { key: "books_tax", label: "Tax (Books)", align: "right", format: "currency" },
  { key: "portal_tax", label: "Tax (2A/2B)", align: "right", format: "currency" },
  { key: "difference", label: "Difference", align: "right", format: "currency" },
  { key: "status", label: "Status", format: "badge" },
];

const toneByStatus: Record<string, string> = {
  matched: "success", amount_mismatch: "warning", missing_in_books: "danger", missing_in_portal: "danger",
};

const SAMPLE = `[
  {
    "supplier_gstin": "10AAAAA0000A1Z5",
    "supplier_name": "Example Supplier Pvt Ltd",
    "document_number": "INV-2201",
    "document_date": "2026-07-15",
    "taxable_value": 10000,
    "cgst": 900,
    "sgst": 900,
    "igst": 0,
    "cess": 0
  }
]`;

export default function Gstr2Reconciliation() {
  useEffect(() => { document.title = "GSTR-2A/2B Reconciliation — RD Pro"; }, []);
  const { business } = useBusiness();
  const [source, setSource] = useState<"GSTR2A" | "GSTR2B">("GSTR2B");
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const doImport = async () => {
    if (!business?.id) return;
    let rows: any[];
    try {
      rows = JSON.parse(raw);
      if (!Array.isArray(rows)) throw new Error("Expected a JSON array of rows");
    } catch (e: any) {
      toast.error("Invalid JSON: " + e.message);
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.rpc("gst_2b_import_bulk" as never, {
        _business_id: business.id, _source: source, _rows: rows,
      } as never);
      if (error) throw error;
      toast.success(`Imported ${data} row(s) from ${source}`);
      setRaw("");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const fetchRows = async ({ from, to }: ReportFilters) => {
    if (!business?.id) return [];
    const { data, error } = await supabase.rpc("gst_2b_reconciliation" as never, {
      _business_id: business.id, _from_date: from, _to_date: to,
    } as never);
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({ ...r, status_tone: toneByStatus[r.status] ?? "default" }));
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const matched = rows.filter((r) => r.status === "matched").length;
    const mismatched = rows.filter((r) => r.status === "amount_mismatch").length;
    const missingBooks = rows.filter((r) => r.status === "missing_in_books").length;
    const missingPortal = rows.filter((r) => r.status === "missing_in_portal").length;
    return [
      { label: "Matched", value: matched, tone: "success" },
      { label: "Amount Mismatch", value: mismatched, tone: "warning" },
      { label: "Missing in Books", value: missingBooks, tone: "danger" },
      { label: "Missing in 2A/2B", value: missingPortal, tone: "danger" },
    ];
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">GST</p>
        <h1 className="text-2xl font-bold mt-1">GSTR-2A / 2B Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          GSTR-2A/2B is auto-populated by GSTN from your suppliers' own filings — this app can't generate it, only
          import what the portal gives you and reconcile it against your purchase register.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 w-40">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GSTR2A">GSTR-2A</SelectItem>
                <SelectItem value="GSTR2B">GSTR-2B</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rows (JSON array — normalize the portal export to this shape before pasting)</Label>
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={SAMPLE} className="font-mono text-xs h-40" />
          </div>
          <Button size="sm" onClick={doImport} disabled={importing || !raw.trim()}>Import Rows</Button>
        </CardContent>
      </Card>

      <ReportRunner
        key={refreshKey}
        reportTypeId="gstr2_reconciliation"
        eyebrow="GST"
        title="Reconciliation"
        description="Purchase register vs imported GSTR-2A/2B, matched by supplier GSTIN + document number."
        columns={columns}
        fetchRows={fetchRows}
        computeKpis={computeKpis}
        exportFileName="gstr-2-reconciliation"
      />
    </div>
  );
}
