import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchParties, fetchSegments, Party, Segment } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { fetchSalesmenForFilter, SalesmanLite } from "@/lib/salesPerformanceReport";
import {
  fetchPartyPartSalesSummary, fetchPartyPartSalesInvoices,
  PartyPartSalesRow, PartyPartSalesInvoiceRow, InvoiceStatusFilter,
  fmtInr, fmtQty, fmtPct, fyStart,
} from "@/lib/partyPartSalesReport";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";

type Totals = { qty: number; taxable_value: number; gst: number; total: number };
const zeroTotals = (): Totals => ({ qty: 0, taxable_value: 0, gst: 0, total: 0 });

export default function PartyPartSalesReport() {
  const { user } = useAuth();
  const { business } = useBusiness();

  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [showRateHistory, setShowRateHistory] = useState(false);

  const [parties, setParties] = useState<Party[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [salesmen, setSalesmen] = useState<SalesmanLite[]>([]);

  const [rows, setRows] = useState<PartyPartSalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoicesByPart, setInvoicesByPart] = useState<Record<string, PartyPartSalesInvoiceRow[] | "loading">>({});

  useEffect(() => { document.title = "Party Part-wise Sales Report — RD Pro"; }, []);

  useEffect(() => {
    if (!business?.id || !user) return;
    fetchParties(user.id, "customer").then(setParties).catch(() => {});
    fetchSegments().then(setSegments).catch(() => {});
    fetchSalesmenForFilter(business.id).then(setSalesmen).catch(() => {});
  }, [business?.id, user]);

  useEffect(() => {
    if (!user || !productQuery.trim()) { setProductResults([]); return; }
    const t = setTimeout(() => {
      searchProducts(user.id, productQuery, 8).then(setProductResults).catch(() => setProductResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [productQuery, user]);

  const load = () => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchPartyPartSalesSummary({
      businessId: business.id,
      fromDate, toDate,
      partyId: partyId || null,
      segmentId: segmentId || null,
      productId: productId || null,
      salesmanId: salesmanId || null,
      invoiceStatus: (invoiceStatus || null) as InvoiceStatusFilter | null,
    })
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    setExpanded(new Set());
    setInvoicesByPart({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, fromDate, toDate, partyId, segmentId, productId, salesmanId, invoiceStatus]);

  const kpis = useMemo(() => {
    const t = zeroTotals();
    for (const r of rows) {
      t.qty += Number(r.qty) || 0;
      t.taxable_value += Number(r.taxable_value) || 0;
      t.gst += Number(r.gst) || 0;
      t.total += Number(r.total) || 0;
    }
    return { totalParts: rows.length, ...t };
  }, [rows]);

  const toggleRow = (partNumber: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) next.delete(partNumber); else next.add(partNumber);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(rows.map((r) => r.part_number)));
    rows.forEach((r) => loadInvoices(r.part_number));
  };

  const collapseAll = () => setExpanded(new Set());

  const loadInvoices = (partNumber: string) => {
    if (invoicesByPart[partNumber]) return;
    setInvoicesByPart((m) => ({ ...m, [partNumber]: "loading" }));
    fetchPartyPartSalesInvoices({
      businessId: business!.id,
      partNumber,
      fromDate, toDate,
      partyId: partyId || null,
      salesmanId: salesmanId || null,
      invoiceStatus: (invoiceStatus || null) as InvoiceStatusFilter | null,
    })
      .then((data) => setInvoicesByPart((m) => ({ ...m, [partNumber]: data })))
      .catch(() => setInvoicesByPart((m) => ({ ...m, [partNumber]: [] })));
  };

  // Rate History: group a part's drill-down invoices by net_rate, with the
  // date range and total qty each rate was in effect for.
  const rateHistoryOf = (invoices: PartyPartSalesInvoiceRow[]) => {
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
  };

  const reportColumns: UdmColumn[] = [
    { key: "part_number", label: "Part No." },
    { key: "description", label: "Description" },
    { key: "qty", label: "Qty", align: "right", format: "number" },
    { key: "avg_mrp", label: "MRP", align: "right", format: "currency" },
    { key: "avg_rate", label: "Billed Rate", align: "right", format: "currency" },
    { key: "avg_discount_pct", label: "Discount %", align: "right", format: "number" },
    { key: "avg_net_rate", label: "Net Rate", align: "right", format: "currency" },
    { key: "taxable_value", label: "Taxable Value", align: "right", format: "currency" },
    { key: "gst", label: "GST", align: "right", format: "currency" },
    { key: "total", label: "Total", align: "right", format: "currency" },
  ];

  const partyLabel = parties.find((p) => p.id === partyId)?.name;

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up p-4 md:p-0">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Party Part-wise Sales Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {partyLabel ? `${partyLabel} — ` : ""}Part-wise sales with rate/discount breakdown, drill-down to invoices
          </p>
        </div>
        <DocumentOutputCenter
          documentTypeId="party_part_sales_report"
          documentNumber="party-part-sales-report"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "party_part_sales_report",
            title: "Party Part-wise Sales Report",
            subtitle: `${partyLabel ?? "All Parties"} — ${fromDate} to ${toDate}`,
            columns: reportColumns,
            rows,
            pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={rows.length === 0}
        />
      </header>

      {/* ── Filters ── */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div><p className="text-xs text-muted-foreground mb-1">From</p><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">To</p><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" /></div>

        <div className="w-52"><p className="text-xs text-muted-foreground mb-1">Party</p>
          <Select value={partyId || "all"} onValueChange={(v) => setPartyId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All Parties</SelectItem>
              {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40"><p className="text-xs text-muted-foreground mb-1">Segment</p>
          <Select value={segmentId || "all"} onValueChange={(v) => setSegmentId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Segments</SelectItem>
              {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-48 relative"><p className="text-xs text-muted-foreground mb-1">Part Number / Product</p>
          <Input
            value={productQuery}
            placeholder="Search part…"
            onChange={(e) => { setProductQuery(e.target.value); setProductId(""); }}
          />
          {productQuery && !productId && productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60"
                  onClick={() => { setProductId(p.id); setProductQuery(p.name); setProductResults([]); }}
                >
                  {p.name} <span className="text-muted-foreground text-xs">{p.part_number}</span>
                </button>
              ))}
            </div>
          )}
          {productId && (
            <button className="text-xs text-muted-foreground underline mt-1" onClick={() => { setProductId(""); setProductQuery(""); }}>
              Clear
            </button>
          )}
        </div>

        <div className="w-44"><p className="text-xs text-muted-foreground mb-1">Salesman</p>
          <Select value={salesmanId || "all"} onValueChange={(v) => setSalesmanId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salesmen</SelectItem>
              {salesmen.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36"><p className="text-xs text-muted-foreground mb-1">Invoice Status</p>
          <Select value={invoiceStatus || "all"} onValueChange={(v) => setInvoiceStatus(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch checked={showRateHistory} onCheckedChange={setShowRateHistory} id="rate-history" />
          <label htmlFor="rate-history" className="text-sm flex items-center gap-1 cursor-pointer">
            <History className="h-3.5 w-3.5" /> Show Rate History
          </label>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total Parts", kpis.totalParts.toLocaleString("en-IN")],
          ["Total Quantity", fmtQty(kpis.qty)],
          ["Total Taxable Value", fmtInr(kpis.taxable_value)],
          ["Total GST", fmtInr(kpis.gst)],
          ["Grand Total", fmtInr(kpis.total)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {/* ── Part-wise table ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <p className="text-xs text-muted-foreground">{rows.length} part{rows.length === 1 ? "" : "s"}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={expandAll} disabled={rows.length === 0}>Expand All</Button>
            <Button size="sm" variant="outline" onClick={collapseAll} disabled={expanded.size === 0}>Collapse All</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Part No. / Description</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">MRP</th>
                <th className="px-3 py-3 text-right">Billed Rate</th>
                <th className="px-3 py-3 text-right">Discount</th>
                <th className="px-3 py-3 text-right">Net Rate</th>
                <th className="px-3 py-3 text-right">Taxable Value</th>
                <th className="px-3 py-3 text-right">GST</th>
                <th className="px-3 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No sales in this range.</td></tr>
              ) : rows.map((r) => {
                const isOpen = expanded.has(r.part_number);
                const invoices = invoicesByPart[r.part_number];
                return (
                  <Fragment key={r.part_number}>
                    <tr
                      className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      onClick={() => { toggleRow(r.part_number); if (!isOpen) loadInvoices(r.part_number); }}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                          <span className="font-semibold">{r.part_number}</span>
                          {r.distinct_rate_count > 1 && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              {r.distinct_rate_count} rates
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground pl-5">{r.description ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.avg_mrp)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.avg_rate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-600">{fmtPct(r.avg_discount_pct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.avg_net_rate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.taxable_value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInr(r.gst)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{fmtInr(r.total)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="px-3 pl-10 py-3 bg-muted/5">
                          {invoices === "loading" || !invoices ? (
                            <div className="text-xs text-muted-foreground py-1">Loading invoices…</div>
                          ) : invoices.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-1">No invoices.</div>
                          ) : (
                            <div className="space-y-3">
                              {showRateHistory && rateHistoryOf(invoices).length > 1 && (
                                <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-2">
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
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="text-left py-1 pr-3">Date</th>
                                    <th className="text-left py-1 pr-3">Invoice No.</th>
                                    <th className="text-right py-1 pr-3">Qty</th>
                                    <th className="text-right py-1 pr-3">MRP</th>
                                    <th className="text-right py-1 pr-3">Rate</th>
                                    <th className="text-right py-1 pr-3">Discount</th>
                                    <th className="text-right py-1 pr-3">Net Rate</th>
                                    <th className="text-right py-1">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoices.map((inv) => (
                                    <tr key={inv.invoice_id} className="border-t border-border/30">
                                      <td className="py-1 pr-3">{inv.invoice_date}</td>
                                      <td className="py-1 pr-3 font-mono">{inv.invoice_number}</td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(inv.qty)}</td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.mrp)}</td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.rate)}</td>
                                      <td className="py-1 pr-3 text-right tabular-nums text-rose-600">{fmtPct(inv.discount_pct)}</td>
                                      <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.net_rate)}</td>
                                      <td className="py-1 text-right tabular-nums font-medium">{fmtInr(inv.amount)}</td>
                                    </tr>
                                  ))}
                                  <tr className="border-t-2 border-border font-semibold">
                                    <td className="py-1 pr-3" colSpan={2}>Total</td>
                                    <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(invoices.reduce((s, i) => s + Number(i.qty), 0))}</td>
                                    <td colSpan={3} />
                                    <td className="py-1 pr-3" />
                                    <td className="py-1 text-right tabular-nums">{fmtInr(invoices.reduce((s, i) => s + Number(i.amount), 0))}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
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
    </div>
  );
}
