import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSupplierLedgerSummary, fmtInr } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";

export default function SupplierLedger() {
  useEffect(() => { document.title = "Supplier Ledger — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["supplier-ledger", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchSupplierLedgerSummary(user!.id),
  });

  const rows = suppliers.map((s) => ({
    supplier: s.name,
    gstin: s.gstin ?? "—",
    credit_limit: s.credit_limit,
    outstanding: s.outstanding,
    last_txn: s.last_txn ? fd(s.last_txn) : "—",
    status: s.outstanding > 0 ? "Open" : "Cleared",
    status_tone: s.outstanding > 0 ? "warning" : "success",
    _party_id: s.party_id,
  }));

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0);
  const openCount = rows.filter((r) => r.outstanding > 0).length;

  return (
    <MockTablePage
      eyebrow="Purchase · Accounts"
      title="Supplier Ledger"
      description={
        isLoading
          ? "Loading…"
          : rows.length === 0
            ? "No suppliers yet. Once a purchase order, purchase invoice, or supplier payment is recorded, suppliers will appear here."
            : "Ledger balances for all suppliers, from posted purchase and payment vouchers. Click a supplier to view detailed transactions."
      }
      kpis={[
        { label: "Total Outstanding", value: `₹ ${fmtInr(totalOutstanding)}`, tone: "warning" },
        { label: "Open Suppliers", value: openCount },
        { label: "Total Suppliers", value: rows.length },
        { label: "As On", value: fd(new Date().toISOString().slice(0, 10)) },
      ]}
      columns={[
        { key: "supplier", label: "Supplier" },
        { key: "gstin", label: "GSTIN" },
        { key: "credit_limit", label: "Credit Limit", align: "right", format: "currency" },
        { key: "outstanding", label: "Outstanding", align: "right", format: "currency" },
        { key: "last_txn", label: "Last Transaction" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
    />
  );
}
