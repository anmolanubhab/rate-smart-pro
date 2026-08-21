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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { fetchLedgersWithBalance, ensurePartyLedgers, seedAccounts } from "@/lib/accounting";
import { getLedgerAccountOptions, getAllActiveLedgerOptions, NON_CASH_BANK_LEDGER_TYPES, type LedgerOption } from "@/lib/ledgerFiltering";
import { fetchFinancialNoteSettings } from "@/lib/accountingLock";
import { canOverrideAdjustmentLedger, canUnlockVouchers, canBackdateVoucher } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  calculateTotals, validateVoucher, validateContraLegs, validateContraInstrument,
  createVoucher, updateVoucher, postVoucher, deleteVoucher, getVoucher,
  INSTRUMENT_TYPES,
  type VoucherItem, type CreateVoucherInput, type AdjustmentCategorySnapshot, type InstrumentType,
} from "@/lib/voucherService";
import { VOUCHER_TYPE_CONFIGS, rowFilterFor, type EngineVoucherType } from "@/lib/voucherTypeConfig";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import { buildVoucherUdm, VOUCHER_REGISTRY_ID } from "@/lib/documentUdm/voucherUdm";
import { useVoucherShortcuts } from "@/hooks/useVoucherShortcuts";
import { applyBillAllocations, type BillAllocationLine } from "@/lib/billAllocation";
import VoucherTypeTabs from "./VoucherTypeTabs";
import VoucherHeaderBar from "./VoucherHeaderBar";
import VoucherLedgerGrid from "./VoucherLedgerGrid";
import VoucherSummaryBar from "./VoucherSummaryBar";
import QuickCreateLedgerDialog from "./QuickCreateLedgerDialog";
import QuickCreateParty from "@/components/quickCreate/QuickCreateParty";
import BillAllocationPanel from "./BillAllocationPanel";

const emptyRow = (): VoucherItem => ({ ledger_account_id: "", ledger_name: "", debit: 0, credit: 0, remarks: "" });

export default function UniversalVoucherEntry({ type }: { type: EngineVoucherType }) {
  const config = VOUCHER_TYPE_CONFIGS[type];
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  // Smart Edit: a posted voucher can't be edited directly (see
  // voucherService.updateVoucher), so VoucherDetail's "Edit" action instead
  // cancels it and sends the user here with ?copyFrom=<old id> — this
  // screen then behaves exactly like a normal create, just pre-filled with
  // the cancelled voucher's values, so it feels like editing without ever
  // touching the immutable posted record.
  const copyFromId = !isEdit ? searchParams.get("copyFrom") : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, financialRights, permissions } = useBusiness();
  const qc = useQueryClient();
  const voucherLockOpts = {
    canEditLockedVoucher: canUnlockVouchers(role, financialRights),
    canBackdateVoucher: canBackdateVoucher(role, financialRights),
  };

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
  // Quick Create Master: Ctrl+N/Alt+N is context-aware -- a party-filtered
  // row (Payment/Receipt's row 0) opens QuickCreateParty instead of the
  // ledger dialog above, per the target row's rowFilterFor() result.
  const [newPartyOpen, setNewPartyOpen] = useState(false);
  const [newPartyRowIdx, setNewPartyRowIdx] = useState(0);
  const [newPartyPresetType, setNewPartyPresetType] = useState<"customer" | "supplier">("customer");
  const [billAllocationOpen, setBillAllocationOpen] = useState(false);
  const [billAllocations, setBillAllocations] = useState<BillAllocationLine[]>([]);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Financial Adjustment fields (Credit Note / Debit Note only) — ported
  // from VoucherForm.tsx as-is; unrestricted-row note types keep this logic. ──
  const isNoteType = type === "Credit Note" || type === "Debit Note";
  const [adjustmentCategoryId, setAdjustmentCategoryId] = useState("");
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("");
  const [gstBaseAmount, setGstBaseAmount] = useState("");

  // ── Instrument Details (Contra only) — Tally/Busy-style Bank Contra needs
  // these but nothing in the Universal Voucher Engine collected them before. ──
  const isContra = type === "Contra";
  const [instrumentType, setInstrumentType] = useState<InstrumentType | "">("");
  const [instrumentNo, setInstrumentNo] = useState("");
  const [instrumentDate, setInstrumentDate] = useState("");
  const [bankBranch, setBankBranch] = useState("");

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
      setInstrumentType(existingVoucher.instrument_type ?? "");
      setInstrumentNo(existingVoucher.instrument_no ?? "");
      setInstrumentDate(existingVoucher.instrument_date ?? "");
      setBankBranch(existingVoucher.bank_branch ?? "");
    }
  }, [existingVoucher]);

  // ── Smart Edit: prefill from the cancelled voucher (?copyFrom=) ────────
  // Same shape as the edit-mode load above, but voucherNo/status are left
  // alone — this is a genuine new draft, not the old record, and posting
  // it will get its own fresh voucher number.
  const { data: copyFromVoucher } = useQuery({
    queryKey: ["voucher-detail", copyFromId],
    enabled: !!copyFromId,
    queryFn: () => getVoucher(copyFromId!),
  });

  useEffect(() => {
    if (copyFromVoucher) {
      setVDate(copyFromVoucher.voucher_date);
      setNarration(copyFromVoucher.narration ?? "");
      setNarrationTouched(true);
      if (copyFromVoucher.items && copyFromVoucher.items.length > 0) {
        setItems(copyFromVoucher.items.map((it) => ({ ...it, id: undefined })));
      }
      if (copyFromVoucher.adjustment_category_id) setAdjustmentCategoryId(copyFromVoucher.adjustment_category_id);
      if (copyFromVoucher.reference_id && copyFromVoucher.note_mode === "financial_adjustment") {
        setLinkedInvoiceId(copyFromVoucher.reference_id);
      }
      setInstrumentType(copyFromVoucher.instrument_type ?? "");
      setInstrumentNo(copyFromVoucher.instrument_no ?? "");
      setInstrumentDate(copyFromVoucher.instrument_date ?? "");
      setBankBranch(copyFromVoucher.bank_branch ?? "");
      toast.info(`Pre-filled from cancelled voucher ${copyFromVoucher.voucher_no} — review and save.`);
    }
  }, [copyFromVoucher]);

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
    // Payment's party row accepts any non-Cash/Bank ledger: suppliers,
    // customers (returning an advance is a real Payment — Dr Customer, Cr
    // Cash/Bank), direct expenses, and further (assets, liabilities, tax,
    // etc.) since a voucher's *type* doesn't restrict which ledger is valid
    // here — only Cash/Bank is reserved, for the counter-leg. See
    // NON_CASH_BANK_LEDGER_TYPES.
    queryFn: () => getLedgerAccountOptions(user!.id, NON_CASH_BANK_LEDGER_TYPES),
  });
  const { data: customerLedgers = [] } = useQuery({
    queryKey: ["ledgers-customer", user?.id, business?.id],
    enabled: !!user?.id && needsCustomer,
    // Mirrors supplierLedgers (same underlying list): Receipt's party row
    // accepts any non-Cash/Bank ledger — customers, suppliers (receiving a
    // refund/advance-back is a real Receipt — Dr Cash/Bank, Cr Supplier),
    // direct income, and further, for the same reason.
    queryFn: () => getLedgerAccountOptions(user!.id, NON_CASH_BANK_LEDGER_TYPES),
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

  // Cash-vs-Bank lookup for Contra's leg validation (same-ledger / Cash→Cash).
  const ledgerTypeById = useMemo(
    () => Object.fromEntries(bankCashLedgers.map((l) => [l.id, l.account_type])),
    [bankCashLedgers]
  );
  const contraLegErrors = isContra ? validateContraLegs(items, ledgerTypeById).errors : [];

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
    ...(isContra && {
      instrument_type: instrumentType || null,
      instrument_no: instrumentNo.trim() || null,
      instrument_date: instrumentDate || null,
      bank_branch: bankBranch.trim() || null,
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
    const errors = [...check.errors];
    if (isContra) errors.push(...validateContraLegs(items, ledgerTypeById).errors);
    setValidationErrors(errors);
    if (errors.length > 0) return;

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
    const errors = [...check.errors];
    if (isContra) {
      errors.push(...validateContraLegs(items, ledgerTypeById).errors);
      errors.push(...validateContraInstrument(instrumentType || null, instrumentNo, instrumentDate).errors);
    }
    setValidationErrors(errors);
    if (errors.length > 0) return;

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
    if (!id || !user) return;
    if (!window.confirm("Delete this draft voucher? This cannot be undone.")) return;
    try {
      await deleteVoucher(user.id, id, undefined, voucherLockOpts);
      toast.success("Voucher deleted.");
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      navigate("/accounts/vouchers");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isDirty = items.some((r) => r.ledger_account_id || r.debit || r.credit);

  // Shared by the Ctrl+N/Alt+N shortcut (targets the first still-blank row)
  // and the ledger grid's own "+ Create New" dropdown entry (targets
  // whichever row's picker is open) -- one dispatch rule, not two.
  const openQuickCreateForRow = (rowIdx: number) => {
    const filter = rowFilterFor(config, rowIdx);
    if (filter === "supplier" || filter === "customer") {
      setNewPartyRowIdx(rowIdx);
      setNewPartyPresetType(filter);
      setNewPartyOpen(true);
    } else {
      setNewLedgerRowIdx(rowIdx);
      setNewLedgerOpen(true);
    }
  };

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
      onQuickCreate: () => {
        // Target the first row still missing a ledger — the one the operator is naturally filling next.
        const emptyIdx = items.findIndex((r) => !r.ledger_account_id);
        openQuickCreateForRow(emptyIdx >= 0 ? emptyIdx : items.length - 1);
      },
      onBillAllocation: config.billAllocation ? () => setBillAllocationOpen(true) : undefined,
    },
    [type, isDirty, totals.isBalanced, items, vDate, narration, adjustmentCategoryId, linkedInvoiceId, isEdit, id, instrumentType, instrumentNo, instrumentDate, bankBranch]
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
        {readOnly && id && (
          <DocumentOutputCenter
            documentTypeId={VOUCHER_REGISTRY_ID[type]}
            documentId={id}
            documentNumber={voucherNo}
            getUdm={() => getVoucher(id).then(buildVoucherUdm)}
          />
        )}
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

      <fieldset disabled={readOnly} className="space-y-4 min-w-0">
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

        {isContra && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Instrument Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Instrument Type <span className="text-destructive">*</span></Label>
                <Select value={instrumentType} onValueChange={(v) => setInstrumentType(v as InstrumentType)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {INSTRUMENT_TYPES.map((it) => <SelectItem key={it} value={it}>{it}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {instrumentType === "Cheque" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Cheque Number <span className="text-destructive">*</span></Label>
                    <Input value={instrumentNo} onChange={(e) => setInstrumentNo(e.target.value)} placeholder="e.g. 123456" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cheque Date <span className="text-destructive">*</span></Label>
                    <input
                      type="date"
                      value={instrumentDate}
                      onChange={(e) => setInstrumentDate(e.target.value)}
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </>
              )}

              {instrumentType && instrumentType !== "Cheque" && instrumentType !== "Cash" && (
                <div className="space-y-1.5">
                  <Label>UTR / Reference Number <span className="text-destructive">*</span></Label>
                  <Input value={instrumentNo} onChange={(e) => setInstrumentNo(e.target.value)} placeholder="e.g. UTR/transaction reference" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Branch <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Branch name" />
              </div>
            </div>
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
          onQuickCreate={openQuickCreateForRow}
        />

        {isContra && contraLegErrors.length > 0 && items.some((r) => r.ledger_account_id) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc pl-4 space-y-0.5">
                {contraLegErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

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
            data-post-voucher-button
            onClick={handlePost}
            disabled={saving || posting || !totals.isBalanced}
            title={!totals.isBalanced ? "Debit and Credit must be equal to post" : "Alt+S"}
          >
            <CheckCircle className="h-4 w-4 mr-1" /> {posting ? "Posting…" : "Post Voucher (Alt+S)"}
          </Button>
        </div>
      </fieldset>

      {business && user && (
        <>
          <QuickCreateLedgerDialog
            open={newLedgerOpen}
            onOpenChange={setNewLedgerOpen}
            businessId={business.id}
            userId={user.id}
            role={role}
            permissions={permissions}
            onCreated={(l) => {
              updateRow(newLedgerRowIdx, { ledger_account_id: l.id, ledger_name: l.name });
              qc.invalidateQueries({ queryKey: ["ledgers"] });
              qc.invalidateQueries({ queryKey: ["ledgers-supplier"] });
              qc.invalidateQueries({ queryKey: ["ledgers-customer"] });
              qc.invalidateQueries({ queryKey: ["ledgers-bank-cash"] });
              qc.invalidateQueries({ queryKey: ["ledgers-all-active"] });
            }}
          />
          <QuickCreateParty
            open={newPartyOpen}
            onOpenChange={setNewPartyOpen}
            businessId={business.id}
            userId={user.id}
            role={role}
            permissions={permissions}
            presetType={newPartyPresetType}
            onCreated={async (party) => {
              // This row's field is a ledger picker filtered to
              // customer/supplier-type ledgers (see getLedgerAccountOptions
              // in src/lib/ledgerFiltering.ts) -- ensurePartyLedgers()
              // inside QuickCreateParty already created the party's linked
              // ledger the same way every party save does, so look that
              // ledger up and plug it into the row exactly like a direct
              // ledger quick-create would.
              const { data } = await supabase
                .from("ledger_accounts")
                .select("id, name")
                .eq("party_id", party.id)
                .eq("business_id", business.id)
                .maybeSingle();
              if (data) {
                updateRow(newPartyRowIdx, { ledger_account_id: (data as any).id, ledger_name: (data as any).name });
              }
              qc.invalidateQueries({ queryKey: ["ledgers"] });
              qc.invalidateQueries({ queryKey: ["ledgers-supplier"] });
              qc.invalidateQueries({ queryKey: ["ledgers-customer"] });
            }}
          />
        </>
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
