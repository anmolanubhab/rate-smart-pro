import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseReports() {
  useEffect(() => { document.title = "Purchase Reports — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-reports", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("supplier_id, grand_total, paid_amount, invoice_date, supplier:parties(name)")
        .eq("business_id", businessId!)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { rows, totalPurchase, avgPO, topSupplier, thisFY } = useMemo(() => {
    const bySupplier = new Map<string, { name: string; orders: number; total: number; paid: number }>();
    let totalPurchase = 0;
    const now = new Date();
    const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = new Date(fyStartYear, 3, 1); // April 1
    let thisFY = 0;

    (data ?? []).forEach((inv) => {
      const key = inv.supplier_id ?? "unknown";
      const name = inv.supplier?.name ?? "Unknown Supplier";
      const total = Number(inv.grand_total ?? 0);
      const paid = Number(inv.paid_amount ?? 0);
      const entry = bySupplier.get(key) ?? { name, orders: 0, total: 0, paid: 0 };
      entry.orders += 1;
      entry.total += total;
      entry.paid += paid;
      bySupplier.set(key, entry);
      totalPurchase += total;
      if (new Date(inv.invoice_date) >= fyStart) thisFY += total;
    });

    const rows = Array.from(bySupplier.values())
      .map((e) => ({
        supplier: e.name,
        orders: e.orders,
        total: e.total,
        paid: e.paid,
        outstanding: e.total - e.paid,
      }))
      .sort((a, b) => b.total - a.total);

    const top = rows[0]?.supplier ?? "—";
    const avg = rows.length ? totalPurchase / (data ?? []).length : 0;

    return { rows, totalPurchase, avgPO: avg, topSupplier: top, thisFY };
  }, [data]);

  return (
    <MockTablePage
      eyebrow="Purchase · Reports"
      title="Purchase Reports"
      description={isLoading ? "Loading…" : "Analyse purchase trends and supplier-wise spending, computed live from purchase invoices."}
      kpis={[
        { label: "Total Purchase", value: `₹ ${totalPurchase.toLocaleString("en-IN")}` },
        { label: "Avg. Invoice Value", value: `₹ ${Math.round(avgPO).toLocaleString("en-IN")}` },
        { label: "Top Supplier", value: topSupplier },
        { label: "This FY", value: `₹ ${thisFY.toLocaleString("en-IN")}`, tone: "success" },
      ]}
      columns={[
        { key: "supplier", label: "Supplier" },
        { key: "orders", label: "Invoices", align: "right" },
        { key: "total", label: "Total Value", align: "right", format: "currency" },
        { key: "paid", label: "Paid", align: "right", format: "currency" },
        { key: "outstanding", label: "Outstanding", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
