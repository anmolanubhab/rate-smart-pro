import { Fragment, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  fetchSalesmanPartyDetail, fetchSalesmanPartyInvoices, fetchSalesmanPartyOrders,
} from "@/lib/salesmanPortal/parties";
import {
  fetchSalesmanPartyPartSales, fetchSalesmanPartyPartInvoices,
  type SalesmanPartyPartInvoiceRow,
} from "@/lib/salesmanPortal/partyPartSales";
import { fmtInr, fmtQty, fyStart } from "@/lib/partyPartSalesReport";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "paid" || status === "completed" || status === "posted" ? "bg-emerald-100 text-emerald-700" :
    status === "cancelled" ? "bg-red-100 text-red-700" :
    "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tone}`}>{status}</span>;
}

type DocRow = { id: string; number: string; date: string; amount: number; status: string };

function DocumentListTable({ rows, numberLabel }: { rows: DocRow[]; numberLabel: string }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border bg-card shadow-sm overflow-x-auto mt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2.5">{numberLabel}</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.number}</td>
                <td className="px-4 py-2.5">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-2.5 text-right">{inr(r.amount)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2 mt-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card shadow-sm p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.number}</span>
              <span className="font-semibold">{inr(r.amount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString("en-IN")}</span>
              <StatusBadge status={r.status} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductPurchaseHistory({ partyId }: { partyId: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoicesByPart, setInvoicesByPart] = useState<Record<string, SalesmanPartyPartInvoiceRow[] | "loading">>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["salesman-portal-party-product-history", partyId],
    queryFn: () => fetchSalesmanPartyPartSales({ fromDate: fyStart(), partyId }),
  });

  const toggle = (partNumber: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) next.delete(partNumber); else next.add(partNumber);
      return next;
    });
    if (!invoicesByPart[partNumber]) {
      setInvoicesByPart((m) => ({ ...m, [partNumber]: "loading" }));
      fetchSalesmanPartyPartInvoices({ partNumber, fromDate: fyStart(), partyId })
        .then((data) => setInvoicesByPart((m) => ({ ...m, [partNumber]: data })))
        .catch(() => setInvoicesByPart((m) => ({ ...m, [partNumber]: [] })));
    }
  };

  if (isLoading) return <div className="flex justify-center py-10"><LoadingSpinner size="sm" /></div>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No purchases yet this financial year.</p>;

  const drillDown = (partNumber: string) => {
    const invoices = invoicesByPart[partNumber];
    if (invoices === "loading" || !invoices) return <div className="text-xs text-muted-foreground py-1">Loading invoices…</div>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-left py-1 pr-3">Invoice No.</th>
              <th className="text-right py-1 pr-3">Qty</th>
              <th className="text-right py-1 pr-3">Rate</th>
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
                <td className="py-1 text-right tabular-nums font-medium">{fmtInr(inv.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border bg-card shadow-sm overflow-x-auto mt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2.5">Part Number</th>
              <th className="px-4 py-2.5 text-right">Total Qty</th>
              <th className="px-4 py-2.5 text-right">Total Amount</th>
              <th className="px-4 py-2.5">Last Purchase</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = expanded.has(r.part_number);
              const invoices = invoicesByPart[r.part_number];
              const lastDate = invoices && invoices !== "loading" && invoices.length > 0
                ? invoices[invoices.length - 1].invoice_date : null;
              return (
                <Fragment key={r.part_number}>
                  <tr className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => toggle(r.part_number)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        {r.part_number}
                      </div>
                      <div className="text-xs text-muted-foreground pl-5">{r.description ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmtQty(r.qty)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmtInr(r.total)}</td>
                    <td className="px-4 py-2.5">{lastDate ?? (isOpen ? "—" : "")}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4} className="px-4 pl-9 py-3 bg-muted/5">{drillDown(r.part_number)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2 mt-3">
        {rows.map((r) => {
          const isOpen = expanded.has(r.part_number);
          const invoices = invoicesByPart[r.part_number];
          const lastDate = invoices && invoices !== "loading" && invoices.length > 0
            ? invoices[invoices.length - 1].invoice_date : null;
          return (
            <div key={r.part_number} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <button className="w-full text-left p-3" onClick={() => toggle(r.part_number)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 font-medium">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{r.part_number}</span>
                  </div>
                  <span className="font-semibold shrink-0">{fmtInr(r.total)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 pl-5 truncate">{r.description ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                  {fmtQty(r.qty)} qty{lastDate ? ` · Last purchase ${lastDate}` : ""}
                </div>
              </button>
              {isOpen && <div className="px-3 pb-3 bg-muted/5">{drillDown(r.part_number)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function SalesmanPartyDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: party, isLoading: partyLoading } = useQuery({
    queryKey: ["salesman-portal-party-detail", id],
    enabled: !!id,
    queryFn: () => fetchSalesmanPartyDetail(id!),
  });

  useEffect(() => { document.title = party ? `${party.name} — Salesman Portal` : "Party — Salesman Portal"; }, [party]);

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["salesman-portal-party-invoices", id],
    enabled: !!id,
    queryFn: () => fetchSalesmanPartyInvoices(id!),
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["salesman-portal-party-orders", id],
    enabled: !!id,
    queryFn: () => fetchSalesmanPartyOrders(id!),
  });

  if (partyLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>;
  }

  if (!party) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">Party not found, or not assigned to you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{party.name}</h1>
        <p className="text-sm text-muted-foreground">{party.phone ?? "—"} {party.city ? `· ${party.city}` : ""}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="font-semibold mt-0.5">{inr(party.outstanding_balance)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">Credit Limit</div>
          <div className="font-semibold mt-0.5">{inr(party.credit_limit)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">Credit Days</div>
          <div className="font-semibold mt-0.5">{party.credit_days}</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">Email</div>
          <div className="font-semibold mt-0.5 truncate">{party.email ?? "—"}</div>
        </div>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales History</TabsTrigger>
          <TabsTrigger value="orders">Order History</TabsTrigger>
          <TabsTrigger value="products">Product Purchase History</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          {invoicesLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner size="sm" /></div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <DocumentListTable
              numberLabel="Invoice No"
              rows={invoices.map((inv) => ({ id: inv.id, number: inv.invoice_number, date: inv.invoice_date, amount: inv.grand_total, status: inv.status }))}
            />
          )}
        </TabsContent>

        <TabsContent value="orders">
          {ordersLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner size="sm" /></div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders yet.</p>
          ) : (
            <DocumentListTable
              numberLabel="Order No"
              rows={orders.map((o) => ({ id: o.id, number: o.order_number, date: o.order_date, amount: o.grand_total, status: o.status }))}
            />
          )}
        </TabsContent>

        <TabsContent value="products">
          <ProductPurchaseHistory partyId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
