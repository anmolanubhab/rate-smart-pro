import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { fetchOrders, Order } from "@/lib/orders";
import { fetchDispatches } from "@/lib/dispatches";
import { supabase } from "@/integrations/supabase/client";

const exportXlsx = (rows: any[], name: string) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, name);
};

const Reports = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => { document.title = "Reports — Spare Parts OMS"; }, []);
  useEffect(() => {
    if (!user) return;
    fetchOrders(user.id).then(setOrders);
    fetchDispatches(user.id).then(setDispatches);
    supabase.from("order_items").select("*, orders!inner(order_number, party_name, status, user_id)")
      .eq("user_id", user.id).gt("pending_qty", 0)
      .then(({ data }) => setPending((data || []).filter((r: any) => !["draft", "cancelled"].includes(r.orders?.status))));
  }, [user]);

  const orderRows = useMemo(() => orders.map((o) => ({
    OrderNumber: o.order_number, Date: o.order_date, Party: o.party_name,
    Status: o.status, Source: o.source_type, Subtotal: o.subtotal, GST: o.gst_total,
    GrandTotal: o.grand_total, PendingQty: o.pending_total_qty, DispatchedQty: o.dispatched_total_qty,
  })), [orders]);

  const dispatchRows = useMemo(() => dispatches.map((d) => ({
    DispatchNumber: d.dispatch_number, Date: d.dispatch_date,
    Order: d.orders?.order_number, Party: d.orders?.party_name, Notes: d.notes || "",
  })), [dispatches]);

  const pendingRows = useMemo(() => pending.map((p) => ({
    Party: p.orders?.party_name, Order: p.orders?.order_number, Part: p.part_number,
    Description: p.description, Ordered: p.qty, Dispatched: p.dispatched_qty,
    Pending: p.pending_qty, Rate: p.net_rate, Value: +(Number(p.pending_qty) * Number(p.net_rate)).toFixed(2),
  })), [pending]);

  const cards = [
    { title: "Order Report", desc: "All orders with status & totals", count: orderRows.length, action: () => exportXlsx(orderRows, "orders.xlsx") },
    { title: "Pending Report", desc: "Items pending across orders", count: pendingRows.length, action: () => exportXlsx(pendingRows, "pending.xlsx") },
    { title: "Dispatch Report", desc: "Dispatch history", count: dispatchRows.length, action: () => exportXlsx(dispatchRows, "dispatches.xlsx") },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Insights</p>
        <h1 className="font-display text-3xl font-bold mt-1">Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">Download Excel exports for orders, pending balances and dispatches.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2 text-primary mb-2"><FileSpreadsheet className="h-5 w-5" /><h3 className="font-semibold">{c.title}</h3></div>
            <p className="text-sm text-muted-foreground">{c.desc}</p>
            <p className="text-3xl font-display font-bold mt-3 tabular-nums">{c.count}</p>
            <Button onClick={c.action} className="mt-4 w-full gradient-primary text-white border-0"><Download className="h-4 w-4" />Export Excel</Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Reports;
