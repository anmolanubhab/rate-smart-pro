import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fetchVouchers, fetchVoucherItems, fmtInr, type VoucherItemRow } from "@/lib/accounting";

function BookPage({ kind, title, eyebrow }: { kind: "cash" | "bank"; title: string; eyebrow: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [`${kind}-book`, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const allLedgers = await fetchLedgersWithBalance(user!.id);
      const ledgers = allLedgers.filter(l => l.ledger_type === kind);
      const ledgerIds = new Set(ledgers.map(l => l.id));
      // Every ledger's name (not just this kind's) -- a row's "Name" column
      // is the OTHER leg of the entry (who was paid / who paid in), which
      // for a receipt/payment is a party ledger, not another cash/bank one.
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
      const rows: any[] = [];
      let receipts = 0, payments = 0;
      items
        .filter(it => ledgerIds.has(it.ledger_account_id))
        .map(it => ({ it, v: vMap.get(it.voucher_id)! }))
        .filter(x => x.v)
        .sort((a, b) => a.v.voucher_date.localeCompare(b.v.voucher_date))
        .forEach(({ it, v }) => {
          receipts += Number(it.dr_amount || 0);
          payments += Number(it.cr_amount || 0);
          const name = (itemsByVoucher.get(it.voucher_id) ?? [])
            .filter((sib) => sib.id !== it.id)
            .map((sib) => nameById.get(sib.ledger_account_id))
            .filter(Boolean)
            .join(", ") || "—";
          rows.push({
            date: v.voucher_date,
            number: v.voucher_number,
            name,
            narration: v.narration ?? "—",
            dr: Number(it.dr_amount || 0),
            cr: Number(it.cr_amount || 0),
          });
        });

      const opening = ledgers.reduce((s, l) => {
        const o = Number(l.opening_balance || 0) * (l.opening_balance_type === "cr" ? -1 : 1);
        return s + o;
      }, 0);
      const closing = opening + receipts - payments;
      // running balance
      let bal = opening;
      const out = rows.map(r => { bal += r.dr - r.cr; return { ...r, balance: bal }; });
      return { rows: out, opening, receipts, payments, closing, ledgerCount: ledgers.length };
    },
  });

  return (
    <MockTablePage
      eyebrow={eyebrow}
      title={title}
      description={isLoading ? "Loading…" : `${data?.ledgerCount ?? 0} ${kind} ledger(s) · receipts and payments with running balance.`}
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

export default function CashBook() {
  useEffect(() => { document.title = "Cash Book — RD Pro"; }, []);
  return <BookPage kind="cash" title="Cash Book" eyebrow="Accounts · Books" />;
}
