import { useEffect, useState } from "react";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { useFormatDate } from "@/lib/dateFormat";

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  grand_total: number;
  status: string;
};

const inr = (n: number) => `₹ ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysOverdue(invoiceDate: string) {
  const d = new Date(invoiceDate);
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  // No due-date field exists yet on sales_invoices — treat 30 days from
  // invoice date as the assumed credit period until a real due_date column
  // is added.
  return diff > 30 ? diff - 30 : 0;
}

export default function DealerOutstanding() {
  const { portalUser } = useDealerAuth();
  const fd = useFormatDate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditLimit, setCreditLimit] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Outstanding — RD Pro";
  }, []);

  useEffect(() => {
    if (!portalUser) return;
    (async () => {
      setLoading(true);
      const [{ data: party }, { data: invs }, { data: balance }] = await Promise.all([
        supabase
          .from("parties")
          .select("credit_limit")
          .eq("id", portalUser.party_id)
          .maybeSingle(),
        supabase
          .from("sales_invoices")
          .select("id, invoice_number, invoice_date, grand_total, status")
          .eq("party_id", portalUser.party_id)
          .eq("business_id", portalUser.business_id)
          .neq("status", "cancelled")
          .order("invoice_date", { ascending: false })
          .limit(200),
        // Single source of truth for a party's outstanding balance — see
        // get_party_outstanding_balance() (prefers the linked ledger over
        // the raw parties.outstanding_balance column, which is only a
        // best-effort mirror). Portal sessions can't read ledger_accounts
        // directly (RLS is business-member-only), so this RPC is the
        // portal-reachable equivalent of src/lib/parties.ts's admin-side helper.
        supabase.rpc("get_party_outstanding_balance" as never, { _party_id: portalUser.party_id } as never),
      ]);
      setCreditLimit(Number((party as { credit_limit?: number } | null)?.credit_limit) || 0);
      setOutstanding(Number(balance) || 0);
      setInvoices((invs as Invoice[]) ?? []);
      setLoading(false);
    })();
  }, [portalUser]);

  const overdueTotal = invoices
    .filter((i) => daysOverdue(i.invoice_date) > 0)
    .reduce((s, i) => s + Number(i.grand_total), 0);

  const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;

  return (
    <DealerLayout>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold text-amber-600">{inr(outstanding)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Overdue (30+ days)</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-semibold text-destructive">{inr(overdueTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Credit Available</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-emerald-600">
              {availableCredit === null ? "No limit set" : inr(availableCredit)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No invoices yet.</TableCell></TableRow>
              ) : (
                invoices.map((i) => {
                  const od = daysOverdue(i.invoice_date);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-sm">{i.invoice_number}</TableCell>
                      <TableCell>{fd(i.invoice_date)}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(i.grand_total)}</TableCell>
                      <TableCell>
                        {od > 0 ? <Badge variant="destructive">Overdue {od}d</Badge> : <Badge variant="secondary">{i.status}</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
