import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, MapPin, BadgeIndianRupee, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchPartyLedger, fmtInr } from "@/lib/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PartyActivityTimeline from "@/components/parties/PartyActivityTimeline";

type PartyRow = {
  id: string;
  name: string;
  phone: string | null;
  gst: string | null;
  address: string | null;
  credit_limit: number | null;
  outstanding_balance: number | null;
  agreed_discount: number | null;
  discount_type: string | null;
  party_group_id: string | null;
};

type GroupRow = { id: string; name: string };
type OrderRow = { id: string; order_number: string; status: string; grand_total: number; created_at: string };
type InvoiceRow = { id: string; invoice_number: string; grand_total: number; invoice_date: string; status: string };

function daysOverdue(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return diff > 30 ? diff - 30 : 0;
}

export default function PartyDashboard() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();

  const [party, setParty] = useState<PartyRow | null>(null);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [ledgerLines, setLedgerLines] = useState<Awaited<ReturnType<typeof fetchPartyLedger>>["lines"]>([]);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = party ? `${party.name} — RD Pro` : "Party — RD Pro"; }, [party]);

  useEffect(() => {
    if (!partyId || !user || !business) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: ord }, { data: inv }, ledgerRes] = await Promise.all([
        supabase.from("parties").select("id, name, phone, gst, address, credit_limit, outstanding_balance, agreed_discount, discount_type, party_group_id").eq("id", partyId).maybeSingle(),
        supabase.from("orders").select("id, order_number, status, grand_total, created_at").eq("party_id", partyId).order("created_at", { ascending: false }).limit(10),
        supabase.from("sales_invoices").select("id, invoice_number, grand_total, invoice_date, status").eq("party_id", partyId).order("invoice_date", { ascending: false }).limit(10),
        fetchPartyLedger(user.id, partyId).catch(() => ({ ledger: null, lines: [], closingBalance: 0 })),
      ]);

      setParty((p as PartyRow) ?? null);
      setOrders((ord as OrderRow[]) ?? []);
      setInvoices((inv as InvoiceRow[]) ?? []);
      setLedgerLines(ledgerRes.lines.slice(0, 8));
      setClosingBalance(ledgerRes.closingBalance);

      if (p?.party_group_id) {
        const { data: g } = await supabase.from("party_groups").select("id, name").eq("id", p.party_group_id).maybeSingle();
        setGroup((g as GroupRow) ?? null);
      } else {
        setGroup(null);
      }
      setLoading(false);
    })();
  }, [partyId, user, business]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!party) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Party not found.</div>;
  }

  const outstanding = Number(party.outstanding_balance) || 0;
  const creditLimit = Number(party.credit_limit) || 0;
  const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;
  const overdueInvoices = invoices.filter((i) => daysOverdue(i.invoice_date) > 0);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.grand_total), 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/parties")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{party.name}</h1>
            {group && <Badge variant="secondary">{group.name}</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
            {party.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{party.phone}</span>}
            {party.gst && <span className="flex items-center gap-1"><BadgeIndianRupee className="h-3.5 w-3.5" />GSTIN: {party.gst}</span>}
            {party.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{party.address}</span>}
          </div>
        </div>
        <Link to={`/accounts/party/${party.id}`}>
          <Button variant="outline"><BookOpen className="h-4 w-4 mr-1" /> Full Ledger</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold text-amber-600">{fmtInr(outstanding)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Available Credit</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold text-emerald-600">{availableCredit === null ? "No limit" : fmtInr(availableCredit)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold text-destructive">{fmtInr(overdueTotal)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">RD / CD</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{party.agreed_discount ?? 0}% <span className="text-xs text-muted-foreground">{party.discount_type ?? "RD"}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Ledger Balance</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{fmtInr(closingBalance)}</div></CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Orders</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No orders yet</TableCell></TableRow>
                  ) : orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell><Badge variant="secondary">{o.status}</Badge></TableCell>
                      <TableCell className="text-right">{fmtInr(o.grand_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Invoices</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No invoices yet</TableCell></TableRow>
                  ) : invoices.map((i) => {
                    const od = daysOverdue(i.invoice_date);
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-sm">{i.invoice_number}</TableCell>
                        <TableCell>{i.invoice_date}{od > 0 && <Badge variant="destructive" className="ml-2 text-xs">{od}d overdue</Badge>}</TableCell>
                        <TableCell className="text-right">{fmtInr(i.grand_total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Ledger (recent)</CardTitle>
              <Link to={`/accounts/party/${party.id}`} className="text-xs text-primary hover:underline">View full ledger →</Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Voucher</TableHead><TableHead className="text-right">Dr</TableHead><TableHead className="text-right">Cr</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ledgerLines.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">No ledger entries yet</TableCell></TableRow>
                  ) : ledgerLines.map((l, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{l.date}</TableCell>
                      <TableCell className="font-mono text-sm">{l.voucher_number}</TableCell>
                      <TableCell className="text-right">{l.dr ? fmtInr(l.dr) : "—"}</TableCell>
                      <TableCell className="text-right">{l.cr ? fmtInr(l.cr) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Activity Timeline</CardTitle></CardHeader>
          <CardContent>
            <PartyActivityTimeline partyId={party.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
