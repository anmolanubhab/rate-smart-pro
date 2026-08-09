import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import {
  fetchSalesmanOutstandingInvoices, fetchSalesmanLastPayments,
  type AgingBucket, type SalesmanOutstandingInvoiceRow,
} from "@/lib/salesmanPortal/outstanding";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];
const bucketTone: Record<AgingBucket, string> = {
  "0-30": "bg-emerald-100 text-emerald-700",
  "31-60": "bg-amber-100 text-amber-700",
  "61-90": "bg-amber-100 text-amber-700",
  "90+": "bg-red-100 text-red-700",
};

type PartyOutstandingRow = {
  party_id: string;
  party_name: string;
  total: number;
  current: number;
  overdue: number;
  oldest_due_date: string;
  last_payment_date: string | null;
  invoices: SalesmanOutstandingInvoiceRow[];
};

export default function SalesmanOutstanding() {
  useEffect(() => { document.title = "Outstanding — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const [bucketFilter, setBucketFilter] = useState<AgingBucket | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["salesman-portal-outstanding-invoices", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanOutstandingInvoices(salesmanId!, businessId!),
  });

  const { data: lastPayments = new Map<string, string>() } = useQuery({
    queryKey: ["salesman-portal-last-payments", businessId],
    enabled: !!businessId,
    queryFn: () => fetchSalesmanLastPayments(businessId!),
  });

  const partyRows: PartyOutstandingRow[] = useMemo(() => {
    const byParty = new Map<string, PartyOutstandingRow>();
    for (const inv of invoices) {
      let row = byParty.get(inv.party_id);
      if (!row) {
        row = {
          party_id: inv.party_id, party_name: inv.party_name,
          total: 0, current: 0, overdue: 0,
          oldest_due_date: inv.invoice_date,
          last_payment_date: lastPayments.get(inv.party_id) ?? null,
          invoices: [],
        };
        byParty.set(inv.party_id, row);
      }
      row.total += inv.balance_due;
      if (inv.bucket === "0-30") row.current += inv.balance_due;
      else row.overdue += inv.balance_due;
      if (inv.invoice_date < row.oldest_due_date) row.oldest_due_date = inv.invoice_date;
      row.invoices.push(inv);
    }
    return Array.from(byParty.values()).sort((a, b) => b.total - a.total);
  }, [invoices, lastPayments]);

  const filteredPartyRows = bucketFilter === "all"
    ? partyRows
    : partyRows.filter((p) => p.invoices.some((i) => i.bucket === bucketFilter));

  const grandTotal = partyRows.reduce((s, p) => s + p.total, 0);
  const bucketTotals = useMemo(() => {
    const t: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const inv of invoices) t[inv.bucket] += inv.balance_due;
    return t;
  }, [invoices]);

  const toggle = (partyId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(partyId)) next.delete(partyId); else next.add(partyId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Outstanding</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">Total Outstanding</div>
          <div className="font-semibold mt-0.5">{inr(grandTotal)}</div>
        </div>
        {BUCKETS.map((b) => (
          <button
            key={b}
            onClick={() => setBucketFilter((f) => (f === b ? "all" : b))}
            className={`rounded-xl border p-3 text-left transition-colors ${bucketFilter === b ? "border-primary bg-primary/5" : "bg-card"}`}
          >
            <div className="text-xs text-muted-foreground">{b} days</div>
            <div className="font-semibold mt-0.5">{inr(bucketTotals[b])}</div>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>
      ) : filteredPartyRows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No outstanding balances.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Party</th>
                    <th className="px-3 py-2.5 text-right">Total Outstanding</th>
                    <th className="px-3 py-2.5 text-right">Overdue</th>
                    <th className="px-3 py-2.5 text-right">Current</th>
                    <th className="px-3 py-2.5 text-left">Oldest Due</th>
                    <th className="px-3 py-2.5 text-left">Last Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartyRows.map((p) => {
                    const isOpen = expanded.has(p.party_id);
                    const shownInvoices = bucketFilter === "all" ? p.invoices : p.invoices.filter((i) => i.bucket === bucketFilter);
                    return (
                      <Fragment key={p.party_id}>
                        <tr className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => toggle(p.party_id)}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 font-medium">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                              {p.party_name}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">{inr(p.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(p.overdue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(p.current)}</td>
                          <td className="px-3 py-2">{p.oldest_due_date}</td>
                          <td className="px-3 py-2">{p.last_payment_date ?? "—"}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="px-3 pl-9 py-3 bg-muted/5">
                              <OutstandingDrillTable invoices={shownInvoices} />
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
            {filteredPartyRows.map((p) => {
              const isOpen = expanded.has(p.party_id);
              const shownInvoices = bucketFilter === "all" ? p.invoices : p.invoices.filter((i) => i.bucket === bucketFilter);
              return (
                <div key={p.party_id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button className="w-full text-left p-3" onClick={() => toggle(p.party_id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 font-medium">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{p.party_name}</span>
                      </div>
                      <span className="font-semibold text-primary shrink-0">{inr(p.total)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 pl-5">
                      Overdue {inr(p.overdue)} · Current {inr(p.current)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                      Oldest due {p.oldest_due_date} · Last payment {p.last_payment_date ?? "—"}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 bg-muted/5">
                      <OutstandingDrillTable invoices={shownInvoices} />
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

function OutstandingDrillTable({ invoices }: { invoices: SalesmanOutstandingInvoiceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left py-1 pr-3">Invoice No.</th>
            <th className="text-left py-1 pr-3">Date</th>
            <th className="text-right py-1 pr-3">Invoice Total</th>
            <th className="text-right py-1 pr-3">Balance Due</th>
            <th className="text-right py-1 pr-3">Days</th>
            <th className="text-left py-1">Bucket</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.invoice_id} className="border-t border-border/30">
              <td className="py-1 pr-3 font-mono">{inv.invoice_number}</td>
              <td className="py-1 pr-3">{inv.invoice_date}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{inr(inv.grand_total)}</td>
              <td className="py-1 pr-3 text-right tabular-nums font-medium">{inr(inv.balance_due)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{inv.days}</td>
              <td className="py-1">
                <Badge className={`${bucketTone[inv.bucket]} hover:${bucketTone[inv.bucket]}`}>{inv.bucket}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
