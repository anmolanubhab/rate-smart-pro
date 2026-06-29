// src/pages/accounting/VoucherDetail.tsx
// Route: /accounting/vouchers/:id

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, CheckCircle, Trash2, Printer, Share2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fmtInr } from "@/lib/accounting";
import {
  getVoucher, postVoucher, deleteVoucher,
  calculateTotals,
} from "@/lib/voucherService";

// ── tone maps ──────────────────────────────────────────────────────────────

const statusTone: Record<string, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  posted: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

const typeTone: Record<string, string> = {
  Sales: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  Purchase: "border-violet-500/40 text-violet-600 bg-violet-500/10",
  Receipt: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  Payment: "border-rose-500/40 text-rose-600 bg-rose-500/10",
  Journal: "border-slate-500/40 text-slate-600 bg-slate-500/10",
  Contra: "border-orange-500/40 text-orange-600 bg-orange-500/10",
  "Debit Note": "border-red-500/40 text-red-600 bg-red-500/10",
  "Credit Note": "border-teal-500/40 text-teal-600 bg-teal-500/10",
  "Opening Balance": "border-gray-500/40 text-gray-600 bg-gray-500/10",
};

// ── component ────────────────────────────────────────────────────────────

export default function VoucherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: voucher, isLoading, error } = useQuery({
    queryKey: ["voucher-detail", id],
    enabled: !!id,
    queryFn: () => getVoucher(id!),
  });

  useEffect(() => {
    document.title = voucher
      ? `Voucher ${voucher.voucher_no} — RD Pro`
      : "Voucher — RD Pro";
  }, [voucher]);

  // ── handlers ────────────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!user?.id || !id) return;
    setBusy(true);
    try {
      const posted = await postVoucher(user.id, id);
      toast.success(`Voucher ${posted.voucher_no} posted.`);
      qc.invalidateQueries({ queryKey: ["voucher-detail", id] });
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setPostOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await deleteVoucher(id);
      toast.success("Voucher deleted.");
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      navigate("/accounting/vouchers");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  };

  // ── loading / error / not found ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-muted-foreground">
        Loading voucher…
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-destructive">
          Voucher not found or access denied.
        </div>
      </div>
    );
  }

  const totals = calculateTotals(voucher.items ?? []);
  const isDraft = voucher.status === "draft";

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
        }
        .print-show { display: none; }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">

        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 no-print">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: `Voucher ${voucher.voucher_no}`, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied!");
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
            {isDraft && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/accounting/vouchers/${id}/edit`)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setPostOpen(true)}
                  disabled={!totals.isBalanced}
                  title={!totals.isBalanced ? "Entries must be balanced to post" : undefined}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Post
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Voucher card */}
        <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">

          {/* Header strip */}
          <div className="px-6 py-5 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Accounting · Voucher
              </p>
              <h1 className="font-display text-2xl font-bold mt-0.5 font-mono">
                {voucher.voucher_no}
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className={typeTone[voucher.voucher_type] ?? ""}>
                {voucher.voucher_type}
              </Badge>
              <Badge variant="outline" className={statusTone[voucher.status]}>
                {voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Meta grid */}
          <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
              <p className="font-semibold mt-0.5">{voucher.voucher_date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Type</p>
              <p className="font-semibold mt-0.5">{voucher.voucher_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
              <p className="font-semibold mt-0.5 capitalize">{voucher.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Amount</p>
              <p className="font-bold mt-0.5 text-primary tabular-nums">
                ₹ {fmtInr(totals.totalDebit || voucher.total_debit || 0)}
              </p>
            </div>
          </div>

          {/* Narration */}
          {voucher.narration && (
            <div className="px-6 py-3 border-b border-border text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Narration: </span>
              {voucher.narration}
            </div>
          )}

          {/* Imbalance warning */}
          {isDraft && !totals.isBalanced && (voucher.items?.length ?? 0) > 0 && (
            <div className="px-6 py-3 border-b border-border bg-amber-500/5 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 no-print">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Entries are unbalanced (difference: ₹ {fmtInr(totals.difference)}).
              Edit the voucher to fix before posting.
            </div>
          )}

          {/* Ledger entries table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">#</th>
                  <th className="px-6 py-3 text-left">Ledger Account</th>
                  <th className="px-6 py-3 text-right">Debit (Dr)</th>
                  <th className="px-6 py-3 text-right">Credit (Cr)</th>
                  <th className="px-6 py-3 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {(voucher.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No ledger entries found.
                    </td>
                  </tr>
                ) : (
                  (voucher.items ?? []).map((item, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-6 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-6 py-2.5 font-medium">
                        {item.ledger_name || item.ledger_account_id}
                      </td>
                      <td className="px-6 py-2.5 text-right tabular-nums text-emerald-600 font-medium">
                        {item.debit > 0 ? `₹ ${fmtInr(item.debit)}` : "—"}
                      </td>
                      <td className="px-6 py-2.5 text-right tabular-nums text-destructive font-medium">
                        {item.credit > 0 ? `₹ ${fmtInr(item.credit)}` : "—"}
                      </td>
                      <td className="px-6 py-2.5 text-muted-foreground text-xs">
                        {item.remarks || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Totals footer */}
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-6 py-3 font-semibold text-xs uppercase tracking-wider">
                    Total
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-emerald-600">
                    ₹ {fmtInr(totals.totalDebit)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-destructive">
                    ₹ {fmtInr(totals.totalCredit)}
                  </td>
                  <td className="px-6 py-3">
                    {totals.isBalanced ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                        ✓ Balanced
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">
                        Diff: ₹ {fmtInr(totals.difference)}
                      </Badge>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer meta */}
          <div className="px-6 py-4 border-t border-border bg-muted/10 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div>
              <span className="font-semibold">Created: </span>
              {new Date(voucher.created_at).toLocaleString("en-IN")}
            </div>
            <div>
              <span className="font-semibold">Updated: </span>
              {new Date(voucher.updated_at).toLocaleString("en-IN")}
            </div>
            {voucher.reference_type && (
              <div>
                <span className="font-semibold">Reference: </span>
                {voucher.reference_type} / {voucher.reference_id?.slice(0, 8)}…
              </div>
            )}
          </div>
        </div>

        {/* Print-only signature row */}
        <div className="print-show mt-12 pt-4 border-t grid grid-cols-3 gap-8 text-xs text-muted-foreground">
          <div className="text-center">
            <div className="border-t border-foreground/30 mt-10 pt-2">Prepared By</div>
          </div>
          <div className="text-center">
            <div className="border-t border-foreground/30 mt-10 pt-2">Verified By</div>
          </div>
          <div className="text-center">
            <div className="border-t border-foreground/30 mt-10 pt-2">Approved By</div>
          </div>
        </div>

      </div>

      {/* Post confirmation dialog */}
      <AlertDialog open={postOpen} onOpenChange={setPostOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher <strong>{voucher.voucher_no}</strong> will be posted.
              Posted vouchers cannot be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} disabled={busy}>
              Post Voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher <strong>{voucher.voucher_no}</strong> will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
