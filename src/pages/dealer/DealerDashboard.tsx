import { useEffect, useState } from "react";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { Link } from "react-router-dom";

type RecentOrder = {
  id: string;
  order_number: string;
  order_date: string;
  grand_total: number;
  status: string;
  pending_items_count: number | null;
};

type PartyInfo = {
  name: string | null;
  credit_limit: number | null;
  outstanding_balance: number | null;
};

const inr = (n: number | null | undefined) =>
  `₹ ${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function DealerDashboard() {
  const { portalUser } = useDealerAuth();
  const [party, setParty] = useState<PartyInfo | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [mtdCount, setMtdCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!portalUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthIso = monthStart.toISOString().slice(0, 10);

      const [partyRes, ordersRes, mtdRes] = await Promise.all([
        supabase
          .from("parties")
          .select("name, credit_limit, outstanding_balance")
          .eq("id", portalUser.party_id)
          .eq("business_id", portalUser.business_id)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id, order_number, order_date, grand_total, status, pending_items_count")
          .eq("party_id", portalUser.party_id)
          .eq("business_id", portalUser.business_id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("party_id", portalUser.party_id)
          .eq("business_id", portalUser.business_id)
          .gte("order_date", monthIso),
      ]);

      if (cancelled) return;
      setParty((partyRes.data as PartyInfo) ?? null);
      setOrders((ordersRes.data as RecentOrder[]) ?? []);
      setMtdCount(mtdRes.count ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [portalUser]);

  const outstanding = party?.outstanding_balance ?? 0;
  const creditLimit = party?.credit_limit ?? 0;
  const available = Math.max(0, creditLimit - outstanding);
  const lastOrder = orders[0];

  const kpis = [
    { label: "Outstanding", value: inr(outstanding), tone: outstanding > 0 ? "text-amber-600" : "" },
    { label: "Credit Limit", value: creditLimit ? inr(creditLimit) : "—" },
    { label: "Available Credit", value: creditLimit ? inr(available) : "—" },
    { label: "MTD Orders", value: String(mtdCount) },
  ];

  return (
    <DealerLayout>
      {party?.name && (
        <div className="mb-3 text-sm text-muted-foreground">
          Welcome, <span className="font-medium text-foreground">{party.name}</span>
        </div>
      )}
      <div className="grid md:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-semibold ${k.tone ?? ""}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          {lastOrder && (
            <div className="text-xs text-muted-foreground">
              Last order: {new Date(lastOrder.order_date).toLocaleDateString("en-IN")}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Pending Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    No orders yet.{" "}
                    <Link to="/dealer/order" className="text-primary underline">
                      Place your first order
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                    <TableCell>{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-right">{o.pending_items_count ?? 0}</TableCell>
                    <TableCell className="text-right">{inr(o.grand_total)}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "pending" || o.status === "draft" ? "secondary" : "default"}>
                        {o.status}
                      </Badge>
                    </TableCell>
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
