// src/pages/accounting/VoucherForm.tsx
// Routes: /accounting/vouchers/new  |  /accounting/vouchers/:id/edit
//
// Retired as the entry point for Payment/Receipt/Contra/Journal/Credit Note/
// Debit Note — those 6 types now live in the Universal Voucher Engine (see
// src/components/vouchers/UniversalVoucherEntry.tsx). App.tsx's
// NewVoucherRedirect/EditVoucherRedirect send those types there before this
// component ever mounts, so in normal navigation this form only ever
// actually renders for Sales/Purchase (manual/adjustment entries — the
// normal path is still auto-posting from invoices) and Opening Balance,
// which have no other entry point. The type dropdown below is restricted to
// match on new-voucher creation; edit mode keeps the full list as a safety
// net for pre-existing drafts of any type.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { supabase } from "@/integrations/supabase/client";
import { fetchLedgersWithBalance, ensurePartyLedgers, seedAccounts, fmtInr } from "@/lib/accounting";
import { getLedgerAccountOptions, type LedgerOption } from "@/lib/ledgerFiltering";
import { fetchFinancialNoteSettings } from "@/lib/accountingLock";
import { canOverrideAdjustmentLedger, canUnlockVouchers, canBackdateVoucher } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
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
  type AdjustmentCategorySnapshot,
  typeFromDb,
} from "@/lib/voucherService";

// Types this form still owns for NEW-voucher creation — the other 6 moved
// to the Universal Voucher Engine (src/lib/voucherTypeConfig.ts).
const LEGACY_VOUCHER_TYPES = VOUCHER_TYPES.filter(
  (t) => t === "Sales" || t === "Purchase" || t === "Opening Balance"
);

// ── empty row factory ─────────────────────────────────────────────────────────

const emptyRow = (): VoucherItem => ({
  ledger_account_id: "",
  debit: 0,
  credit: 0,
  remarks: "",
});

// ── which ledger types are selectable in each row, per voucher type ────────
// null = unrestricted (every active ledger — Journal's own spec, and the
// fallback for voucher types with no defined convention here).
type RowFilter = "supplier" | "customer" | "bank_cash" | null;

function getRowFilter(vType: VoucherType, rowIndex: number): RowFilter {
  switch (vType) {
    case "Contra":
      // From Account / To Account — cash or bank only, both sides.
      return "bank_cash";
    case "Payment":
      // Party row is a creditor; every other row is the cash/bank leg.
      return rowIndex === 0 ? "supplier" : "bank_cash";
    case "Receipt":
      // Party row is a debtor; every other row is the cash/bank leg.
      return rowIndex === 0 ? "customer" : "bank_cash";
    // Debit Note / Credit Note deliberately NOT restricted here: this
    // form's "Financial Adjustment" mode covers non-party categories too
    // (Freight, Discount, Rate Difference, GST Difference, Commission,
    // Penalty, Interest, ...) whose default ledgers are Expense/Income
    // accounts, not Sundry Creditors/Debtors -- confirmed live against
    // note_adjustment_categories. Party-scoped Debit/Credit Notes go
    // through the separate Material Return flow (create_purchase_return/
    // create_sales_return), which already only ever touches the invoice's
    // own supplier/party -- no dropdown to restrict there.
    default:
      return null;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VoucherForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const qc = useQueryClient();
  const voucherLockOpts = {
    canEditLockedVoucher: canUnlockVouchers(role, financialRights),
    canBackdateVoucher: canBackdateVoucher(role, financialRights),
  };

  useEffect(() => {
    document.title = isEdit ? "Edit Voucher — RD Pro" : "New Voucher — RD Pro";
  }, [isEdit]);

  // ── form state ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  // ?type=... pre-sets the voucher type when arriving from a dedicated entry
  // point — edit mode always uses the loaded voucher's own type. In practice
  // App.tsx's NewVoucherRedirect already sends Payment/Receipt/Contra/
  // Journal/Credit Note/Debit Note to the Universal Voucher Engine before
  // this form ever mounts, so a fresh "new voucher" here is always one of
  // LEGACY_VOUCHER_TYPES.
  const presetType = !isEdit && searchParams.get("type") ? typeFromDb(searchParams.get("type")!) : null;
  const [vType, setVType] = useState<VoucherType>(presetType ?? "Opening Balance");
  const [vDate, setVDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<VoucherItem[]>([emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // ── Financial Adjustment mode (Debit Note / Credit Note only) ───────────
  const isNoteType = vType === "Debit Note" || vType === "Credit Note";
  const [adjustmentCategoryId, setAdjustmentCategoryId] = useState<string>("");
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>("");
  const [gstBaseAmount, setGstBaseAmount] = useState<string>("");

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
    queryKey: ["linkable-invoices", vType, business?.id],
    enabled: !!business?.id && isNoteType,
    queryFn: async () => {
      if (vType === "Credit Note") {
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

  // Precedence (final, approved rule):
  //   auto_lock    → always locked, absolute — permission never unlocks it.
  //   auto_suggest → locked unless the category allows override AND the
  //                  acting role has accounting override permission.
  //   manual       → never locked.
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

  const onCategoryChange = (id: string) => {
    setAdjustmentCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const defaultLedgerId = vType === "Debit Note" ? cat.debit_default_ledger_id : cat.credit_default_ledger_id;
    setItems((prev) => {
      const next = [...prev];
      if (defaultLedgerId) next[0] = { ...next[0], ledger_account_id: defaultLedgerId };
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
      if (vType === "Credit Note") {
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
        const newRows: VoucherItem[] = row.is_interstate
          ? [{ ledger_account_id: findLedgerId("IGST Output"), debit: 0, credit: Number(row.igst), remarks: "GST (auto)" }]
          : [
              { ledger_account_id: findLedgerId("CGST Output"), debit: 0, credit: Number(row.cgst), remarks: "GST (auto)" },
              { ledger_account_id: findLedgerId("SGST Output"), debit: 0, credit: Number(row.sgst), remarks: "GST (auto)" },
            ];
        setItems((prev) => [...prev, ...newRows]);
      } else {
        // Mirrors create_purchase_return's convention: a single flat GST
        // Input ledger, no CGST/SGST/IGST split.
        setItems((prev) => [...prev, { ledger_account_id: findLedgerId("GST Input"), debit: 0, credit: gstAmount, remarks: "GST (auto)" }]);
      }
      toast.success("GST row(s) added — review before posting");
    } catch (e: any) {
      toast.error(e.message ?? "Could not calculate GST");
    }
  };

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
      if (existingVoucher.adjustment_category_id) setAdjustmentCategoryId(existingVoucher.adjustment_category_id);
      if (existingVoucher.reference_id && existingVoucher.note_mode === "financial_adjustment") {
        setLinkedInvoiceId(existingVoucher.reference_id);
      }
    }
  }, [existingVoucher]);

  // ── ledger accounts list ─────────────────────────────────────────────────
  // Full unrestricted list — used for Journal, for rows with no defined
  // convention (getRowFilter returns null), and as the source list ensuring
  // ensurePartyLedgers()/seedAccounts() run before anything else queries
  // ledger_accounts.
  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
      await ensurePartyLedgers(user!.id);
      return fetchLedgersWithBalance(user!.id);
    },
  });

  // Context-aware lists (Purchase/Sales creditor-debtor, Bank/Cash) for the
  // voucher types that need them — only fetched when actually relevant to
  // the currently-selected voucher type, filtered at the query level (see
  // src/lib/ledgerFiltering.ts), never fetch-all-then-filter-in-JS.
  const rowFilters = [0, 1, 2, 3].map((i) => getRowFilter(vType, i));
  const needsSupplier = rowFilters.includes("supplier");
  const needsCustomer = rowFilters.includes("customer");
  const needsBankCash = rowFilters.includes("bank_cash");

  const { data: supplierLedgers = [] } = useQuery({
    queryKey: ["ledgers-supplier", user?.id, business?.id],
    enabled: !!user?.id && needsSupplier,
    queryFn: () => getLedgerAccountOptions(user!.id, "supplier"),
  });
  const { data: customerLedgers = [] } = useQuery({
    queryKey: ["ledgers-customer", user?.id, business?.id],
    enabled: !!user?.id && needsCustomer,
    queryFn: () => getLedgerAccountOptions(user!.id, "customer"),
  });
  const { data: bankCashLedgers = [] } = useQuery({
    queryKey: ["ledgers-bank-cash", user?.id, business?.id],
    enabled: !!user?.id && needsBankCash,
    queryFn: () => getLedgerAccountOptions(user!.id, ["bank", "cash"]),
  });

  /** Which list a given row should offer, based on the current voucher type. */
  const rowLedgerOptions = (rowIndex: number): (LedgerOption | typeof ledgers[number])[] => {
    switch (getRowFilter(vType, rowIndex)) {
      case "supplier": return supplierLedgers;
      case "customer": return customerLedgers;
      case "bank_cash": return bankCashLedgers;
      default: return ledgers;
    }
  };

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
    ...(isNoteType && {
      note_mode: "financial_adjustment",
      adjustment_category_id: adjustmentCategoryId || null,
      adjustment_category_snapshot: selectedCategory
        ? ({
            category_name: selectedCategory.category_name,
            debit_ledger_name: ledgers.find((l) => l.id === selectedCategory.debit_default_ledger_id)?.name ?? null,
            credit_ledger_name: ledgers.find((l) => l.id === selectedCategory.credit_default_ledger_id)?.name ?? null,
            default_narration: selectedCategory.default_narration ?? null,
          } as AdjustmentCategorySnapshot)
        : null,
      reference_type: linkedInvoiceId ? (vType === "Credit Note" ? "sales_invoice" : "purchase_invoice") : undefined,
      reference_id: linkedInvoiceId || undefined,
    }),
  });

  // If the acting user overrode the category's suggested ledger (only
  // possible when canOverrideAdjustmentLedger granted it), record it —
  // separate from the category CRUD audit trail (Phase 2), this is about
  // the override actually being exercised on a specific voucher.
  const logLedgerOverrideIfAny = async (voucherId: string) => {
    if (!business || !selectedCategory) return;
    const defaultLedgerId = vType === "Debit Note" ? selectedCategory.debit_default_ledger_id : selectedCategory.credit_default_ledger_id;
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
        await updateVoucher(user.id, { id: id!, ...input }, voucherLockOpts);
        toast.success("Voucher updated.");
      } else {
        const v = await createVoucher(user.id, input, voucherLockOpts);
        if (isNoteType) await logLedgerOverrideIfAny(v.id);
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
        const v = await createVoucher(user.id, input, voucherLockOpts);
        targetId = v.id;
        if (isNoteType) await logLedgerOverrideIfAny(v.id);
      } else {
        await updateVoucher(user.id, { id: id!, ...input }, voucherLockOpts);
      }

      const posted = await postVoucher(user.id, targetId!, voucherLockOpts);
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
                {/* Editing a pre-existing voucher of any type (e.g. an old
                    draft from before the Universal Voucher Engine) keeps the
                    full list so it doesn't get stuck with an invalid value;
                    new vouchers only offer the types this form still owns. */}
                {(isEdit ? VOUCHER_TYPES : LEGACY_VOUCHER_TYPES).map((t) => (
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

      {/* Financial Adjustment fields — Debit Note / Credit Note only */}
      {isNoteType && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Financial Adjustment
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Categories are managed in Settings → Financial Note Categories. For a physical goods
              return, use {vType === "Credit Note" ? "Sales Returns" : "Purchase Returns"} instead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Adjustment Category</Label>
              <Select value={adjustmentCategoryId} onValueChange={onCategoryChange}>
                <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                  ))}
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
                  {linkableInvoices.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>
                  ))}
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
              <Button type="button" variant="outline" onClick={calculateGstFromInvoice}>
                Calculate GST from Invoice
              </Button>
            </div>
          )}
        </div>
      )}

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
                      disabled={idx === 0 && ledgerLocked}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={ledgersLoading ? "Loading ledgers…" : "Select ledger…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {rowLedgerOptions(idx).map((l) => (
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
