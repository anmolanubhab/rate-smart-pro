// src/pages/accounting/VoucherForm.tsx
// Routes: /accounting/vouchers/new  |  /accounting/vouchers/:id/edit

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, Save, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";
import {
  VOUCHER_TYPES,
  calculateTotals,
  validateVoucher,
  createVoucher,
  updateVoucher,
  postVoucher,
  getVoucher,
  type VoucherType,
  type VoucherItem,
  type CreateVoucherInput,
} from "@/lib/voucherService";

// ── empty row factory ─────────────────────────────────────────────────────────

const emptyRow = (): VoucherItem => ({
  ledger_account_id: "",
  debit: 0,
  credit: 0,
  remarks: "",
});

// ── component ─────────────────────────────────────────────────────────────────

export default function VoucherForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();

  useEffect(() => {
    document.title = isEdit ? "Edit Voucher — RD Pro" : "New Voucher — RD Pro";
  }, [isEdit]);

  // ── form state ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [vType, setVType] = useState<VoucherType>("Journal");
  const [vDate, setVDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<VoucherItem[]>([emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // ── load existing voucher (edit mode) ───────────────────────────────────
  const { data: existingVoucher, isLoading: loadingVoucher } = useQuery({
    queryKey: ["voucher-detail", id],
    enabled: isEdit,
    queryFn: () => getVoucher(id!),
  });

  useEffect(() => {
    if (existingVoucher) {
      setVType(existingVoucher.voucher_type);
      setVDate(existingVoucher.voucher_date);
      setNarration(existingVoucher.narration ?? "");
      if (existingVoucher.items && existingVoucher.items.length > 0) {
        setItems(existingVoucher.items);
      }
    }
  }, [existingVoucher]);

  // ── ledger accounts list ─────────────────────────────────────────────────
  const { data: ledgers = [] } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  // ── computed totals ──────────────────────────────────────────────────────
  const totals = useMemo(() => calculateTotals(items), [items]);

  // ── row helpers ──────────────────────────────────────────────────────────

  const updateRow = (idx: number, patch: Partial<VoucherItem>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addRow = () => setItems((prev) => [...prev, emptyRow()]);

  const removeRow = (idx: number) => {
    if (items.length <= 2) {
      toast.warning("At least two rows are required.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // When debit is entered, clear credit and vice versa
  const handleDebitChange = (idx: number, val: string) => {
    const n = parseFloat(val) || 0;
    updateRow(idx, { debit: n, credit: n > 0 ? 0 : items[idx].credit });
  };

  const handleCreditChange = (idx: number, val: string) => {
    const n = parseFloat(val) || 0;
    updateRow(idx, { credit: n, debit: n > 0 ? 0 : items[idx].debit });
  };

  // ── build input ──────────────────────────────────────────────────────────

  const buildInput = (): CreateVoucherInput => ({
    voucher_type: vType,
    voucher_date: vDate,
    narration: narration.trim() || undefined,
    items,
  });

  // ── save draft ───────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!user?.id) return;
    const input = buildInput();

    const check = validateVoucher(input, { requireBalanced: false });
    setValidationErrors(check.errors);
    if (!check.valid) return;

    setSaving(true);
    try {
      if (isEdit) {
        await updateVoucher(user.id, { id: id!, ...input });
        toast.success("Voucher updated.");
      } else {
        const v = await createVoucher(user.id, input);
        toast.success(`Voucher ${v.voucher_no} saved as draft.`);
        qc.invalidateQueries({ queryKey: ["vouchers-list"] });
        navigate(`/accounting/vouchers/${v.id}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      qc.invalidateQueries({ queryKey: ["voucher-detail", id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── post voucher ─────────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!user?.id) return;
    const input = buildInput();

    const check = validateVoucher(input, { requireBalanced: true });
    setValidationErrors(check.errors);
    if (!check.valid) return;

    setPosting(true);
    try {
      let targetId = id;

      // If new, create draft first, then post
      if (!isEdit) {
        const v = await createVoucher(user.id, input);
        targetId = v.id;
      } else {
        await updateVoucher(user.id, { id: id!, ...input });
      }

      const posted = await postVoucher(user.id, targetId!);
      toast.success(`Voucher ${posted.voucher_no} posted successfully.`);
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      navigate(`/accounting/vouchers/${posted.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPosting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (isEdit && loadingVoucher) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">
        Loading voucher…
      </div>
    );
  }

  if (isEdit && existingVoucher?.status === "posted") {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-fade-in-up">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Posted vouchers cannot be edited. View the voucher to see details.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(`/accounting/vouchers/${id}`)}>
          View Voucher
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || posting}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Saving…" : "Save Draft"}
          </Button>
          <Button onClick={handlePost} disabled={saving || posting}>
            <CheckCircle className="h-4 w-4 mr-1" />
            {posting ? "Posting…" : "Post Voucher"}
          </Button>
        </div>
      </div>

      {/* Page header */}
      <div>
        <p className="text-sm text-muted-foreground font-medium">Accounting · Vouchers</p>
        <h1 className="font-display text-3xl font-bold mt-1">
          {isEdit ? "Edit Voucher" : "New Voucher"}
        </h1>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-0.5">
              {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Header fields */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Voucher Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Voucher Type <span className="text-destructive">*</span></Label>
            <Select value={vType} onValueChange={(v) => setVType(v as VoucherType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Voucher Date <span className="text-destructive">*</span></Label>
            <input
              type="date"
              value={vDate}
              onChange={(e) => setVDate(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Voucher No (auto-generated) */}
          <div className="space-y-1.5">
            <Label>Voucher No</Label>
            <Input
              value={isEdit ? (existingVoucher?.voucher_no ?? "—") : "(auto-generated)"}
              disabled
              className="text-muted-foreground"
            />
          </div>
        </div>

        {/* Narration */}
        <div className="space-y-1.5">
          <Label>Narration</Label>
          <Textarea
            placeholder="Enter a brief description of this transaction…"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Double-entry table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ledger Entries
          </h2>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-[35%]">Ledger Account</th>
                <th className="px-4 py-3 text-right w-[15%]">Debit (Dr)</th>
                <th className="px-4 py-3 text-right w-[15%]">Credit (Cr)</th>
                <th className="px-4 py-3 text-left w-[28%]">Remarks</th>
                <th className="px-4 py-3 w-[7%]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr key={idx} className="border-t border-border">
                  {/* Ledger account */}
                  <td className="px-4 py-2">
                    <Select
                      value={row.ledger_account_id}
                      onValueChange={(v) => updateRow(idx, { ledger_account_id: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select ledger…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ledgers.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                            {l.group?.name ? ` (${l.group.name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Debit */}
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-xs text-right tabular-nums"
                      value={row.debit || ""}
                      placeholder="0.00"
                      onChange={(e) => handleDebitChange(idx, e.target.value)}
                    />
                  </td>

                  {/* Credit */}
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-xs text-right tabular-nums"
                      value={row.credit || ""}
                      placeholder="0.00"
                      onChange={(e) => handleCreditChange(idx, e.target.value)}
                    />
                  </td>

                  {/* Remarks */}
                  <td className="px-4 py-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Optional remarks…"
                      value={row.remarks}
                      onChange={(e) => updateRow(idx, { remarks: e.target.value })}
                    />
                  </td>

                  {/* Delete row */}
                  <td className="px-4 py-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals footer */}
            <tfoot className="border-t-2 border-border bg-muted/30">
              <tr>
                <td className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">
                  Totals
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">
                  ₹ {fmtInr(totals.totalDebit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-destructive">
                  ₹ {fmtInr(totals.totalCredit)}
                </td>
                <td className="px-4 py-3" colSpan={2}>
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
      </div>

      {/* Balance hint */}
      {!totals.isBalanced && items.some((r) => r.debit > 0 || r.credit > 0) && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            Debit and Credit totals are unequal (difference: ₹ {fmtInr(totals.difference)}).
            You can save as draft, but posting requires balanced entries.
          </AlertDescription>
        </Alert>
      )}

      {/* Bottom action bar */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="outline" onClick={handleSaveDraft} disabled={saving || posting}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          onClick={handlePost}
          disabled={saving || posting || !totals.isBalanced}
          title={!totals.isBalanced ? "Debit and Credit must be equal to post" : undefined}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          {posting ? "Posting…" : "Post Voucher"}
        </Button>
      </div>
    </div>
  );
}
