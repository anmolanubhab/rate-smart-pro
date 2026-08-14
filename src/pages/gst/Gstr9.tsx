import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MockColumn } from "@/components/accounts/MockTablePage";
import type { ReportUdm } from "@/lib/documentUdm/types";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

const summaryColumns: MockColumn[] = [
  { key: "period", label: "Period" },
  { key: "sales_taxable", label: "Sales Taxable", align: "right", format: "currency" },
  { key: "sales_tax", label: "Sales Tax", align: "right", format: "currency" },
  { key: "purchase_taxable", label: "Purchase Taxable", align: "right", format: "currency" },
  { key: "purchase_tax", label: "Purchase Tax", align: "right", format: "currency" },
];

const reconColumns: MockColumn[] = [
  { key: "metric", label: "Metric" },
  { key: "as_per_books", label: "As per Books", align: "right", format: "currency" },
  { key: "as_per_filed_returns", label: "As per Filed Returns", align: "right", format: "currency" },
  { key: "difference", label: "Difference", align: "right", format: "currency" },
];

export default function Gstr9() {
  useEffect(() => { document.title = "GSTR-9 / 9C — RD Pro"; }, []);
  const { business } = useBusiness();
  const now = new Date();
  const defaultFy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const [fyStartYear, setFyStartYear] = useState(defaultFy);

  const { data: annual, isLoading: loadingAnnual, isError: annualErrored, error: annualError } = useQuery({
    queryKey: ["gstr9-annual", business?.id, fyStartYear],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gst_report_annual_summary" as never, {
        _business_id: business!.id, _fy_start_year: fyStartYear,
      } as never);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: recon, isLoading: loadingRecon, isError: reconErrored, error: reconError } = useQuery({
    queryKey: ["gstr9c-recon", business?.id, fyStartYear],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gst_report_gstr9c_reconciliation" as never, {
        _business_id: business!.id, _fy_start_year: fyStartYear,
      } as never);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const summaryRows = (annual ?? []).map((r) => ({
    period: `${MONTHS[(r.period_month + 8) % 12]} ${r.period_year}`,
    sales_taxable: Math.round(r.sales_taxable), sales_tax: Math.round(r.sales_cgst + r.sales_sgst + r.sales_igst),
    purchase_taxable: Math.round(r.purchase_taxable), purchase_tax: Math.round(r.purchase_cgst + r.purchase_sgst + r.purchase_igst),
  }));

  const reconRows = (recon ?? []).map((r) => ({
    metric: r.metric, as_per_books: Math.round(r.as_per_books),
    as_per_filed_returns: Math.round(r.as_per_filed_returns), difference: Math.round(r.difference),
  }));

  const annualTotalSales = summaryRows.reduce((s, r) => s + r.sales_taxable, 0);
  const annualTotalPurchase = summaryRows.reduce((s, r) => s + r.purchase_taxable, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">GST</p>
          <h1 className="text-2xl font-bold mt-1">GSTR-9 / 9C Annual Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Month-wise annual summary (GSTR-9 style) and a books-vs-filed-returns reconciliation (GSTR-9C style).
            Not a substitute for the CA-certified 9C, which also reconciles against audited financial statements.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Financial Year (start)</Label>
          <Input type="number" className="w-28" value={fyStartYear} onChange={(e) => setFyStartYear(Number(e.target.value))} />
        </div>
      </div>

      <MockTablePage
        eyebrow="GSTR-9"
        title="Annual Summary"
        description={
          loadingAnnual
            ? "Loading…"
            : annualErrored
              ? `Could not load Annual Summary: ${(annualError as Error)?.message ?? "unknown error"}`
              : `FY ${fyStartYear}-${fyStartYear + 1} (Apr–Mar), month-wise from posted invoices.`
        }
        kpis={[
          { label: "Total Sales Taxable", value: `₹ ${annualTotalSales.toLocaleString("en-IN")}` },
          { label: "Total Purchase Taxable", value: `₹ ${annualTotalPurchase.toLocaleString("en-IN")}` },
        ]}
        columns={summaryColumns}
        rows={summaryRows}
        actions={
          <DocumentOutputCenter
            documentTypeId="gstr9"
            documentNumber={`gstr9-annual-${fyStartYear}`}
            getReportUdm={(): ReportUdm => ({
              kind: "report",
              documentTypeId: "gstr9",
              title: "GSTR-9 Annual Summary",
              subtitle: `FY ${fyStartYear}-${fyStartYear + 1}`,
              columns: summaryColumns,
              rows: summaryRows,
              pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
            })}
            disabled={loadingAnnual || annualErrored}
          />
        }
      />

      <MockTablePage
        eyebrow="GSTR-9C"
        title="Books vs Filed Returns Reconciliation"
        description={
          loadingRecon
            ? "Loading…"
            : reconErrored
              ? `Could not load Reconciliation: ${(reconError as Error)?.message ?? "unknown error"}`
              : "Compares recomputed book totals against the JSON payload of every filed/revised GSTR-1 for the year."
        }
        columns={reconColumns}
        rows={reconRows}
        actions={
          <DocumentOutputCenter
            documentTypeId="gstr9c_reconciliation"
            documentNumber={`gstr9c-reconciliation-${fyStartYear}`}
            getReportUdm={(): ReportUdm => ({
              kind: "report",
              documentTypeId: "gstr9c_reconciliation",
              title: "GSTR-9C Reconciliation",
              subtitle: `FY ${fyStartYear}-${fyStartYear + 1}`,
              columns: reconColumns,
              rows: reconRows,
              pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
            })}
            disabled={loadingRecon}
          />
        }
      />
    </div>
  );
}
