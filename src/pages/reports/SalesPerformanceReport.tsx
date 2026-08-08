import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchParties, fetchSegments, Party, Segment } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import {
  fetchSalesPerformanceReport, fetchSalesPerformanceInvoices,
  fetchSalesmanGroupsForFilter, fetchSalesmenForFilter,
  SalesPerformanceRow, SalesPerformanceInvoiceRow,
  SalesmanGroupLite, SalesmanLite,
  InvoiceStatusFilter, PaymentStatusFilter,
  fmtInr, fmtQty, fyStart,
} from "@/lib/salesPerformanceReport";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";

const UNASSIGNED = "__unassigned__";

type Totals = {
  bills: number; total_qty: number; gross_sales: number; discount: number;
  taxable_value: number; gst: number; net_sales: number; returns: number; net_revenue: number;
};

const zeroTotals = (): Totals => ({
  bills: 0, total_qty: 0, gross_sales: 0, discount: 0,
  taxable_value: 0, gst: 0, net_sales: 0, returns: 0, net_revenue: 0,
});

function addInto(t: Totals, r: Totals) {
  t.bills += Number(r.bills) || 0;
  t.total_qty += Number(r.total_qty) || 0;
  t.gross_sales += Number(r.gross_sales) || 0;
  t.discount += Number(r.discount) || 0;
  t.taxable_value += Number(r.taxable_value) || 0;
  t.gst += Number(r.gst) || 0;
  t.net_sales += Number(r.net_sales) || 0;
  t.returns += Number(r.returns) || 0;
  t.net_revenue += Number(r.net_revenue) || 0;
}

export default function SalesPerformanceReport() {
  const { user } = useAuth();
  const { business } = useBusiness();

  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [salesmanGroupId, setSalesmanGroupId] = useState<string>("");
  const [salesmanId, setSalesmanId] = useState<string>("");
  const [partyId, setPartyId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [invoiceStatus, setInvoiceStatus] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [productQuery, setProductQuery] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [productResults, setProductResults] = useState<Product[]>([]);

  const [groups, setGroups] = useState<SalesmanGroupLite[]>([]);
  const [salesmenAll, setSalesmenAll] = useState<SalesmanLite[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  const [rows, setRows] = useState<SalesPerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoicesByParty, setInvoicesByParty] = useState<Record<string, SalesPerformanceInvoiceRow[] | "loading">>({});

  useEffect(() => { document.title = "Sales Performance Report — RD Pro"; }, []);

  useEffect(() => {
    if (!business?.id || !user) return;
    fetchSalesmanGroupsForFilter(business.id).then(setGroups).catch(() => {});
    fetchSalesmenForFilter(business.id).then(setSalesmenAll).catch(() => {});
    fetchParties(user.id, "customer").then(setParties).catch(() => {});
    fetchSegments().then(setSegments).catch(() => {});
  }, [business?.id, user]);

  useEffect(() => {
    if (!user || !productQuery.trim()) { setProductResults([]); return; }
    const t = setTimeout(() => {
      searchProducts(user.id, productQuery, 8).then(setProductResults).catch(() => setProductResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [productQuery, user]);

  const salesmenForGroup = useMemo(
    () => salesmanGroupId ? salesmenAll.filter((s) => s.salesman_group_id === salesmanGroupId) : salesmenAll,
    [salesmenAll, salesmanGroupId],
  );

  const load = () => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchSalesPerformanceReport({
      businessId: business.id,
      fromDate, toDate,
      salesmanGroupId: salesmanGroupId || null,
      salesmanId: salesmanId || null,
      partyId: partyId || null,
      segmentId: segmentId || null,
      productId: productId || null,
      invoiceStatus: (invoiceStatus || null) as InvoiceStatusFilter | null,
      paymentStatus: (paymentStatus || null) as PaymentStatusFilter | null,
    })
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, fromDate, toDate, salesmanGroupId, salesmanId, partyId, segmentId, productId, invoiceStatus, paymentStatus]);

  // ── Build the Group -> Salesman -> Party tree from the flat RPC rows ──────
  const tree = useMemo(() => {
    type PartyNode = SalesPerformanceRow;
    type SalesmanNode = { id: string; name: string; totals: Totals; parties: PartyNode[] };
    type GroupNode = { id: string; name: string; totals: Totals; salesmen: Map<string, SalesmanNode> };

    const groupsMap = new Map<string, GroupNode>();
    for (const r of rows) {
      const gKey = r.salesman_group_id ?? UNASSIGNED;
      if (!groupsMap.has(gKey)) {
        groupsMap.set(gKey, { id: gKey, name: r.salesman_group_name, totals: zeroTotals(), salesmen: new Map() });
      }
      const g = groupsMap.get(gKey)!;
      addInto(g.totals, r as unknown as Totals);

      const sKey = r.salesman_id ?? UNASSIGNED;
      if (!g.salesmen.has(sKey)) {
        g.salesmen.set(sKey, { id: sKey, name: r.salesman_name, totals: zeroTotals(), parties: [] });
      }
      const s = g.salesmen.get(sKey)!;
      addInto(s.totals, r as unknown as Totals);
      s.parties.push(r);
    }
    return Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const grandTotal = useMemo(() => {
    const t = zeroTotals();
    for (const r of rows) addInto(t, r as unknown as Totals);
    return t;
  }, [rows]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadInvoices = (partyKey: string, gId: string, sId: string, pId: string) => {
    if (invoicesByParty[partyKey]) return;
    setInvoicesByParty((m) => ({ ...m, [partyKey]: "loading" }));
    fetchSalesPerformanceInvoices({
      businessId: business!.id,
      fromDate, toDate,
      salesmanGroupId: gId === UNASSIGNED ? null : gId,
      salesmanId: sId === UNASSIGNED ? null : sId,
      partyId: pId,
    })
      .then((data) => setInvoicesByParty((m) => ({ ...m, [partyKey]: data })))
      .catch(() => setInvoicesByParty((m) => ({ ...m, [partyKey]: [] })));
  };

  const reportColumns: UdmColumn[] = [
    { key: "salesman_group_name", label: "Group" },
    { key: "salesman_name", label: "Salesman" },
    { key: "party_name", label: "Party" },
    { key: "bills", label: "Bills", align: "right", format: "number" },
    { key: "total_qty", label: "Qty", align: "right", format: "number" },
    { key: "gross_sales", label: "Gross Sales", align: "right", format: "currency" },
    { key: "discount", label: "Discount", align: "right", format: "currency" },
    { key: "taxable_value", label: "Taxable Value", align: "right", format: "currency" },
    { key: "gst", label: "GST", align: "right", format: "currency" },
    { key: "net_sales", label: "Net Sales", align: "right", format: "currency" },
    { key: "returns", label: "Returns", align: "right", format: "currency" },
    { key: "net_revenue", label: "Net Revenue", align: "right", format: "currency" },
  ];

  const Cell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-3 py-2 text-right tabular-nums ${className}`}>{children}</td>
  );

  const totalsCells = (t: Totals, bold = false) => (
    <>
      <Cell className={bold ? "font-semibold" : ""}>{t.bills}</Cell>
      <Cell>{fmtQty(t.total_qty)}</Cell>
      <Cell>{fmtInr(t.gross_sales)}</Cell>
      <Cell className="text-rose-600">{fmtInr(t.discount)}</Cell>
      <Cell>{fmtInr(t.taxable_value)}</Cell>
      <Cell>{fmtInr(t.gst)}</Cell>
      <Cell className="font-medium">{fmtInr(t.net_sales)}</Cell>
      <Cell className="text-rose-600">{fmtInr(t.returns)}</Cell>
      <Cell className={`font-semibold ${bold ? "text-primary" : ""}`}>{fmtInr(t.net_revenue)}</Cell>
    </>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up p-4 md:p-0">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Sales Performance Report</h1>
          <p className="text-sm text-muted-foreground mt-1">Salesman Group → Salesman → Party → Invoice drill-down</p>
        </div>
        <DocumentOutputCenter
          documentTypeId="sales_performance_report"
          documentNumber="sales-performance-report"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "sales_performance_report",
            title: "Sales Performance Report",
            subtitle: `${fromDate} to ${toDate}`,
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

        <div className="w-44"><p className="text-xs text-muted-foreground mb-1">Salesman Group</p>
          <Select value={salesmanGroupId || "all"} onValueChange={(v) => { setSalesmanGroupId(v === "all" ? "" : v); setSalesmanId(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-44"><p className="text-xs text-muted-foreground mb-1">Salesman</p>
          <Select value={salesmanId || "all"} onValueChange={(v) => setSalesmanId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salesmen</SelectItem>
              {salesmenForGroup.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-48"><p className="text-xs text-muted-foreground mb-1">Party</p>
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

        <div className="w-48 relative"><p className="text-xs text-muted-foreground mb-1">Product</p>
          <Input
            value={productQuery}
            placeholder="Search product…"
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
              Clear product filter
            </button>
          )}
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

        <div className="w-36"><p className="text-xs text-muted-foreground mb-1">Payment Status</p>
          <Select value={paymentStatus || "all"} onValueChange={(v) => setPaymentStatus(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Bills", grandTotal.bills.toLocaleString("en-IN")],
          ["Total Qty", fmtQty(grandTotal.total_qty)],
          ["Gross Sales", fmtInr(grandTotal.gross_sales)],
          ["Discount", fmtInr(grandTotal.discount)],
          ["Taxable Value", fmtInr(grandTotal.taxable_value)],
          ["GST", fmtInr(grandTotal.gst)],
          ["Net Sales", fmtInr(grandTotal.net_sales)],
          ["Returns", fmtInr(grandTotal.returns)],
          ["Net Revenue", fmtInr(grandTotal.net_revenue)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {/* ── Drill-down tree ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Group / Salesman / Party</th>
                <th className="px-3 py-3 text-right">Bills</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Gross Sales</th>
                <th className="px-3 py-3 text-right">Discount</th>
                <th className="px-3 py-3 text-right">Taxable</th>
                <th className="px-3 py-3 text-right">GST</th>
                <th className="px-3 py-3 text-right">Net Sales</th>
                <th className="px-3 py-3 text-right">Returns</th>
                <th className="px-3 py-3 text-right">Net Revenue</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
              ) : tree.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No sales in this range.</td></tr>
              ) : tree.map((g) => {
                const gKey = `g:${g.id}`;
                const gOpen = expanded.has(gKey);
                return (
                  <Fragment key={gKey}>
                    <tr className="border-t border-border bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => toggle(gKey)}>
                      <td className="px-3 py-2 font-semibold flex items-center gap-1.5">
                        {gOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {g.id === UNASSIGNED ? <span className="text-muted-foreground italic">{g.name}</span> : g.name}
                      </td>
                      {totalsCells(g.totals, true)}
                    </tr>
                    {gOpen && Array.from(g.salesmen.values()).sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
                      const sKey = `s:${g.id}:${s.id}`;
                      const sOpen = expanded.has(sKey);
                      return (
                        <Fragment key={sKey}>
                          <tr className="border-t border-border/60 hover:bg-muted/10 cursor-pointer" onClick={() => toggle(sKey)}>
                            <td className="px-3 py-2 pl-8 font-medium flex items-center gap-1.5">
                              {sOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {s.id === UNASSIGNED ? <span className="text-muted-foreground italic">{s.name}</span> : s.name}
                            </td>
                            {totalsCells(s.totals)}
                          </tr>
                          {sOpen && s.parties.sort((a, b) => a.party_name.localeCompare(b.party_name)).map((pr) => {
                            const pKey = `p:${g.id}:${s.id}:${pr.party_id}`;
                            const pOpen = expanded.has(pKey);
                            return (
                              <Fragment key={pKey}>
                                <tr
                                  className="border-t border-border/40 hover:bg-muted/10 cursor-pointer"
                                  onClick={() => { toggle(pKey); if (!pOpen) loadInvoices(pKey, g.id, s.id, pr.party_id); }}
                                >
                                  <td className="px-3 py-2 pl-14 text-muted-foreground flex items-center gap-1.5">
                                    {pOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    {pr.party_name}
                                  </td>
                                  {totalsCells(pr as unknown as Totals)}
                                </tr>
                                {pOpen && (
                                  <tr key={`${pKey}-inv`}>
                                    <td colSpan={10} className="px-3 pl-20 py-2 bg-muted/5">
                                      {invoicesByParty[pKey] === "loading" || !invoicesByParty[pKey] ? (
                                        <div className="text-xs text-muted-foreground py-1">Loading invoices…</div>
                                      ) : (invoicesByParty[pKey] as SalesPerformanceInvoiceRow[]).length === 0 ? (
                                        <div className="text-xs text-muted-foreground py-1">No invoices.</div>
                                      ) : (
                                        <table className="w-full text-xs">
                                          <thead className="text-muted-foreground">
                                            <tr>
                                              <th className="text-left py-1 pr-3">Invoice #</th>
                                              <th className="text-left py-1 pr-3">Date</th>
                                              <th className="text-left py-1 pr-3">Status</th>
                                              <th className="text-left py-1 pr-3">Payment</th>
                                              <th className="text-right py-1 pr-3">Qty</th>
                                              <th className="text-right py-1 pr-3">Taxable</th>
                                              <th className="text-right py-1 pr-3">GST</th>
                                              <th className="text-right py-1 pr-3">Net Sales</th>
                                              <th className="text-right py-1 pr-3">Returns</th>
                                              <th className="text-right py-1">Net Revenue</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(invoicesByParty[pKey] as SalesPerformanceInvoiceRow[]).map((inv) => (
                                              <tr key={inv.invoice_id} className="border-t border-border/30">
                                                <td className="py-1 pr-3 font-mono">{inv.invoice_number}</td>
                                                <td className="py-1 pr-3">{inv.invoice_date}</td>
                                                <td className="py-1 pr-3 capitalize">{inv.status}</td>
                                                <td className="py-1 pr-3 capitalize">{inv.payment_status}</td>
                                                <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(inv.qty)}</td>
                                                <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.taxable_value)}</td>
                                                <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.gst)}</td>
                                                <td className="py-1 pr-3 text-right tabular-nums">{fmtInr(inv.net_sales)}</td>
                                                <td className="py-1 pr-3 text-right tabular-nums text-rose-600">{fmtInr(inv.returns)}</td>
                                                <td className="py-1 text-right tabular-nums font-medium">{fmtInr(inv.net_revenue)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                <tr>
                  <td className="px-3 py-3">Grand Total</td>
                  {totalsCells(grandTotal, true)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
