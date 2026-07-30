import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSupplierLedgerSummary, fmtInr } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";

export default function Payables() {
  useEffect(() => { document.title = "Outstanding Payables — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["supplier-ledger", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchSupplierLedgerSummary(user!.id),
  });

  const rows = suppliers
    .filter((s) => s.outstanding > 0)
    .map((s) => ({
      supplier: s.name,
      amount: s.outstanding,
      status: "Outstanding",
      status_tone: "warning",
      _party_id: s.party_id,
    }));

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Payables"
      description={
        isLoading
          ? "Loading…"
          : rows.length === 0
            ? "No suppliers with an outstanding balance. Once purchase vouchers are recorded against suppliers, they will appear here."
            : "Supplier-wise outstanding from posted vouchers."
      }
      kpis={[
        { label: "Total Payable", value: `₹ ${fmtInr(total)}`, tone: "warning" },
        { label: "Suppliers", value: rows.length },
        { label: "Total Suppliers", value: suppliers.length },
        { label: "As On", value: fd(new Date().toISOString().slice(0, 10)) },
      ]}
      columns={[
        { key: "supplier", label: "Supplier" },
        { key: "amount", label: "Outstanding", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
    />
  );
}
