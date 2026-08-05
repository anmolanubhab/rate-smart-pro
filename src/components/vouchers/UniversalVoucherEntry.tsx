// src/components/vouchers/UniversalVoucherEntry.tsx
//
// The Universal Voucher Engine (Phase 1): one shared entry screen for the 6
// pure accounting voucher types (Payment, Receipt, Contra, Journal, Credit
// Note, Debit Note). Each src/pages/vouchers/*.tsx page is a thin wrapper
// that only supplies `type` — every behavior difference (theme, ledger
// filtering, bill allocation, validation) comes from voucherTypeConfig.ts.
//
// Sales/Purchase are deliberately NOT part of this engine — they keep using
// the existing Document Engine invoice screens.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Printer, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { fetchLedgersWithBalance, ensurePartyLedgers, seedAccounts } from "@/lib/accounting";
import { getLedgerAccountOptions, getAllActiveLedgerOptions, type LedgerOption } from "@/lib/ledgerFiltering";
import { fetchFinancialNoteSettings } from "@/lib/accountingLock";
import { canOverrideAdjustmentLedger, canUnlockVouchers } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  calculateTotals, validateVoucher, createVoucher, updateVoucher, postVoucher, deleteVoucher, getVoucher,
  type VoucherItem, type CreateVoucherInput, type AdjustmentCategorySnapshot,
} from "@/lib/voucherService";
import { VOUCHER_TYPE_CONFIGS, rowFilterFor, type EngineVoucherType } from "@/lib/voucherTypeConfig";
import { useVoucherShortcuts } from "@/hooks/useVoucherShortcuts";
import { applyBillAllocations, type BillAllocationLine } from "@/lib/billAllocation";
import VoucherTypeTabs from "./VoucherTypeTabs";
import VoucherHeaderBar from "./VoucherHeaderBar";
import VoucherLedgerGrid from "./VoucherLedgerGrid";
import VoucherSummaryBar from "./VoucherSummaryBar";
import QuickCreateLedgerDialog from "./QuickCreateLedgerDialog";
import BillAllocationPanel from "./BillAllocationPanel";

const emptyRow = (): VoucherItem => ({ ledger_account_id: "", ledger_name: "", debit: 0, credit: 0, remarks: "" });

export default function UniversalVoucherEntry({ type }: { type: EngineVoucherType }) {
  const config = VOUCHER_TYPE_CONFIGS[type];
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const qc = useQueryClient();
  const voucherLockOpts = { canEditLockedVoucher: canUnlockVouchers(role, financialRights) };

  useEffect(() => {
    document.title = `${config.label} Voucher — RD Pro`;
  }, [config.label]);

  const today = new Date().toISOString().slice(0, 10);
  const [vDate, setVDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [narrationTouched, setNarrationTouched] = useState(false);
  const [items, setItems] = useState<VoucherItem[]>([emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [voucherNo, setVoucherNo] = useState("");
  const [status, setStatus] = useState<"draft" | "posted">("draft");
  const [newLedgerOpen, setNewLedgerOpen] = useState(false);
  const [newLedgerRowIdx, setNewLedgerRowIdx] = useState(0);
  const [billAllocationOpen, setBillAllocationOpen] = useState(false);
  const [billAllocations, setBillAllocations] = useState<BillAllocationLine[]>([]);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Financial Adjustment fields (Credit Note / Debit Note only) — ported
  // from VoucherForm.tsx as-is; unrestricted-row note types keep this logic. ──
  const isNoteType = type === "Credit Note" || type === "Debit Note";
  const [adjustmentCategoryId, setAdjustmentCategoryId] = useState("");
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("");
  const [gstBaseAmount, setGstBaseAmount] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["note-adjustment-categories-active", business?.id],
    enabled: !!business?.id && isNoteType,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("note_adjustment_categories" as any)
        .select("*")
        .eq("business_id", business!.id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: noteSettings } = useQuery({
    queryKey: ["financial-note-settings", business?.id],
    enabled: !!business?.id && isNoteType,
    queryFn: () => fetchFinancialNoteSettings(business!.id),
  });

  const { data: linkableInvoices = [] } = useQuery({
    queryKey: ["linkable-invoices", type, business?.id],
    enabled: !!business?.id && isNoteType,
    queryFn: async () => {
      if (type === "Credit Note") {
        const { data, error } = await supabase
          .from("sales_invoices").select("id, invoice_number, party_id")
          .eq("business_id", business!.id).eq("status", "posted")
          .order("invoice_date", { ascending: false }).limit(200);
        if (error) throw error;
        return (data ?? []) as any[];
      }
      const { data, error } = await supabase
        .from("purchase_invoices").select("id, invoice_number, supplier_id")
        .eq("business_id", business!.id)
        .order("invoice_date", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const selectedCategory = categories.find((c) => c.id === adjustmentCategoryId);
  const ledgerMode = noteSettings?.financial_note_ledger_mode ?? "auto_suggest";
  const ledgerLockReason: string | null = !selectedCategory
    ? null
    : ledgerMode === "manual"
    ? null
    : ledgerMode === "auto_lock"
    ? "locked by business policy (Auto Lock)"
    : !selectedCategory.allow_ledger_override
    ? "locked by this category"
    : !canOverrideAdjustmentLedger(role)
    ? "requires accounting permission to override"
    : null;
  const ledgerLocked = !!ledgerLockReason;
  const gstMode = noteSettings?.financial_note_gst_mode ?? "manual_only";
  const canAutoGst = !!selectedCategory?.gst_applicable && gstMode !== "manual_only" && !!linkedInvoiceId;

  const findLedgerId = (name: string) => ledgers.find((l) => l.name === name)?.id ?? "";

  const onCategoryChange = (catId: string) => {
    setAdjustmentCategoryId(catId);
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const defaultLedgerId = type === "Debit Note" ? cat.debit_default_ledger_id : cat.credit_default_ledger_id;
    setItems((prev) => {
      const next = [...prev];
      if (defaultLedgerId) {
        const l = ledgers.find((x) => x.id === defaultLedgerId);
        next[0] = { ...next[0], ledger_account_id: defaultLedgerId, ledger_name: l?.name ?? "" };
      }
      return next;
    });
    if (!narration.trim() && cat.default_narration) setNarration(cat.default_narration);
  };

  const calculateGstFromInvoice = async () => {
    if (!business || !linkedInvoiceId || !selectedCategory) return;
    const base = Number(gstBaseAmount) || 0;
    if (base <= 0) { toast.error("Enter a base amount to calculate GST on"); return; }
    const rate = Number(selectedCategory.default_gst_rate) || 0;
    if (rate <= 0) { toast.error("This category has no default GST rate configured"); return; }
    const gstAmount = Math.round(base * rate) / 100;
    try {
      if (type === "Credit Note") {
        const invoice = linkableInvoices.find((i: any) => i.id === linkedInvoiceId);
        const [{ data: biz }, { data: party }] = await Promise.all([
          supabase.from("businesses").select("gst_number").eq("id", business.id).single(),
          supabase.from("parties").select("gst").eq("id", (invoice as any)?.party_id).maybeSingle(),
        ]);
        const { data: split, error } = await supabase.rpc("gst_split_amounts" as never, {
          _seller_gstin: biz?.gst_number ?? null,
          _buyer_gstin: party?.gst ?? null,
          _gst_total: gstAmount,
        } as never);
        if (error) throw error;
        const row: any = Array.isArray(split) ? split[0] : split;
        const mk = (name: string, credit: number): VoucherItem => ({
          ledger_account_id: findLedgerId(name), ledger_name: name, debit: 0, credit, remarks: "GST (auto)",
        });
        const newRows: VoucherItem[] = row.is_interstate
          ? [mk("IGST Output", Number(row.igst))]
          : [mk("CGST Output", Number(row.cgst)), mk("SGST Output", Number(row.sgst))];
        setItems((prev) => [...prev, ...newRows]);
      } else {
        setItems((prev) => [...prev, {
          ledger_account_id: findLedgerId("GST Input"), ledger_name: "GST Input", debit: 0, credit: gstAmount, remarks: "GST (auto)",
        }]);
      }
      toast.success("GST row(s) added — review before posting");
    } catch (e: any) {
      toast.error(e.message ?? "Could not calculate GST");
    }
  };

  // ── load existing voucher (edit mode) ──────────────────────────────────
  const { data: existingVoucher, isLoading: loadingVoucher } = useQuery({
    queryKey: ["voucher-detail", id],
    enabled: isEdit,
    queryFn: () => getVoucher(id!),
  });

  useEffect(() => {
    if (existingVoucher) {
      setVDate(existingVoucher.voucher_date);
      setNarration(existingVoucher.narration ?? "");
      setNarrationTouched(true);
      setVoucherNo(existingVoucher.voucher_no);
      setStatus(existingVoucher.status === "posted" ? "posted" : "draft");
      if (existingVoucher.items && existingVoucher.items.length > 0) setItems(existingVoucher.items);
      if (existingVoucher.adjustment_category_id) setAdjustmentCategoryId(existingVoucher.adjustment_category_id);
      if (existingVoucher.reference_id && existingVoucher.note_mode === "financial_adjustment") {
        setLinkedInvoiceId(existingVoucher.reference_id);
      }
    }
  }, [existingVoucher]);

  // ── ledger accounts ─────────────────────────────────────────────────────
  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
      await ensurePartyLedgers(user!.id);
      return fetchLedgersWithBalance(user!.id);
    },
  });

  const rowFilters = [0, 1, 2, 3].map((i) => rowFilterFor(config, i));
  const needsSupplier = rowFilters.includes("supplier");
  const needsCustomer = rowFilters.includes("customer");
  const needsBankCash = rowFilters.includes("bank_cash");
  const needsUnrestricted = rowFilters.includes("unrestricted") || isNoteType;

  const { data: supplierLedgers = [] } = useQuery({
    queryKey: ["ledgers-supplier", user?.id, business?.id],
    enabled: !!user?.id && needsSupplier,
    // Payment's party row must also accept: direct expense ledgers (e.g.
    // "Advertisement Expense") — most Payment vouchers pay a cash expense
    // outright rather than settling a supplier bill; and customer ledgers —
    // returning a customer's advance is a real Payment (Dr Customer, Cr
    // Cash/Bank), not just settling what we owe a supplier.
    queryFn: () => getLedgerAccountOptions(user!.id, ["supplier", "expense", "customer"]),
  });
  const { data: customerLedgers = [] } = useQuery({
    queryKey: ["ledgers-customer", user?.id, business?.id],
    enabled: !!user?.id && needsCustomer,
    // Mirrors supplierLedgers: Receipt's party row also accepts direct
    // income ledgers (e.g. "Interest Received") received outside a sale,
    // and supplier ledgers — receiving a refund/advance-back from a
    // supplier is a real Receipt (Dr Cash/Bank, Cr Supplier).
    queryFn: () => getLedgerAccountOptions(user!.id, ["customer", "income", "supplier"]),
  });
  const { data: bankCashLedgers = [] } = useQuery({
    queryKey: ["ledgers-bank-cash", user?.id, business?.id],
    enabled: !!user?.id && needsBankCash,
    queryFn: () => getLedgerAccountOptions(user!.id, ["bank", "cash"]),
  });
  const { data: unrestrictedLedgers = [] } = useQuery({
    queryKey: ["ledgers-all-active", user?.id, business?.id],
    enabled: !!user?.id && needsUnrestricted,
    queryFn: () => getAllActiveLedgerOptions(user!.id),
  });

  const ledgerOptionsForRow = (rowIndex: number): LedgerOption[] => {
    if (isNoteType) return unrestrictedLedgers;
    switch (rowFilterFor(config, rowIndex)) {
      case "supplier": return supplierLedgers;
      case "customer": return customerLedgers;
      case "bank_cash": return bankCashLedgers;
      default: return unrestrictedLedgers;
    }
  };

  // ── computed ──────────────────────────────────────────────────────────
  const totals = useMemo(() => calculateTotals(items), [items]);
  const partyRow = items[0];
  const partyLedgerName = config.billAllocation ? (partyRow?.ledger_name || "") : "";
  const cashBankRow = items.find((_, i) => rowFilterFor(config, i) === "bank_cash" && items[i].ledger_account_id);
  const cashBankLedger = cashBankRow ? ledgers.find((l) => l.id === cashBankRow.ledger_account_id) : undefined;
  // Bill allocation queries sales_invoices/purchase_invoices by parties.id,
  // not ledger_accounts.id — resolve the party row's underlying party_id.
  const partyLedgerFull = partyRow?.ledger_account_id ? ledgers.find((l) => l.id === partyRow.ledger_account_id) : undefined;
  const partyId = partyLedgerFull?.party_id ?? null;

  // ── auto narration — fills once, never overwrites user edits ───────────
  useEffect(() => {
    if (narrationTouched || isEdit) return;
    const amount = totals.totalDebit || totals.totalCredit;
    if (!partyLedgerName && !amount) return;
    setNarration(config.autoNarration(partyLedgerName, amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyLedgerName, totals.totalDebit, totals.totalCredit]);

  // ── row helpers ──────────────────────────────────────────────────────────
  const updateRow = (idx: number, patch: Partial<VoucherItem>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addRow = () => setItems((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) => {
    if (items.length <= config.minRows) { toast.warning(`At least ${config.minRows} rows are required.`); return; }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── build & save ──────────────────────────────────────────────────────
  const buildInput = (): CreateVoucherInput => ({
    voucher_type: config.voucherServiceType,
    voucher_date: vDate,
    narration: narration.trim() || undefined,
    items,
    ...(isNoteType && {
      note_mode: "financial_adjustment" as const,
      adjustment_category_id: adjustmentCategoryId || null,
      adjustment_category_snapshot: selectedCategory
        ? ({
            category_name: selectedCategory.category_name,
            debit_ledger_name: ledgers.find((l) => l.id === selectedCategory.debit_default_ledger_id)?.name ?? null,
            credit_ledger_name: ledgers.find((l) => l.id === selectedCategory.credit_default_ledger_id)?.name ?? null,
            default_narration: selectedCategory.default_narration ?? null,
          } as AdjustmentCategorySnapshot)
        : null,
      reference_type: linkedInvoiceId ? (type === "Credit Note" ? "sales_invoice" : "purchase_invoice") : undefined,
      reference_id: linkedInvoiceId || undefined,
    }),
  });

  const logLedgerOverrideIfAny = async (voucherId: string) => {
    if (!business || !selectedCategory) return;
    const defaultLedgerId = type === "Debit Note" ? selectedCategory.debit_default_ledger_id : selectedCategory.credit_default_ledger_id;
    const actualLedgerId = items[0]?.ledger_account_id;
    if (!defaultLedgerId || !actualLedgerId || actualLedgerId === defaultLedgerId) return;
    await logAudit({
      business_id: business.id,
      action: "ADJUSTMENT_LEDGER_OVERRIDE",
      entity_type: "vouchers",
      entity_id: voucherId,
      new_value: {
        category: selectedCategory.category_name,
        default_ledger: ledgers.find((l) => l.id === defaultLedgerId)?.name ?? defaultLedgerId,
        overridden_to: ledgers.find((l) => l.id === actualLedgerId)?.name ?? actualLedgerId,
      },
    });
  };

  const handleSaveDraft = async () => {
    if (!user?.id) return;
    const input = buildInput();
    const check = validateVoucher(input, { requireBalanced: false });
    setValidationErrors(check.errors);
    if (!check.valid) return;

    setSaving(true);
    try {
      if (isEdit) {
        await updateVoucher(user.id, { id: id!, ...input }, voucherLockOpts);
        toast.success("Voucher updated.");
        qc.invalidateQueries({ queryKey: ["voucher-detail", id] });
      } else {
        const v = await createVoucher(user.id, input, voucherLockOpts);
        if (isNoteType) await logLedgerOverrideIfAny(v.id);
        toast.success(`Voucher ${v.voucher_no} saved as draft.`);
        navigate(`${config.path}/${v.id}/edit`);
      }
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async () => {
    if (!user?.id) return;
    const input = buildInput();
    const check = validateVoucher(input, { requireBalanced: true });
    setValidationErrors(check.errors);
    if (!check.valid) return;

    setPosting(true);
    try {
      let targetId = id;
      if (!isEdit) {
        const v = await createVoucher(user.id, input, voucherLockOpts);
        targetId = v.id;
        if (isNoteType) await logLedgerOverrideIfAny(v.id);
      } else {
        await updateVoucher(user.id, { id: id!, ...input }, voucherLockOpts);
      }
      const posted = await postVoucher(user.id, targetId!, voucherLockOpts);

      if (config.billAllocation && billAllocations.length > 0) {
        try {
          await applyBillAllocations(config.billAllocation, billAllocations);
        } catch (e: any) {
          toast.error(`Voucher posted, but bill allocation failed: ${e.message}`);
        }
      }

      toast.success(`Voucher ${posted.voucher_no} posted successfully.`);
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      navigate(`${config.path}/${posted.id}/edit`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPosting(false);
    }
  };

  // Alt+S: post if balanced, else save draft — matches Tally's "Accept" key.
  const handleSaveShortcut = () => {
    if (totals.isBalanced) handlePost();
    else handleSaveDraft();
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm("Delete this draft voucher? This cannot be undone.")) return;
    try {
      await deleteVoucher(id, voucherLockOpts);
      toast.success("Voucher deleted.");
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      navigate("/accounts/vouchers");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isDirty = items.some((r) => r.ledger_account_id || r.debit || r.credit);

  useVoucherShortcuts(
    {
      onSwitchType: (t) => {
        if (t === type) return;
        if (isDirty && !window.confirm("Discard the current entry and switch voucher type?")) return;
        navigate(VOUCHER_TYPE_CONFIGS[t].path);
      },
      onEditDate: () => dateInputRef.current?.focus(),
      onSave: handleSaveShortcut,
      onEscape: () => navigate("/accounts/vouchers"),
      onNewLedger: () => {
        // Target the first row still missing a ledger — the one the operator is naturally filling next.
        const emptyIdx = items.findIndex((r) => !r.ledger_account_id);
        setNewLedgerRowIdx(emptyIdx >= 0 ? emptyIdx : items.length - 1);
        setNewLedgerOpen(true);
      },
      onBillAllocation: config.billAllocation ? () => setBillAllocationOpen(true) : undefined,
    },
    [type, isDirty, totals.isBalanced, items, vDate, narration, adjustmentCategoryId, linkedInvoiceId, isEdit, id]
  );

  if (isEdit && loadingVoucher) {
    return <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">Loading voucher…</div>;
  }

  const readOnly = status === "posted";

  return (
    <div className={`${config.themeClass} max-w-5xl mx-auto space-y-4 animate-fade-in-up`}>
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/accounts/vouchers")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voucher Center (Esc)
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" /> Print
        </Button>
      </div>

      <VoucherTypeTabs active={type} isDirty={isDirty} />

      {readOnly && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Posted vouchers cannot be edited. Cancel it from Voucher Center to reverse it.</AlertDescription>
        </Alert>
      )}

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

      <fieldset disabled={readOnly} className="space-y-4">
        <VoucherHeaderBar
          ref={dateInputRef}
          label={config.label}
          voucherNo={voucherNo}
          date={vDate}
          onDateChange={setVDate}
          narration={narration}
          onNarrationChange={(v) => { setNarration(v); setNarrationTouched(true); }}
          cashBankPreview={cashBankLedger ? { name: cashBankLedger.name, balance: cashBankLedger.balance ?? 0 } : null}
        />

        {isNoteType && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Financial Adjustment</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Categories are managed in Settings → Financial Note Categories. For a physical goods
                return, use {type === "Credit Note" ? "Sales Returns" : "Purchase Returns"} instead.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Adjustment Category</Label>
                <Select value={adjustmentCategoryId} onValueChange={onCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {ledgerLocked && (
                  <p className="text-xs text-amber-600">Ledger {ledgerLockReason} — the first row below can't be changed.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Link Invoice (optional)</Label>
                <Select value={linkedInvoiceId || "__none"} onValueChange={(v) => setLinkedInvoiceId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {linkableInvoices.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canAutoGst && (
              <div className="flex flex-col sm:flex-row gap-3 items-end rounded-lg border border-dashed p-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Base Amount (for GST calc)</Label>
                  <Input type="number" min="0" step="0.01" value={gstBaseAmount} onChange={(e) => setGstBaseAmount(e.target.value)} placeholder="0.00" />
                </div>
                <Button type="button" variant="outline" onClick={calculateGstFromInvoice}>Calculate GST from Invoice</Button>
              </div>
            )}
          </div>
        )}

        <VoucherLedgerGrid
          items={items}
          minRows={config.minRows}
          ledgersLoading={ledgersLoading}
          ledgerOptionsForRow={ledgerOptionsForRow}
          onUpdateRow={updateRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          lockedRowIndex={ledgerLocked ? 0 : null}
        />

        {config.billAllocation && partyId && (
          <div className="flex justify-end items-center gap-2">
            {billAllocations.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {billAllocations.length} bill{billAllocations.length > 1 ? "s" : ""} allocated
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setBillAllocationOpen(true)}>
              Bill Allocation (Ctrl+B)
            </Button>
          </div>
        )}

        <VoucherSummaryBar totals={totals} />

        {!totals.isBalanced && items.some((r) => r.debit > 0 || r.credit > 0) && (
          <Alert>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Debit and Credit totals are unequal. You can save as draft, but posting requires balanced entries.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-3 pb-8">
          {isEdit && status === "draft" && (
            <Button variant="outline" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || posting}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            onClick={handlePost}
            disabled={saving || posting || !totals.isBalanced}
            title={!totals.isBalanced ? "Debit and Credit must be equal to post" : "Alt+S"}
          >
            <CheckCircle className="h-4 w-4 mr-1" /> {posting ? "Posting…" : "Post Voucher (Alt+S)"}
          </Button>
        </div>
      </fieldset>

      {business && user && (
        <QuickCreateLedgerDialog
          open={newLedgerOpen}
          onOpenChange={setNewLedgerOpen}
          businessId={business.id}
          userId={user.id}
          onCreated={(l) => {
            updateRow(newLedgerRowIdx, { ledger_account_id: l.id, ledger_name: l.name });
            qc.invalidateQueries({ queryKey: ["ledgers"] });
            qc.invalidateQueries({ queryKey: ["ledgers-supplier"] });
            qc.invalidateQueries({ queryKey: ["ledgers-customer"] });
            qc.invalidateQueries({ queryKey: ["ledgers-bank-cash"] });
            qc.invalidateQueries({ queryKey: ["ledgers-all-active"] });
          }}
        />
      )}

      {config.billAllocation && business && partyId && (
        <BillAllocationPanel
          open={billAllocationOpen}
          onOpenChange={setBillAllocationOpen}
          kind={config.billAllocation}
          businessId={business.id}
          partyId={partyId}
          partyName={partyLedgerFull?.name ?? partyLedgerName}
          voucherAmount={config.billAllocation === "supplier" ? (partyRow?.debit || 0) : (partyRow?.credit || 0)}
          initialAllocations={billAllocations}
          onApply={setBillAllocations}
        />
      )}
    </div>
  );
}
