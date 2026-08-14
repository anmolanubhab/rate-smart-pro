import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canDeleteDirectly, canHardDelete, canUnlockVouchers } from "@/lib/permissions";
import { HardDeleteVoucherDialog } from "@/components/vouchers/HardDeleteVoucherDialog";
import { fetchVouchers, fmtInr, type VoucherRow } from "@/lib/accounting";
import { fetchLockDate, isDateLocked } from "@/lib/accountingLock";
import { deleteVoucher } from "@/lib/voucherService";
import { VOUCHER_TYPE_CONFIGS, VOUCHER_TYPE_ORDER } from "@/lib/voucherTypeConfig";
import { useVoucherShortcuts } from "@/hooks/useVoucherShortcuts";

const TYPES = ["All", "sales", "purchase", "receipt", "payment", "journal", "contra", "credit_note", "debit_note"];
const labels: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", receipt: "Receipt", payment: "Payment",
  journal: "Journal", contra: "Contra", credit_note: "Credit Note", debit_note: "Debit Note",
};

// Cancelling a voucher only flips its status (cancelVoucher() in
// voucherService.ts) — it still exists until someone explicitly Deletes it
// (the row-level Trash icon below, which works regardless of status). So
// cancelled vouchers stay findable under their own tab; they're just not
// in the default view, which is Posted only.
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "posted", label: "Posted" },
  { key: "draft", label: "Draft" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default function VoucherCenter() {
  useEffect(() => { document.title = "Voucher Center — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, financialRights, permissions } = useBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("posted");
  const [deleteTarget, setDeleteTarget] = useState<VoucherRow | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<VoucherRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // F4/F5/F6/F7/Ctrl+F8/Ctrl+F9 jump straight into a new voucher of that
  // type from the listing page too, not just from inside an entry screen.
  useVoucherShortcuts({ onSwitchType: (t) => navigate(VOUCHER_TYPE_CONFIGS[t].path) }, [navigate]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["vouchers", user?.id, filter, fromDate, toDate],
    enabled: !!user?.id,
    queryFn: () => fetchVouchers(user!.id, { type: filter, from: fromDate || undefined, to: toDate || undefined, limit: 500 }),
  });

  // Fetched once per business rather than per row -- isDateLocked() below is
  // a pure comparison against this single value, same lock date every
  // voucher on the page shares.
  const { data: lock } = useQuery({
    queryKey: ["accounting-lock", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchLockDate(business!.id),
  });
  const canEditLocked = canUnlockVouchers(role, financialRights);
  // Draft/cancelled removal (soft, reversible-ish) keeps the plain
  // canDeleteDirectly gate. A POSTED voucher's permanent removal is a
  // materially bigger action -- it needs the stronger canHardDelete gate
  // (owner/admin, or an explicit hard_delete permission-matrix grant) and
  // routes through HardDeleteVoucherDialog's typed-confirmation flow instead
  // of the plain AlertDialog below.
  const canDelete = canDeleteDirectly(role, financialRights);
  const canDeletePosted = canHardDelete(role, permissions, "accounts");

  /** The only two gates left, by design: an accounting-period lock, or the
   *  page-level canDelete check below (which hides the button entirely
   *  rather than showing it disabled). No distinction between manual and
   *  auto-generated vouchers, and no posted-status block -- deleteVoucher()
   *  itself is what actually allows any status through. */
  const deleteBlockReason = (v: VoucherRow): string | null => {
    if (!canEditLocked && isDateLocked(v.voucher_date, lock ?? null)) {
      return "This accounting period is locked. Unlock it in Settings → Accounting Lock first.";
    }
    return null;
  };

  const invalidateAfterVoucherDelete = () => {
    // The voucher's ledger effect is gone too now (see deleteVoucher()'s
    // own comment on voucher_items_balance_trigger) -- refresh every page
    // that reads a stored balance derived from it, not just this list.
    qc.invalidateQueries({ queryKey: ["vouchers"] });
    qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    qc.invalidateQueries({ queryKey: ["ledgers"] });
    qc.invalidateQueries({ queryKey: ["receivables"] });
    qc.invalidateQueries({ queryKey: ["supplier-ledger"] });
    qc.invalidateQueries({ queryKey: ["trial-balance"] });
    qc.invalidateQueries({ queryKey: ["balance-sheet"] });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !user) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteVoucher(user.id, deleteTarget.id, undefined, { canEditLockedVoucher: canEditLocked });
      toast.success(`Voucher ${deleteTarget.voucher_number} deleted.`);
      invalidateAfterVoucherDelete();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete voucher");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const handleHardDeleteConfirm = async (reason: string) => {
    if (!hardDeleteTarget || !user) return;
    try {
      await deleteVoucher(user.id, hardDeleteTarget.id, reason, { canEditLockedVoucher: canEditLocked });
      toast.success(`Voucher ${hardDeleteTarget.voucher_number} permanently deleted.`);
      invalidateAfterVoucherDelete();
    } catch (e: any) {
      // Re-thrown so HardDeleteVoucherDialog's caller (its try/finally) knows
      // not to close the dialog on failure -- the toast here is the only
      // user-visible error surface.
      toast.error(e.message ?? "Could not delete voucher");
      throw e;
    }
  };

  const rows = useMemo(() => data
    .filter((v) => statusFilter === "all" || v.status === statusFilter)
    .map((v) => ({
      id: v.id,
      date: v.voucher_date,
      number: v.voucher_number,
      type: labels[v.voucher_type] ?? v.voucher_type,
      debited_to: v.dr_ledgers?.length ? v.dr_ledgers.join(", ") : "—",
      credited_to: v.cr_ledgers?.length ? v.cr_ledgers.join(", ") : "—",
      narration: v.narration ?? "—",
      amount: v.total_amount,
      status: v.status === "posted" ? "Posted" : v.status === "draft" ? "Draft" : "Cancelled",
      status_tone: v.status === "posted" ? "success" : v.status === "draft" ? "warning" : "danger",
      _voucher: v,
    })), [data, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap gap-2">
        {VOUCHER_TYPE_ORDER.map((t) => {
          const cfg = VOUCHER_TYPE_CONFIGS[t];
          return (
            <Button key={t} size="sm" variant="outline" className={cfg.themeClass} onClick={() => navigate(cfg.path)}>
              {cfg.label} <span className="ml-1.5 text-[10px] opacity-60">{cfg.shortcutLabel}</span>
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Badge key={t} variant="outline" onClick={() => setFilter(t)}
            className={`cursor-pointer transition ${filter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {t === "All" ? "All" : labels[t]}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Badge key={s.key} variant="outline" onClick={() => setStatusFilter(s.key)}
            className={`cursor-pointer transition ${statusFilter === s.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {s.label}
          </Badge>
        ))}
      </div>
      <MockTablePage
        eyebrow="Accounts"
        title="Voucher Center"
        description={isLoading ? "Loading…" : "Cancelled vouchers are hidden by default — switch the status tab above to see them, and Delete to remove one for good."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
          </div>
        }
        kpis={[
          { label: "Shown", value: rows.length },
          { label: "Posted", value: data.filter(v => v.status === "posted").length, tone: "success" },
          { label: "Draft", value: data.filter(v => v.status === "draft").length, tone: "warning" },
          { label: "Cancelled", value: data.filter(v => v.status === "cancelled").length, tone: "danger" },
        ]}
        columns={[
          { key: "date", label: "Date" },
          { key: "number", label: "Voucher #" },
          { key: "type", label: "Type" },
          { key: "debited_to", label: "Debited To" },
          { key: "credited_to", label: "Credited To" },
          { key: "narration", label: "Narration" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
        rowActions={(row) => {
          const v = row._voucher as VoucherRow;
          const blockReason = deleteBlockReason(v);
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/accounting/vouchers/${v.id}`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
              {v.status === "draft" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                      onClick={() => navigate(`/accounting/vouchers/${v.id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              {v.status === "posted"
                ? canDeletePosted && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-8 w-8 ${blockReason ? "text-muted-foreground" : "text-destructive hover:text-destructive"}`}
                          disabled={!!blockReason || busyId === v.id}
                          onClick={() => setHardDeleteTarget(v)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{blockReason ?? "Delete Permanently"}</TooltipContent>
                    </Tooltip>
                  )
                : canDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-8 w-8 ${blockReason ? "text-muted-foreground" : "text-destructive hover:text-destructive"}`}
                          disabled={!!blockReason || busyId === v.id}
                          onClick={() => setDeleteTarget(v)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{blockReason ?? "Delete Voucher"}</TooltipContent>
                    </Tooltip>
                  )}
            </div>
          );
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-left mt-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Voucher No</span><span className="font-medium text-foreground">{deleteTarget?.voucher_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Voucher Type</span><span className="font-medium text-foreground">{deleteTarget ? (labels[deleteTarget.voucher_type] ?? deleteTarget.voucher_type) : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium text-foreground tabular-nums">₹ {deleteTarget ? fmtInr(deleteTarget.total_amount) : ""}</span></div>
                <div className="pt-1 text-destructive">This action cannot be undone.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={busyId === deleteTarget?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HardDeleteVoucherDialog
        target={hardDeleteTarget}
        open={!!hardDeleteTarget}
        onOpenChange={(o) => !o && setHardDeleteTarget(null)}
        onConfirm={handleHardDeleteConfirm}
        typeLabel={hardDeleteTarget ? (labels[hardDeleteTarget.voucher_type] ?? hardDeleteTarget.voucher_type) : ""}
      />
    </div>
  );
}
