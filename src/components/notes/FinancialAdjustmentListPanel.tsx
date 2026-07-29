// src/components/notes/FinancialAdjustmentListPanel.tsx
//
// Financial Adjustment mode listing for the redesigned Debit Note / Credit
// Note pages — reuses listVouchers() (the same service VoucherList.tsx is
// built on) filtered to this voucher type, excluding Material Return notes
// (those live in ReturnsListPanel instead). "New" routes into the existing
// generic Voucher Engine (VoucherForm) pre-set to this voucher type.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBusiness } from "@/hooks/useBusiness";
import { listVouchers, typeToDb, type VoucherType } from "@/lib/voucherService";
import { fmtInr } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";

const statusTone: Record<string, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  posted: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

interface Props {
  type: Extract<VoucherType, "Debit Note" | "Credit Note">;
  hideHeader?: boolean;
}

export default function FinancialAdjustmentListPanel({ type, hideHeader }: Props) {
  const navigate = useNavigate();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => { setPage(1); }, [type]);

  const { data: result, isLoading } = useQuery({
    queryKey: ["financial-adjustment-vouchers", business?.id, type, page],
    enabled: !!business?.id,
    queryFn: () => listVouchers({
      voucher_type: type,
      excludeNoteMode: "material_return",
      limit,
      offset: (page - 1) * limit,
    }),
  });

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {!hideHeader ? (
          <div>
            <p className="text-sm text-muted-foreground">Accounts · Notes</p>
            <h1 className="text-2xl font-bold mt-1">{type}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Adjustments not tied to a physical goods return — freight, discount, rate difference, and similar.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Adjustments not tied to a physical goods return — freight, discount, rate difference, and similar.
          </p>
        )}
        <Button onClick={() => navigate(`/accounting/vouchers/new?type=${typeToDb(type)}`)}>
          <Plus className="h-4 w-4 mr-2" />New {type}
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No {type.toLowerCase()} adjustments yet</TableCell></TableRow>
            ) : rows.map((v) => (
              <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/accounting/vouchers/${v.id}`)}>
                <TableCell className="font-mono text-sm">{v.voucher_no}</TableCell>
                <TableCell>{fd(v.voucher_date)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v.adjustment_category_snapshot?.category_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{v.narration || "—"}</TableCell>
                <TableCell className="text-right font-semibold">₹ {fmtInr(v.total_debit ?? 0)}</TableCell>
                <TableCell><Badge variant="outline" className={statusTone[v.status]}>{v.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
