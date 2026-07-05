import { useEffect, useState } from "react";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useDealerAuth } from "@/hooks/useDealerAuth";

type Row = {
  date: string;
  ref: string;
  particulars: string;
  dr: number;
  cr: number;
  balance: number;
};

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function DealerLedger() {
  const { portalUser } = useDealerAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Ledger — RD Pro";
  }, []);

  useEffect(() => {
    if (!portalUser) return;
    (async () => {
      setLoading(true);
      const [{ data: invs }, { data: pays }] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("invoice_number, invoice_date, grand_total, status")
          .eq("party_id", portalUser.party_id)
          .eq("business_id", portalUser.business_id)
          .neq("status", "cancelled"),
        supabase
          .from("payment_entries")
          .select("reference_number, payment_date, amount")
          .eq("party_id", portalUser.party_id)
          .eq("business_id", portalUser.business_id),
      ]);

      type Entry = { date: string; ref: string; particulars: string; dr: number; cr: number };
      const entries: Entry[] = [
        ...((invs as { invoice_number: string; invoice_date: string; grand_total: number }[]) ?? []).map((i) => ({
          date: i.invoice_date,
          ref: i.invoice_number,
          particulars: "Sales Invoice",
          dr: Number(i.grand_total),
          cr: 0,
        })),
        ...((pays as { reference_number: string | null; payment_date: string; amount: number }[]) ?? []).map((p) => ({
          date: (p.payment_date ?? "").slice(0, 10),
          ref: p.reference_number ?? "Payment",
          particulars: "Payment received",
          dr: 0,
          cr: Number(p.amount),
        })),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      let balance = 0;
      const withBalance: Row[] = entries.map((e) => {
        balance += e.dr - e.cr;
        return { ...e, balance };
      });

      setRows(withBalance);
      setLoading(false);
    })();
  }, [portalUser]);

  return (
    <DealerLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Ledger</CardTitle>
          <p className="text-sm text-muted-foreground">
            Invoices and payments on your account, oldest first. Built from your invoice
            and payment history — bill-wise settlement matching is not tracked yet.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No ledger activity yet.</TableCell></TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-mono text-sm">{r.ref}</TableCell>
                    <TableCell>{r.particulars}</TableCell>
                    <TableCell className="text-right">{r.dr ? inr(r.dr) : "—"}</TableCell>
                    <TableCell className="text-right">{r.cr ? inr(r.cr) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(r.balance)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
