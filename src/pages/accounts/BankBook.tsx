import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fetchVouchers, fetchVoucherItems, fmtInr, type VoucherItemRow } from "@/lib/accounting";

export default function BankBook() {
  useEffect(() => { document.title = "Bank Book — RD Pro"; }, []);
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["bank-book", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const allLedgers = await fetchLedgersWithBalance(user!.id);
      const ledgers = allLedgers.filter(l => l.ledger_type === "bank");
      const ledgerIds = new Set(ledgers.map(l => l.id));
      // Every ledger's name (not just bank ones) -- a row's "Name" column is
      // the OTHER leg of the entry (who was paid / who paid in), which for a
      // receipt/payment is a party ledger, not another bank ledger.
      const nameById = new Map(allLedgers.map(l => [l.id, l.name]));
      const vouchers = await fetchVouchers(user!.id, { limit: 500 });
      const items = await fetchVoucherItems(user!.id, vouchers.map(v => v.id));
      const vMap = new Map(vouchers.map(v => [v.id, v]));
      const itemsByVoucher = new Map<string, VoucherItemRow[]>();
      items.forEach((it) => {
        const arr = itemsByVoucher.get(it.voucher_id) ?? [];
        arr.push(it);
        itemsByVoucher.set(it.voucher_id, arr);
      });
      let receipts = 0, payments = 0;
      const list = items
        .filter(it => ledgerIds.has(it.ledger_account_id))
        .map(it => ({ it, v: vMap.get(it.voucher_id)! }))
        .filter(x => x.v)
        .sort((a, b) => a.v.voucher_date.localeCompare(b.v.voucher_date));
      list.forEach(({ it }) => { receipts += Number(it.dr_amount || 0); payments += Number(it.cr_amount || 0); });
      const opening = ledgers.reduce((s, l) => s + Number(l.opening_balance || 0) * (l.opening_balance_type === "cr" ? -1 : 1), 0);
      let bal = opening;
      const rows = list.map(({ it, v }) => {
        bal += Number(it.dr_amount || 0) - Number(it.cr_amount || 0);
        const name = (itemsByVoucher.get(it.voucher_id) ?? [])
          .filter((sib) => sib.id !== it.id)
          .map((sib) => nameById.get(sib.ledger_account_id))
          .filter(Boolean)
          .join(", ") || "—";
        return {
          date: v.voucher_date,
          number: v.voucher_number,
          name,
          narration: v.narration ?? "—",
          dr: Number(it.dr_amount || 0),
          cr: Number(it.cr_amount || 0),
          balance: bal,
        };
      });
      return { rows, opening, receipts, payments, closing: opening + receipts - payments, ledgerCount: ledgers.length };
    },
  });

  return (
    <MockTablePage
      eyebrow="Accounts · Books"
      title="Bank Book"
      description={isLoading ? "Loading…" : `${data?.ledgerCount ?? 0} bank ledger(s) · receipts, payments and transfers.`}
      kpis={[
        { label: "Opening", value: `₹ ${fmtInr(data?.opening ?? 0)}` },
        { label: "Receipts", value: `₹ ${fmtInr(data?.receipts ?? 0)}`, tone: "success" },
        { label: "Payments", value: `₹ ${fmtInr(data?.payments ?? 0)}`, tone: "warning" },
        { label: "Closing", value: `₹ ${fmtInr(data?.closing ?? 0)}`, tone: (data?.closing ?? 0) >= 0 ? "success" : "danger" },
      ]}
      columns={[
        { key: "date", label: "Date" },
        { key: "number", label: "Voucher #" },
        { key: "name", label: "Name" },
        { key: "narration", label: "Narration" },
        { key: "dr", label: "Receipt (Dr)", align: "right", format: "currency" },
        { key: "cr", label: "Payment (Cr)", align: "right", format: "currency" },
        { key: "balance", label: "Balance", align: "right", format: "currency" },
      ]}
      rows={data?.rows ?? []}
    />
  );
}
