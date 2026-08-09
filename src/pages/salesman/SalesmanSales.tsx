import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Package } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { fetchSalesmanPartiesForOrder } from "@/lib/salesmanPortal/parties";
import {
  fetchSalesmanSalesReport, fetchSalesmanSalesInvoices,
  type SalesmanSalesInvoiceRow,
} from "@/lib/salesmanPortal/salesReport";
import { salesDateRangeForPreset, type SalesDatePreset } from "@/lib/salesmanPortal/dateRange";
import { fmtInr, fmtQty } from "@/lib/partyPartSalesReport";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";

const PRESETS: { value: SalesDatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "fy", label: "This FY" },
];

export default function SalesmanSales() {
  useEffect(() => { document.title = "Sales — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const [preset, setPreset] = useState<SalesDatePreset>("month");
  const [partyId, setPartyId] = useState("");
  const { from, to } = salesDateRangeForPreset(preset);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoicesByParty, setInvoicesByParty] = useState<Record<string, SalesmanSalesInvoiceRow[] | "loading">>({});

  const { data: parties = [] } = useQuery({
    queryKey: ["salesman-portal-order-parties", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanPartiesForOrder(salesmanId!, businessId!),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["salesman-portal-sales-report", salesmanId, from, to, partyId],
    enabled: !!salesmanId,
    queryFn: () => fetchSalesmanSalesReport({ fromDate: from, toDate: to, partyId: partyId || null }),
  });

  useEffect(() => { setExpanded(new Set()); setInvoicesByParty({}); }, [from, to, partyId]);

  const totals = useMemo(() => {
    const t = { bills: 0, qty: 0, gross: 0, discount: 0, taxable: 0, gst: 0, net: 0 };
    for (const r of rows) {
      t.bills += Number(r.bills) || 0;
      t.qty += Number(r.total_qty) || 0;
      t.gross += Number(r.gross_sales) || 0;
      t.discount += Number(r.discount) || 0;
      t.taxable += Number(r.taxable_value) || 0;
      t.gst += Number(r.gst) || 0;
      t.net += Number(r.net_revenue) || 0;
    }
    return t;
  }, [rows]);

  const toggle = (key: string, id: string | null) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    if (!invoicesByParty[key]) {
      setInvoicesByParty((m) => ({ ...m, [key]: "loading" }));
      fetchSalesmanSalesInvoices({ fromDate: from, toDate: to, partyId: id })
        .then((data) => setInvoicesByParty((m) => ({ ...m, [key]: data })))
        .catch(() => setInvoicesByParty((m) => ({ ...m, [key]: [] })));
    }
  };

  const reportColumns: UdmColumn[] = [
    { key: "party_name", label: "Party" },
    { key: "bills", label: "Bills", align: "right", format: "number" },
    { key: "total_qty", label: "Qty", align: "right", format: "number" },
    { key: "gross_sales", label: "Gross", align: "right", format: "currency" },
    { key: "discount", label: "Discount", align: "right", format: "currency" },
    { key: "taxable_value", label: "Taxable", align: "right", format: "currency" },
    { key: "gst", label: "GST", align: "right", format: "currency" },
    { key: "net_revenue", label: "Net Revenue", align: "right", format: "currency" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Sales</h1>
          <Link to="/salesman/party-sales" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            <Package className="h-3 w-3" /> View by product
          </Link>
        </div>
        <DocumentOutputCenter
          documentTypeId="sales_performance_report"
          documentNumber="my-sales-report"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "sales_performance_report",
            title: "Sales Report",
            subtitle: `${from} to ${to}`,
            columns: reportColumns,
            rows,
            pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={rows.length === 0}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border p-0.5 bg-muted/40">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${preset === p.value ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Select value={partyId || "all"} onValueChange={(v) => setPartyId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All Parties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Parties</SelectItem>
            {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Bills", totals.bills.toLocaleString("en-IN")],
          ["Qty", fmtQty(totals.qty)],
          ["Taxable", fmtInr(totals.taxable)],
          ["Net Revenue", fmtInr(totals.net)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><LoadingSpinner size="sm" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">No sales in this range.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Party</th>
                    <th className="px-3 py-2.5 text-right">Bills</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Taxable</th>
                    <th className="px-3 py-2.5 text-right">GST</th>
                    <th className="px-3 py-2.5 text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = r.party_id ?? "unassigned";
                    const isOpen = expanded.has(key);
                    const invoices = invoicesByParty[key];
                    return (
                      <Fragment key={key}>
                        <tr className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => toggle(key, r.party_id)}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                              <span className="font-medium">{r.party_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.bills}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.total_qty)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.taxable_value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.gst)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{fmtInr(r.net_revenue)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="px-3 pl-9 py-3 bg-muted/5">
                              <InvoiceDrillTable invoices={invoices} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r) => {
              const key = r.party_id ?? "unassigned";
              const isOpen = expanded.has(key);
              const invoices = invoicesByParty[key];
              return (
                <div key={key} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button className="w-full text-left p-3" onClick={() => toggle(key, r.party_id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium truncate">{r.party_name}</span>
                      </div>
                      <span className="font-semibold text-primary shrink-0">{fmtInr(r.net_revenue)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 pl-5">
                      {r.bills} bills · {fmtQty(r.total_qty)} qty · Taxable {fmtInr(r.taxable_value)} · GST {fmtInr(r.gst)}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 bg-muted/5">
                      <InvoiceDrillTable invoices={invoices} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function InvoiceDrillTable({ invoices }: { invoices: SalesmanSalesInvoiceRow[] | "loading" | undefined }) {
  if (invoices === "loading" || !invoices) {
    return <div className="text-xs text-muted-foreground py-1">Loading invoices…</div>;
  }
  if (invoices.length === 0) {
    return <div className="text-xs text-muted-foreground py-1">No invoices.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left py-1 pr-3">Date</th>
            <th className="text-left py-1 pr-3">Invoice No.</th>
            <th className="text-right py-1 pr-3">Qty</th>
            <th className="text-right py-1 pr-3">Taxable</th>
            <th className="text-right py-1 pr-3">GST</th>
            <th className="text-right py-1">Net</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.invoice_id} className="border-t border-border/30">
              <td className="py-1 pr-3">{inv.invoice_date}</td>
              <td className="py-1 pr-3 font-mono">{inv.invoice_number}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(inv.qty)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.taxable_value)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.gst)}</td>
              <td className="py-1 text-right tabular-nums font-medium">{fmtInr(inv.net_revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
