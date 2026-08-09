import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { fetchSalesmanPartiesForOrder } from "@/lib/salesmanPortal/parties";
import {
  fetchSalesmanPartyPartSales, fetchSalesmanPartyPartInvoices,
  type SalesmanPartyPartInvoiceRow,
} from "@/lib/salesmanPortal/partyPartSales";
import { salesDateRangeForPreset, type SalesDatePreset } from "@/lib/salesmanPortal/dateRange";
import { fmtInr, fmtQty, fmtPct } from "@/lib/partyPartSalesReport";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";

const PRESETS: { value: SalesDatePreset; label: string }[] = [
  { value: "month", label: "This Month" },
  { value: "fy", label: "This FY" },
  { value: "week", label: "This Week" },
  { value: "today", label: "Today" },
];

function rateHistoryOf(invoices: SalesmanPartyPartInvoiceRow[]) {
  const byRate = new Map<number, { rate: number; qty: number; from: string; to: string; count: number }>();
  for (const inv of invoices) {
    const r = Number(inv.net_rate);
    const entry = byRate.get(r) ?? { rate: r, qty: 0, from: inv.invoice_date, to: inv.invoice_date, count: 0 };
    entry.qty += Number(inv.qty) || 0;
    entry.count += 1;
    if (inv.invoice_date < entry.from) entry.from = inv.invoice_date;
    if (inv.invoice_date > entry.to) entry.to = inv.invoice_date;
    byRate.set(r, entry);
  }
  return Array.from(byRate.values()).sort((a, b) => a.from.localeCompare(b.from));
}

export default function SalesmanPartyProductSales() {
  useEffect(() => { document.title = "Party-wise Product Sales — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const [preset, setPreset] = useState<SalesDatePreset>("month");
  const [partyId, setPartyId] = useState("");
  const [showRateHistory, setShowRateHistory] = useState(false);
  const { from, to } = salesDateRangeForPreset(preset);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoicesByPart, setInvoicesByPart] = useState<Record<string, SalesmanPartyPartInvoiceRow[] | "loading">>({});

  const { data: parties = [] } = useQuery({
    queryKey: ["salesman-portal-order-parties", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanPartiesForOrder(salesmanId!, businessId!),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["salesman-portal-party-part-sales", salesmanId, from, to, partyId],
    enabled: !!salesmanId,
    queryFn: () => fetchSalesmanPartyPartSales({ fromDate: from, toDate: to, partyId: partyId || null }),
  });

  useEffect(() => { setExpanded(new Set()); setInvoicesByPart({}); }, [from, to, partyId]);

  const toggle = (partNumber: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) next.delete(partNumber); else next.add(partNumber);
      return next;
    });
    if (!invoicesByPart[partNumber]) {
      setInvoicesByPart((m) => ({ ...m, [partNumber]: "loading" }));
      fetchSalesmanPartyPartInvoices({ partNumber, fromDate: from, toDate: to, partyId: partyId || null })
        .then((data) => setInvoicesByPart((m) => ({ ...m, [partNumber]: data })))
        .catch(() => setInvoicesByPart((m) => ({ ...m, [partNumber]: [] })));
    }
  };

  const partyLabel = parties.find((p) => p.id === partyId)?.name;

  const reportColumns: UdmColumn[] = [
    { key: "part_number", label: "Part No." },
    { key: "description", label: "Description" },
    { key: "qty", label: "Qty", align: "right", format: "number" },
    { key: "avg_net_rate", label: "Net Rate", align: "right", format: "currency" },
    { key: "taxable_value", label: "Taxable", align: "right", format: "currency" },
    { key: "gst", label: "GST", align: "right", format: "currency" },
    { key: "total", label: "Total", align: "right", format: "currency" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Party-wise Product Sales</h1>
          {partyLabel && <p className="text-sm text-muted-foreground">{partyLabel}</p>}
        </div>
        <DocumentOutputCenter
          documentTypeId="party_part_sales_report"
          documentNumber="my-party-part-sales"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "party_part_sales_report",
            title: "Party-wise Product Sales",
            subtitle: `${partyLabel ?? "All Parties"} — ${from} to ${to}`,
            columns: reportColumns,
            rows,
            pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={rows.length === 0}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
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
        <div className="flex items-center gap-1.5">
          <Switch checked={showRateHistory} onCheckedChange={setShowRateHistory} id="rate-history" />
          <label htmlFor="rate-history" className="text-xs flex items-center gap-1 cursor-pointer text-muted-foreground">
            <History className="h-3 w-3" /> Rate History
          </label>
        </div>
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
                    <th className="px-3 py-2.5 text-left">Part No. / Description</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Net Rate</th>
                    <th className="px-3 py-2.5 text-right">Taxable</th>
                    <th className="px-3 py-2.5 text-right">GST</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded.has(r.part_number);
                    const invoices = invoicesByPart[r.part_number];
                    return (
                      <Fragment key={r.part_number}>
                        <tr className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => toggle(r.part_number)}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                              <span className="font-semibold">{r.part_number}</span>
                              {r.distinct_rate_count > 1 && (
                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">{r.distinct_rate_count} rates</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground pl-5">{r.description ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.avg_net_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.taxable_value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.gst)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{fmtInr(r.total)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="px-3 pl-9 py-3 bg-muted/5">
                              <PartDrillDown invoices={invoices} showRateHistory={showRateHistory} />
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
              const isOpen = expanded.has(r.part_number);
              const invoices = invoicesByPart[r.part_number];
              return (
                <div key={r.part_number} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button className="w-full text-left p-3" onClick={() => toggle(r.part_number)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-semibold truncate">{r.part_number}</span>
                        {r.distinct_rate_count > 1 && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 shrink-0">{r.distinct_rate_count} rates</Badge>
                        )}
                      </div>
                      <span className="font-semibold text-primary shrink-0">{fmtInr(r.total)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 pl-5 truncate">{r.description ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                      {fmtQty(r.qty)} qty · Net Rate {fmtInr(r.avg_net_rate)} · GST {fmtInr(r.gst)}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 bg-muted/5">
                      <PartDrillDown invoices={invoices} showRateHistory={showRateHistory} />
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

function PartDrillDown({ invoices, showRateHistory }: { invoices: SalesmanPartyPartInvoiceRow[] | "loading" | undefined; showRateHistory: boolean }) {
  if (invoices === "loading" || !invoices) {
    return <div className="text-xs text-muted-foreground py-1">Loading invoices…</div>;
  }
  if (invoices.length === 0) {
    return <div className="text-xs text-muted-foreground py-1">No invoices.</div>;
  }
  return (
    <div className="space-y-3">
      {showRateHistory && rateHistoryOf(invoices).length > 1 && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-2 overflow-x-auto">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
            <History className="h-3 w-3" /> Rate History
          </p>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-0.5 pr-3">Rate</th>
                <th className="text-left py-0.5 pr-3">From</th>
                <th className="text-left py-0.5 pr-3">To</th>
                <th className="text-right py-0.5 pr-3">Qty</th>
                <th className="text-right py-0.5">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {rateHistoryOf(invoices).map((rh) => (
                <tr key={rh.rate} className="border-t border-amber-300/30">
                  <td className="py-0.5 pr-3 font-medium">{fmtInr(rh.rate)}</td>
                  <td className="py-0.5 pr-3">{rh.from}</td>
                  <td className="py-0.5 pr-3">{rh.to}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{fmtQty(rh.qty)}</td>
                  <td className="py-0.5 text-right tabular-nums">{rh.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-left py-1 pr-3">Invoice No.</th>
              <th className="text-right py-1 pr-3">Qty</th>
              <th className="text-right py-1 pr-3">Rate</th>
              <th className="text-right py-1 pr-3">Discount</th>
              <th className="text-right py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.invoice_id} className="border-t border-border/30">
                <td className="py-1 pr-3">{inv.invoice_date}</td>
                <td className="py-1 pr-3 font-mono">{inv.invoice_number}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(inv.qty)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.net_rate)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-rose-600">{fmtPct(inv.discount_pct)}</td>
                <td className="py-1 text-right tabular-nums font-medium">{fmtInr(inv.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
