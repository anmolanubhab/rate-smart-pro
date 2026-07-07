import { useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseOrders() {
  useEffect(() => { document.title = "Purchase Orders — RD Pro"; }, []);
  const navigate = useNavigate();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, status, grand_total, total_qty, received_qty, pending_qty, supplier:parties(name)")
        .eq("business_id", businessId!)
        .order("po_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (data ?? []).map((po) => {
    const toneMap: Record<string, string> = {
      draft: "default", pending_approval: "warning", approved: "success",
      rejected: "danger", ordered: "success", partially_received: "warning", received: "success",
      cancelled: "danger", closed: "default",
    };
    return {
      po_number: po.po_number,
      supplier: po.supplier?.name ?? "—",
      date: po.po_date,
      amount: Number(po.grand_total ?? 0),
      ordered_qty: Number(po.total_qty ?? 0),
      received_qty: Number(po.received_qty ?? 0),
      pending_qty: Number(po.pending_qty ?? 0),
      status: po.status.replace(/_/g, " "),
      status_tone: toneMap[po.status] ?? "default",
      _id: po.id,
    };
  }), [data]);

  const pending = rows.filter(r => r.status === "pending approval").length;
  const confirmed = rows.filter(r => ["approved", "ordered", "received", "partially received"].includes(r.status)).length;
  const cancelled = rows.filter(r => r.status === "cancelled").length;

  return (
    <MockTablePage
      eyebrow="Purchase · Orders"
      title="Purchase Orders"
      description={isLoading ? "Loading…" : "Create and manage purchase orders sent to suppliers. Track PO status from draft to confirmed."}
      actions={
        <Button asChild>
          <Link to="/purchase/orders/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            New PO
          </Link>
        </Button>
      }
      kpis={[
        { label: "Total POs", value: rows.length },
        { label: "Pending Approval", value: pending, tone: "warning" },
        { label: "Confirmed", value: confirmed, tone: "success" },
        { label: "Cancelled", value: cancelled, tone: "danger" },
      ]}
      columns={[
        { key: "po_number", label: "PO Number" },
        { key: "supplier", label: "Supplier" },
        { key: "date", label: "Date" },
        { key: "ordered_qty", label: "Ordered", align: "right", format: "number" },
        { key: "received_qty", label: "Received", align: "right", format: "number" },
        { key: "pending_qty", label: "Pending", align: "right", format: "number" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      onRowClick={(row) => navigate(`/purchase/orders/edit/${row._id}`)}
    />
  );
}
