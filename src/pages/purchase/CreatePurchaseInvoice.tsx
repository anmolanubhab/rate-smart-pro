import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Save, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchParties, type Party } from "@/lib/parties";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  type PurchaseInvoiceItem, blankInvoiceItem, computeInvoiceItem, computeInvoiceTotals,
  nextInvoiceNumber, savePurchaseInvoice, fetchGrnItemsForInvoice, fetchPendingPOItemsForInvoice,
  fetchOpenPOsForInvoice, fetchPurchaseInvoice, fetchInvoiceItems, logInvoiceActivity,
} from "@/lib/purchaseInvoices";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { useDocumentShortcuts } from "@/hooks/useDocumentShortcuts";

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[110px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[160px]" },
  { key: "qty", header: "Qty", align: "right", widthClass: "w-20" },
  { key: "rate", header: "Rate (₹)", align: "right", widthClass: "w-24" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-16" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-16" },
  { key: "taxable", header: "Taxable", align: "right", widthClass: "w-24" },
  { key: "tax", header: "Tax", align: "right", widthClass: "w-20" },
  { key: "total", header: "Total (₹)", align: "right", widthClass: "w-24" },
];

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreatePurchaseInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const duplicateFromId = (location.state as { duplicateFromId?: string } | null)?.duplicateFromId;

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<{ id: string; po_number: string; supplier_id: string | null }[]>([]);
  const [grns, setGrns] = useState<{ id: string; grn_number: string; supplier_id: string | null; purchase_order_id: string | null }[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [grnId, setGrnId] = useState("");
  // Once a GRN is picked its PO is derived automatically -- shown read-only
  // for traceability, since GRN's own pending-qty chain already bounds the
  // items and re-picking a different PO here would silently disconnect them.
  const poLockedByGrn = !!grnId;

  const [items, setItems] = useState<PurchaseInvoiceItem[]>([blankInvoiceItem()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!businessId || !user) return;
    (async () => {
      const [partyData, poData, { data: grnData }] = await Promise.all([
        fetchParties(user.id, "supplier"),
        fetchOpenPOsForInvoice(businessId),
        supabase.from("goods_receipts").select("id, grn_number, supplier_id, purchase_order_id")
          .eq("business_id", businessId).eq("status", "received").order("grn_date", { ascending: false }).limit(100),
      ]);
      setSuppliers(partyData ?? []);
      setPurchaseOrders(poData);
      setGrns(grnData ?? []);

      if (duplicateFromId) {
        setLoading(true);
        try {
          const [inv, its] = await Promise.all([fetchPurchaseInvoice(duplicateFromId), fetchInvoiceItems(duplicateFromId)]);
          setSupplierId(inv.supplier_id ?? "");
          setPurchaseOrderId(inv.purchase_order_id ?? "");
          setGrnId(inv.goods_receipt_id ?? "");
          setRemarks(inv.remarks ?? "");
          setItems(its.length ? its.map((it) => computeInvoiceItem(it)) : [blankInvoiceItem()]);
          toast.info(`Prefilled from ${inv.invoice_number} — review before saving.`);
        } catch (e: any) {
          toast.error(e.message ?? "Could not load invoice to duplicate");
        } finally {
          setLoading(false);
        }
      }

      const num = await nextInvoiceNumber(businessId);
      setInvoiceNumber(num);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, user]);

  const handleGrnChange = async (id: string) => {
    setGrnId(id);
    if (!id) return;
    const grn = grns.find((g) => g.id === id);
    if (grn?.supplier_id) setSupplierId(grn.supplier_id);
    if (grn?.purchase_order_id) setPurchaseOrderId(grn.purchase_order_id);
    try {
      const prefilled = await fetchGrnItemsForInvoice(id);
      setItems(prefilled.length ? prefilled : [blankInvoiceItem()]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load GRN items");
    }
  };

  const handlePOChange = async (id: string) => {
    setPurchaseOrderId(id);
    if (!id || grnId) return;
    const po = purchaseOrders.find((p) => p.id === id);
    if (po?.supplier_id) setSupplierId(po.supplier_id);
    try {
      const pending = await fetchPendingPOItemsForInvoice(id);
      const withQty = pending.filter((p) => p.pending_qty > 0);
      setItems(withQty.length ? withQty : [blankInvoiceItem()]);
      if (!withQty.length) toast.info("Nothing pending — this PO has already been fully invoiced.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load PO items");
    }
  };

  const updateRow = (idx: number, patch: Partial<PurchaseInvoiceItem>) => {
    setItems((rows) => rows.map((r, i) => (i !== idx ? r : computeInvoiceItem({ ...r, ...patch }))));
  };
  const addRow = () => setItems((r) => [...r, blankInvoiceItem()]);
  const delRow = (idx: number) => setItems((r) => (r.length <= 1 ? [blankInvoiceItem()] : r.filter((_, i) => i !== idx)));

  const totals = useMemo(() => computeInvoiceTotals(items), [items]);

  const handleSave = async () => {
    if (!user || !businessId || saving) return;
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const validItems = items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
    if (!validItems.length) { toast.error("Add at least one line item"); return; }

    try {
      setSaving(true);
      const saved = await savePurchaseInvoice({
        invoice_number: invoiceNumber,
        supplier_id: supplierId,
        purchase_order_id: purchaseOrderId || null,
        goods_receipt_id: grnId || null,
        supplier_invoice_number: supplierInvoiceNumber || null,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        remarks: remarks || null,
        items: validItems,
        createdBy: user.id,
      });
      await logInvoiceActivity({
        userId: user.id,
        purchaseInvoiceId: saved.id,
        action: "created",
        description: `Created as ${saved.invoice_number}`,
      });
      if (saved.ledgerPostError) {
        toast.warning(
          `Invoice ${saved.invoice_number} saved, but posting to the ledger failed (${saved.ledgerPostError}). It won't show up in Trial Balance/Payables until this is retried — open the invoice and re-save, or contact support.`,
          { duration: 15000 }
        );
      } else {
        toast.success(`Invoice ${saved.invoice_number} recorded`);
      }
      navigate(`/purchase/invoices/${saved.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  useDocumentShortcuts(
    {
      onSaveDraft: handleSave,
      onSubmit: handleSave,
      onAddRow: addRow,
      onEscape: () => navigate("/purchase/invoices"),
    },
    [items, supplierId, purchaseOrderId, grnId, invoiceNumber, invoiceDate, dueDate, supplierInvoiceNumber, remarks],
  );

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: "Save & Post", icon: Save, shortcut: "Ctrl+Enter", onClick: handleSave, disabled: saving || loading, variant: "primary" },
    { key: "close", label: "Close", icon: X, onClick: () => navigate("/purchase/invoices"), variant: "ghost", className: "text-muted-foreground" },
  ];

  return (
    <DocumentRoot type="purchase_invoice" printMode="multiCopy" className="pi-entry space-y-0">
      <DocumentToolbar
        statusSlot={<span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">New Purchase Invoice</span>}
        actions={toolbarActions}
      />

      <DocumentSheet>
        <DocumentSheetBanner left="Purchase Invoice" center="RD Pro" />

        <DocumentHeaderGrid mobileResponsive>
          <DocumentHeaderInputField label="Invoice Number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          <DocumentHeaderInputField label="Invoice Date" labelAlign="right" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />

          <DocumentHeaderLabel>Supplier</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </DocumentHeaderValue>
          <DocumentHeaderLabel align="right">Supplier's Invoice No.</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <input
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              placeholder="Their reference #"
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </DocumentHeaderValue>

          <DocumentHeaderLabel>Link Purchase Order</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={purchaseOrderId}
              onChange={(e) => handlePOChange(e.target.value)}
              disabled={poLockedByGrn}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60"
            >
              <option value="">No PO — direct entry</option>
              {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
            </select>
          </DocumentHeaderValue>
          <DocumentHeaderLabel align="right">Link GRN</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={grnId}
              onChange={(e) => handleGrnChange(e.target.value)}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            >
              <option value="">No GRN — manual entry</option>
              {grns.map((g) => <option key={g.id} value={g.id}>{g.grn_number}</option>)}
            </select>
          </DocumentHeaderValue>

          <DocumentHeaderInputField label="Due Date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <DocumentHeaderValue />

          <DocumentHeaderLabel span={2}>Remarks</DocumentHeaderLabel>
          <DocumentHeaderValue span={10}>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={1}
              placeholder="Optional notes"
              className="text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none min-h-0 h-6 py-0"
            />
          </DocumentHeaderValue>
        </DocumentHeaderGrid>

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          showSpacerRows={false}
          renderFooter={
            <td colSpan={GRID_COLUMNS.length + 2} className="px-2 py-1.5">
              <button onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add Row
              </button>
            </td>
          }
          renderRow={(item, idx) => (
            <>
              <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput value={item.part_number} onChange={(e) => updateRow(idx, { part_number: e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput value={item.description} onChange={(e) => updateRow(idx, { description: e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" type="number" value={item.qty || ""} onChange={(e) => updateRow(idx, { qty: +e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" type="number" value={item.rate || ""} onChange={(e) => updateRow(idx, { rate: +e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" type="number" value={item.discount_percent || ""} onChange={(e) => updateRow(idx, { discount_percent: +e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" type="number" value={item.gst_percent || ""} onChange={(e) => updateRow(idx, { gst_percent: +e.target.value })} />
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(item.taxable_amount)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(item.tax_amount)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums font-semibold">{fmt(item.total_amount)}</td>
              <td className="px-1 py-0.5">
                <button onClick={() => delRow(idx)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </>
          )}
        />

        <div className="flex justify-end p-3">
          <DocumentTotals
            title="Invoice Totals"
            lines={[
              { label: "Taxable Amount", value: `₹${fmt(totals.taxable)}` },
              { label: "Discount", value: `− ₹${fmt(totals.discount_total)}` },
              { label: "Tax (GST)", value: `₹${fmt(totals.tax_total)}` },
            ]}
            grandTotal={`₹${fmt(totals.grand_total)}`}
          />
        </div>
      </DocumentSheet>

      <style>{`
        .pi-entry input[type=number]::-webkit-outer-spin-button,
        .pi-entry input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pi-entry input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </DocumentRoot>
  );
}
