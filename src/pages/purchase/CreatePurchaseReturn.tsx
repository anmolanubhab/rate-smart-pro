import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Save, X, Ban, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { computePurchaseLine } from "@/lib/purchaseCalc";
import { useRoundOffSettings, resolveRoundOff } from "@/lib/roundOffSettings";
import { fetchPurchaseReturnedQty, cancelPurchaseReturn } from "@/lib/returns";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentGridTable, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { useDocumentShortcuts } from "@/hooks/useDocumentShortcuts";

// Purchase Return mirrors Purchase Invoice's document shell 1:1 (same header
// grid, same ledger-style line-item table, same totals panel) so the two
// screens read as the same family of document -- the only structural
// difference is that a return's lines are always loaded from an existing
// invoice's lines (never freely product-searched) and the one editable
// quantity per line is capped at what's actually still returnable.
// type="purchase_return" alone gives it the pre-existing orange
// .theme-purchase-return palette (see DocumentRoot.tsx / index.css) instead
// of Purchase Invoice's blue -- no bespoke styling needed here.

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[140px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[160px] max-w-[220px]" },
  { key: "rate", header: "Rate (₹)", align: "right", widthClass: "w-24" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-16" },
  { key: "adisc", header: "Add'l %", align: "right", widthClass: "w-16" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-16" },
  { key: "invoiced", header: "Invoiced", align: "right", widthClass: "w-16" },
  { key: "returned", header: "Returned", align: "right", widthClass: "w-16" },
  { key: "remaining", header: "Remaining", align: "right", widthClass: "w-16" },
  { key: "returnqty", header: "Return Qty", align: "right", widthClass: "w-20" },
  { key: "taxable", header: "Taxable", align: "right", widthClass: "w-24" },
  { key: "tax", header: "Tax", align: "right", widthClass: "w-20" },
  { key: "total", header: "Total (₹)", align: "right", widthClass: "w-24" },
];

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ReturnLine {
  itemId: string;
  productId: string | null;
  partNumber: string;
  description: string;
  rate: number;
  discountPercent: number;
  additionalDiscountPercent: number;
  gstPercent: number;
  invoicedQty: number;
  returnedQty: number;
  returnQty: number;
}

export default function CreatePurchaseReturn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: editId } = useParams<{ id?: string }>();
  const duplicateState = location.state as { duplicateInvoiceId?: string; duplicateReason?: string; duplicateQtyByItem?: Record<string, number> } | null;
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnNumberPreview, setReturnNumberPreview] = useState("(auto on save)");
  const [reason, setReason] = useState("");

  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string }[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const [items, setItems] = useState<ReturnLine[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── View/edit an existing return ───────────────────────────────────────
  // create_purchase_return() posts atomically -- there is no draft state, a
  // return is a Debit Note + stock movement the instant it's created. So
  // "editing" a posted return never rewrites it in place (that would mean
  // silently mutating an already-reversed stock movement and an
  // already-posted voucher); it opens read-only in this same window, with
  // Cancel (reverses stock + voucher via the existing, safe
  // cancelPurchaseReturn) and Duplicate (pre-fills a fresh, correctable
  // return) as the two ways to actually change anything -- the same
  // Draft-editable/Posted-cancel-to-redo convention every other document in
  // this app already uses.
  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState<"posted" | "cancelled">("posted");
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const readOnly = editMode;

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const { data } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number")
        .eq("business_id", businessId)
        .neq("status", "cancelled")
        .order("invoice_date", { ascending: false })
        .limit(200);
      setInvoices(data ?? []);

      if (editId) {
        setLoadingItems(true);
        try {
          const { data: ret, error: retErr } = await supabase
            .from("purchase_returns")
            .select("return_number, return_date, reason, status, purchase_invoice_id, taxable_amount, gst_amount, total_amount, parties(name), purchase_invoices(invoice_number)")
            .eq("id", editId)
            .eq("business_id", businessId)
            .single();
          if (retErr) throw retErr;
          const r = ret as any;
          setReturnNumberPreview(r.return_number);
          setReturnDate(r.return_date);
          setReason(r.reason ?? "");
          setStatus(r.status === "cancelled" ? "cancelled" : "posted");
          setInvoiceId(r.purchase_invoice_id ?? "");
          setSupplierName(r.parties?.name ?? "—");
          setEditMode(true);

          const { data: lines, error: lineErr } = await supabase
            .from("purchase_return_items")
            .select("purchase_invoice_item_id, part_number, description, qty, rate, gst_pct, purchase_invoice_item:purchase_invoice_items(discount_percent, additional_discount_percent, quantity)")
            .eq("return_id", editId);
          if (lineErr) throw lineErr;

          // "Returned" here means by OTHER returns -- this return's own qty
          // is shown separately as Return Qty, matching the live-entry
          // semantics (Remaining = Invoiced - Returned-by-others).
          const itemIds = (lines ?? []).map((l: any) => l.purchase_invoice_item_id).filter(Boolean);
          const totalReturnedByItem = itemIds.length ? await fetchPurchaseReturnedQty(businessId, itemIds) : {};

          setItems((lines ?? []).map((l: any) => ({
            itemId: l.purchase_invoice_item_id ?? "",
            productId: null,
            partNumber: l.part_number ?? "",
            description: l.description ?? "",
            rate: Number(l.rate) || 0,
            discountPercent: Number(l.purchase_invoice_item?.discount_percent) || 0,
            additionalDiscountPercent: Number(l.purchase_invoice_item?.additional_discount_percent) || 0,
            gstPercent: Number(l.gst_pct) || 0,
            invoicedQty: Number(l.purchase_invoice_item?.quantity) || 0,
            returnedQty: Math.max(0, (totalReturnedByItem[l.purchase_invoice_item_id] ?? 0) - Number(l.qty)),
            returnQty: Number(l.qty) || 0,
          })));
        } catch (e: any) {
          toast.error(e.message ?? "Failed to load return");
        } finally {
          setLoadingItems(false);
        }
      } else {
        setEditMode(false);
        setStatus("posted");
        const { data: preview } = await supabase.rpc("next_purchase_return_number", { _business_id: businessId } as any);
        if (preview) setReturnNumberPreview(`${preview} (provisional)`);

        if (duplicateState?.duplicateInvoiceId) {
          if (duplicateState.duplicateReason) setReason(duplicateState.duplicateReason);
          await handleInvoiceChange(duplicateState.duplicateInvoiceId);
          const qtyByItem = duplicateState.duplicateQtyByItem ?? {};
          setItems((rows) => rows.map((r) => (qtyByItem[r.itemId] ? { ...r, returnQty: Math.min(qtyByItem[r.itemId], remainingOf(r)) } : r)));
          toast.info("Prefilled from the cancelled return — review qty before posting.");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, editId]);

  const handleInvoiceChange = async (id: string) => {
    setInvoiceId(id);
    setItems([]);
    setSupplierName("");
    if (!id || !businessId) return;
    setLoadingItems(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from("purchase_invoices")
        .select("supplier_id, parties(name)")
        .eq("id", id)
        .single();
      if (invErr) throw invErr;
      setSupplierName((inv as any)?.parties?.name ?? "—");

      const { data: lines, error: lineErr } = await supabase
        .from("purchase_invoice_items")
        .select("id, product_id, part_number, description, quantity, purchase_price, discount_percent, additional_discount_percent, gst_percent")
        .eq("purchase_invoice_id", id);
      if (lineErr) throw lineErr;

      const lineIds = (lines ?? []).map((l: any) => l.id);
      const returnedByItem = lineIds.length ? await fetchPurchaseReturnedQty(businessId, lineIds) : {};

      const normalized: ReturnLine[] = (lines ?? []).map((l: any) => ({
        itemId: l.id,
        productId: l.product_id,
        partNumber: l.part_number ?? "",
        description: l.description ?? "",
        rate: Number(l.purchase_price) || 0,
        discountPercent: Number(l.discount_percent) || 0,
        additionalDiscountPercent: Number(l.additional_discount_percent) || 0,
        gstPercent: Number(l.gst_percent) || 0,
        invoicedQty: Number(l.quantity) || 0,
        returnedQty: returnedByItem[l.id] ?? 0,
        returnQty: 0,
      }));
      setItems(normalized);
      if (!normalized.length) toast.info("This invoice has no line items.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load invoice items");
    } finally {
      setLoadingItems(false);
    }
  };

  const remainingOf = (l: ReturnLine) => Math.max(0, l.invoicedQty - l.returnedQty);

  const updateReturnQty = (idx: number, qty: number) => {
    setItems((rows) => rows.map((r, i) => (i !== idx ? r : { ...r, returnQty: Math.max(0, Math.min(qty, remainingOf(r))) })));
  };

  const lineTotals = (l: ReturnLine) =>
    computePurchaseLine({
      qty: l.returnQty,
      rate: l.rate,
      primaryDiscountPct: l.discountPercent,
      additionalDiscountPct: l.additionalDiscountPercent,
      gstPct: l.gstPercent,
    });

  const totals = useMemo(() => {
    let taxable = 0, tax = 0, total = 0;
    for (const l of items) {
      if (l.returnQty <= 0) continue;
      const t = lineTotals(l);
      taxable += t.taxableAmount;
      tax += t.taxAmount;
      total += t.totalAmount;
    }
    return { taxable: +taxable.toFixed(2), tax: +tax.toFixed(2), total: +total.toFixed(2) };
  }, [items]);

  // create_purchase_return() computes and posts this exact same adjustment
  // server-side (Settings -> Accounting -> Round Off, gated on
  // round_off_debit_note) -- mirrored here purely for display, so the total
  // shown before posting matches what actually gets saved and posted.
  const roundOffSettings = useRoundOffSettings();
  const { roundOffAmount: roundOff, finalTotal: grandTotal } = useMemo(
    () => resolveRoundOff(totals.total, roundOffSettings, roundOffSettings.applyDebitNote),
    [totals.total, roundOffSettings]
  );

  const handleSave = async () => {
    if (!user || !businessId || saving) return;
    if (!invoiceId) { toast.error("Select the Purchase Invoice this return is against"); return; }
    const lineItems = items.filter((l) => l.returnQty > 0).map((l) => ({ purchase_invoice_item_id: l.itemId, qty: l.returnQty }));
    if (!lineItems.length) { toast.error("Enter a return quantity for at least one item"); return; }

    setSaving(true);
    try {
      const { data: returnId, error } = await supabase.rpc("create_purchase_return" as never, {
        _business_id: businessId,
        _purchase_invoice_id: invoiceId,
        _reason: reason || null,
        _items: lineItems,
      } as never);
      if (error) throw error;
      toast.success("Purchase return posted — Debit Note voucher created");
      navigate(`/purchase/returns`, { replace: true });
      void returnId;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create purchase return");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!editId) return;
    setCancelling(true);
    try {
      await cancelPurchaseReturn(editId, user?.id);
      toast.success(`Return ${returnNumberPreview} cancelled — stock and Debit Note reversed`);
      setStatus("cancelled");
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel return");
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  /** Pre-fills a brand-new (not-yet-posted) return with this one's invoice
   *  and quantities, for a quick correction -- the safe alternative to
   *  editing a posted return in place. */
  const handleDuplicate = () => {
    navigate("/purchase/returns/new", {
      state: {
        duplicateInvoiceId: invoiceId,
        duplicateReason: reason,
        duplicateQtyByItem: Object.fromEntries(items.map((l) => [l.itemId, l.returnQty])),
      },
    });
  };

  useDocumentShortcuts(
    { onSubmit: editMode ? undefined : handleSave, onEscape: () => navigate("/purchase/returns") },
    [items, invoiceId, reason, returnDate, editMode],
  );

  const toolbarActions: DocumentToolbarAction[] = editMode
    ? [
        { key: "cancel", label: cancelling ? "Cancelling…" : "Cancel Return", icon: Ban, onClick: () => setCancelConfirmOpen(true), disabled: cancelling, hidden: status === "cancelled", className: "border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700" },
        { key: "duplicate", label: "Duplicate as New Return", icon: Copy, onClick: handleDuplicate },
        { key: "close", label: "Close", icon: X, onClick: () => navigate("/purchase/returns"), variant: "ghost", className: "text-muted-foreground" },
      ]
    : [
        { key: "save", label: saving ? "Posting…" : "Save & Post", icon: Save, shortcut: "Ctrl+Enter", onClick: handleSave, disabled: saving || loadingItems, variant: "primary" },
        { key: "close", label: "Close", icon: X, onClick: () => navigate("/purchase/returns"), variant: "ghost", className: "text-muted-foreground" },
      ];

  return (
    <DocumentRoot type="purchase_return" printMode="multiCopy" className="pr-entry space-y-0">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? "Purchase Return" : "New Purchase Return"}
            </span>
            {editMode && (
              <Badge
                variant="outline"
                className={status === "cancelled" ? "border-destructive/40 text-destructive bg-destructive/10 ml-2" : "border-emerald-500/40 text-emerald-600 bg-emerald-500/10 ml-2"}
              >
                {status.toUpperCase()}
              </Badge>
            )}
          </>
        }
        actions={toolbarActions}
      />

      <DocumentSheet>
        <DocumentSheetBanner left="Purchase Return" center="RD Pro" />

        <DocumentHeaderGrid mobileResponsive>
          <DocumentHeaderInputField label="Return Number" value={returnNumberPreview} disabled />
          <DocumentHeaderInputField label="Return Date" labelAlign="right" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} disabled={readOnly} />

          <DocumentHeaderLabel>Against Purchase Invoice</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={invoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              disabled={readOnly}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60"
            >
              <option value="">Select invoice…</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}
            </select>
          </DocumentHeaderValue>
          <DocumentHeaderLabel align="right">Supplier</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <div className="h-6 text-[12px] font-mono px-1 flex items-center text-muted-foreground">{supplierName || "—"}</div>
          </DocumentHeaderValue>

          <DocumentHeaderLabel span={2}>Reason</DocumentHeaderLabel>
          <DocumentHeaderValue span={10}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={readOnly}
              rows={1}
              placeholder="e.g. Damaged goods, wrong item sent"
              className="text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none min-h-0 h-6 py-0"
            />
          </DocumentHeaderValue>
        </DocumentHeaderGrid>

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          showSpacerRows={false}
          hasRowActions={false}
          emptyMessage={loadingItems ? "Loading…" : "Select a Purchase Invoice above to load its lines."}
          renderRow={(item, idx) => {
            const rem = remainingOf(item);
            const t = lineTotals(item);
            return (
              <>
                <td className="px-1.5 py-1 align-middle text-muted-foreground text-[10px]">{idx + 1}</td>
                <td className="px-1.5 py-1 align-middle font-mono text-[11px] whitespace-nowrap" title={item.partNumber}>{item.partNumber}</td>
                <td className="px-1.5 py-1 align-middle max-w-[220px] truncate" title={item.description}>{item.description}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{fmt(item.rate)}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{item.discountPercent || "—"}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{item.additionalDiscountPercent || "—"}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{item.gstPercent}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{fmt(item.invoicedQty)}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmt(item.returnedQty)}</td>
                <td className={`px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap ${rem <= 0 ? "text-muted-foreground" : "font-medium"}`}>{fmt(rem)}</td>
                <td className="px-0.5 py-0.5 align-middle">
                  <input
                    type="number" min={0} max={rem} disabled={readOnly || rem <= 0}
                    value={item.returnQty || ""}
                    onChange={(e) => updateReturnQty(idx, +e.target.value)}
                    className="h-6 w-full text-[12px] font-mono px-1 text-right rounded border border-input bg-background focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:bg-transparent disabled:border-0"
                  />
                </td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{fmt(t.taxableAmount)}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap">{fmt(t.taxAmount)}</td>
                <td className="px-1.5 py-1 align-middle text-right tabular-nums whitespace-nowrap font-semibold">{fmt(t.totalAmount)}</td>
              </>
            );
          }}
        />

        <div className="flex justify-end p-3">
          <DocumentTotals
            title="Return Totals"
            lines={[
              { label: "Taxable Amount", value: `₹${fmt(totals.taxable)}` },
              { label: "Tax (GST)", value: `₹${fmt(totals.tax)}` },
              ...(roundOff !== 0 ? [{ label: "Round Off", value: `${roundOff >= 0 ? "+ " : "− "}₹${fmt(Math.abs(roundOff))}` }] : []),
            ]}
            grandTotal={`₹${fmt(grandTotal)}`}
          />
        </div>
      </DocumentSheet>

      <style>{`
        .pr-entry input[type=number]::-webkit-outer-spin-button,
        .pr-entry input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pr-entry input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(o) => !o && setCancelConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Return {returnNumberPreview}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the stock this return took out and cancel its linked Debit Note voucher. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Return</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-orange-600 hover:bg-orange-700 text-white">
              {cancelling ? "Cancelling…" : "Cancel Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DocumentRoot>
  );
}
