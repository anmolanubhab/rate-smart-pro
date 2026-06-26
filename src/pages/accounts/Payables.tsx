import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";
import { useNavigate } from "react-router-dom"; // <-- NEW IMPORT

export default function Payables() {
  useEffect(() => { document.title = "Outstanding Payables — RD Pro"; }, []);
  const { user } = useAuth();
  const navigate = useNavigate(); // <-- NEW
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["payables", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const rows = useMemo(() => {
    return ledgers
      .filter(l => l.ledger_type === "supplier" && (l.balance ?? 0) < 0)
      .map(l => ({
        supplier: l.name,
        group: l.group?.name ?? "—",
        amount: Math.abs(l.balance ?? 0),
        status: "Outstanding",
        status_tone: "warning",
        _party_id: l.party_id, // <-- store party_id for navigation
      }));
  }, [ledgers]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Payables"
      description={
        isLoading
          ? "Loading…"
          : rows.length === 0
            ? "No supplier ledgers with a credit balance. Once Purchase vouchers are recorded against suppliers, they will appear here."
            : "Supplier-wise outstanding from posted vouchers."
      }
      kpis={[
        { label: "Total Payable", value: `₹ ${fmtInr(total)}`, tone: "warning" },
        { label: "Suppliers", value: rows.length },
        { label: "Supplier Ledgers", value: ledgers.filter(l => l.ledger_type === "supplier").length },
        { label: "As On", value: new Date().toLocaleDateString("en-IN") },
      ]}
      columns={[
        { key: "supplier", label: "Supplier" },
        { key: "group", label: "Group" },
        { key: "amount", label: "Outstanding", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      // ── NEW: row click handler ──
      onRowClick={(row) => {
        if (row._party_id) navigate(`/accounts/party/${row._party_id}`);
      }}
    />
  );
}
