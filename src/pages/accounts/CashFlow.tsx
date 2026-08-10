import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { fmtInr } from "@/lib/accounting";
import { buildCashFlowStatement } from "@/lib/cashFlow";

const SECTION_LABEL: Record<string, string> = {
  operating: "Operating",
  investing: "Investing",
  financing: "Financing",
};

export default function CashFlow() {
  useEffect(() => { document.title = "Cash Flow — RD Pro"; }, []);
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["cash-flow", user?.id, fromDate, toDate],
    enabled: !!user?.id,
    queryFn: () => buildCashFlowStatement(user!.id, { from: fromDate || undefined, to: toDate || undefined }),
  });

  const rows = [
    ...(data?.lines ?? []).map((l) => ({ section: SECTION_LABEL[l.section], item: l.item, amount: l.amount, total: false })),
    { section: SECTION_LABEL.operating, item: "Net Cash from Operating Activities", amount: data?.operating ?? 0, total: true },
    { section: SECTION_LABEL.investing, item: "Net Cash used in Investing Activities", amount: data?.investing ?? 0, total: true },
    { section: SECTION_LABEL.financing, item: "Net Cash from Financing Activities", amount: data?.financing ?? 0, total: true },
  ];

  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Cash Flow Statement"
      description={isLoading ? "Loading…" : "Cash generated and used across Operating, Investing and Financing activities, computed from posted vouchers."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
        </div>
      }
      kpis={[
        { label: "Opening Cash & Equivalents", value: `₹ ${fmtInr(data?.opening ?? 0)}` },
        { label: "Net Cash Flow", value: `₹ ${fmtInr(data?.netChange ?? 0)}`, tone: (data?.netChange ?? 0) >= 0 ? "success" : "danger" },
        { label: "Closing Cash & Equivalents", value: `₹ ${fmtInr(data?.closing ?? 0)}` },
        { label: "Activities", value: rows.length },
      ]}
      columns={[
        { key: "section", label: "Section" },
        { key: "item", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
