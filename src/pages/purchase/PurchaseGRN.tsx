import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Save, CheckCircle2, Ban, Copy, X, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchUnits, fetchProductUnits, stockUnitOf, toStockQty, type Unit as MeasureUnit, type ProductUnit } from "@/lib/units";
import WarehouseFormDialog, { type WarehouseRow } from "@/components/inventory/WarehouseFormDialog";
import GRNBatchSerialDialog, { type GRNBatchSerialResult } from "@/components/inventory/GRNBatchSerialDialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchGoodsReceipt, fetchGoodsReceiptItems, fetchPendingPOItemsForGRN, saveGRN, deleteGRN,
  duplicateGRN, cancelGRN, logGRNActivity, fetchGRNActivityLogs,
  type GRNLine, type GRNStatus, type GRNActivityLog,
} from "@/lib/goodsReceipts";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentGridTable, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentAuditLog } from "@/components/documentEngine/DocumentAuditLog";
import { useOutputCenterShortcut } from "@/hooks/useOutputCenterShortcut";
import { DocumentOutputCenter, type DocumentOutputCenterHandle } from "@/components/documentEngine/DocumentOutputCenter";
import { buildGRNUdm } from "@/lib/documentUdm/grnUdm";

const QC_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "short_supply", label: "Short Supply" },
  { value: "damaged", label: "Damaged Material" },
  { value: "manufacturing_defect", label: "Manufacturing Defect" },
  { value: "expired", label: "Expired Goods" },
  { value: "wrong_item", label: "Wrong Item Supplied" },
  { value: "rate_difference", label: "Rate Difference" },
  { value: "other", label: "Other" },
];

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "product", header: "Product", widthClass: "min-w-[160px]" },
  { key: "part", header: "Part No.", widthClass: "min-w-[100px]" },
  { key: "unit", header: "Unit", widthClass: "w-16" },
  { key: "ordered", header: "Ordered", align: "right", widthClass: "w-16" },
  { key: "received", header: "Received", align: "right", widthClass: "w-20" },
  { key: "damaged", header: "Damaged", align: "right", widthClass: "w-20" },
  { key: "accepted", header: "Accepted", align: "right", widthClass: "w-16" },
  { key: "pending", header: "Pending", align: "right", widthClass: "w-16" },
  { key: "short", header: "Short", align: "right", widthClass: "w-14" },
  { key: "excess", header: "Excess", align: "right", widthClass: "w-14" },
  { key: "remarks", header: "Quality Remarks", widthClass: "min-w-[140px]" },
  { key: "reason", header: "Reason", widthClass: "w-40" },
  { key: "tracking", header: "Batch/Serial", widthClass: "w-32" },
];

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function PurchaseGRN() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);

  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [selectedPO, setSelectedPO] = useState("");

  const [items, setItems] = useState<GRNLine[]>([]);
  const [trackingDialogIdx, setTrackingDialogIdx] = useState<number | null>(null);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [allUnits, setAllUnits] = useState<MeasureUnit[]>([]);
  useEffect(() => { fetchUnits().then(setAllUnits).catch(() => {}); }, []);
  const unitLabel = (unitId: string) => allUnits.find((u) => u.id === unitId)?.symbol ?? "";

  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState<GRNStatus>("draft");
  const [duplicating, setDuplicating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activityLogs, setActivityLogs] = useState<GRNActivityLog[]>([]);
  const grnIdRef = useRef<string | null>(editId || null);
  const outputCenterRef = useRef<DocumentOutputCenterHandle>(null);
  const readOnly = editMode && status !== "draft";

  // ─── Load master data + (in edit mode) the existing GRN ─────────────────────
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const [{ data: partyData }, { data: warehouseData }, { data: poData }] = await Promise.all([
        supabase.from("parties").select("id, name").eq("business_id", businessId).eq("preferred_supplier", true).order("name"),
        supabase.from("warehouses").select("id, warehouse_name, address, is_default, status")
          .eq("business_id", businessId).order("is_default", { ascending: false }).order("warehouse_name", { ascending: true }),
        supabase.from("purchase_orders").select("id, po_number, supplier_id, warehouse_id")
          .eq("business_id", businessId).in("status", ["approved", "ordered", "partially_received"]).order("created_at", { ascending: false }),
      ]);
      if (partyData) setSuppliers(partyData);
      let wh: WarehouseRow[] = [];
      if (warehouseData) {
        wh = warehouseData as unknown as WarehouseRow[];
        setWarehouses(wh);
      }
      if (poData) setPurchaseOrders(poData);

      if (!editId) {
        const defaultWh = wh.find((w) => w.is_default);
        if (defaultWh) setSelectedWarehouse(defaultWh.id);
        else if (wh.length === 1) setSelectedWarehouse(wh[0].id);
        const { data: grnNo } = await supabase.rpc("next_grn_number", { _business_id: businessId } as any);
        setGrnNumber((grnNo as string) || `GRN-${Date.now().toString().slice(-6)}`);
      } else {
        try {
          const grn = await fetchGoodsReceipt(editId);
          const its = await fetchGoodsReceiptItems(editId);
          setGrnNumber(grn.grn_number);
          setGrnDate(grn.grn_date);
          setRemarks(grn.remarks ?? "");
          setSelectedSupplier(grn.supplier_id ?? "");
          setSelectedWarehouse(grn.warehouse_id ?? "");
          setSelectedPO(grn.purchase_order_id ?? "");
          setStatus(grn.status);
          setEditMode(true);
          grnIdRef.current = grn.id;
          setItems(
            its.map((it): GRNLine => ({
              id: it.id,
              purchase_order_item_id: it.purchase_order_item_id,
              product_id: it.product_id,
              product_name: it.product_name ?? "Unknown Product",
              part_number: it.part_number ?? "N/A",
              tracking_type: it.tracking_type ?? "none",
              ordered_qty: Number(it.ordered_qty),
              received_qty: Number(it.received_qty),
              damaged_qty: Number(it.damaged_qty),
              accepted_qty: Number(it.accepted_qty),
              pending_qty: Number(it.pending_qty),
              short_qty: Number(it.short_qty),
              excess_qty: Number(it.excess_qty),
              quality_remarks: it.quality_remarks ?? "",
              qc_reason_category: it.qc_reason_category,
              unit_id: it.unit_id,
              stock_accepted_qty: it.stock_accepted_qty,
            })),
          );
          fetchGRNActivityLogs(grn.id).then(setActivityLogs).catch(() => {});
        } catch (e: any) {
          toast.error(e.message);
        }
      }
    })();
  }, [businessId, editId]);

  const reloadWarehouses = async (selectId?: string) => {
    if (!businessId) return;
    const { data, error } = await supabase
      .from("warehouses").select("id, warehouse_name, address, is_default, status")
      .eq("business_id", businessId).order("is_default", { ascending: false }).order("warehouse_name", { ascending: true });
    if (!error && data) {
      setWarehouses(data as unknown as WarehouseRow[]);
      if (selectId) setSelectedWarehouse(selectId);
    }
  };

  // ─── PO selection → auto-fill + pending items (partial-receive aware) ──────
  const handlePOChange = async (poId: string) => {
    setSelectedPO(poId);
    setLoading(true);
    try {
      const { data: poDetails } = await supabase.from("purchase_orders").select("supplier_id, warehouse_id").eq("id", poId).single();
      if (poDetails) {
        if (poDetails.supplier_id) setSelectedSupplier(poDetails.supplier_id);
        if (poDetails.warehouse_id) setSelectedWarehouse(poDetails.warehouse_id);
      }
      const pending = await fetchPendingPOItemsForGRN(poId);
      setItems(pending);
      const productIds = [...new Set(pending.map((p) => p.product_id))];
      const puByProduct: Record<string, ProductUnit[]> = {};
      await Promise.all(productIds.map(async (pid) => {
        try { puByProduct[pid] = await fetchProductUnits(pid); } catch { puByProduct[pid] = []; }
      }));
      setUnitsByProduct(puByProduct);
      if (pending.length === 0) {
        toast.info("Nothing pending — all items on this PO have already been received.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (index: number, field: "received_qty" | "damaged_qty", value: number) => {
    setItems((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const item = { ...row };
      if (field === "received_qty") item.received_qty = Math.max(0, value);
      if (field === "damaged_qty") item.damaged_qty = Math.max(0, value);
      item.accepted_qty = Math.max(0, item.received_qty - item.damaged_qty);
      item.pending_qty = Math.max(0, item.ordered_qty - item.received_qty);
      item.short_qty = Math.max(0, item.ordered_qty - item.received_qty);
      item.excess_qty = Math.max(0, item.received_qty - item.ordered_qty);
      const pu = unitsByProduct[item.product_id];
      item.stock_accepted_qty = pu?.length ? toStockQty(item.accepted_qty, item.unit_id, pu) : null;
      item.tracking = undefined; // qty changed — any prior batch/serial entry no longer matches
      return item;
    }));
  };

  const handleTrackingConfirm = (index: number, result: GRNBatchSerialResult) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, tracking: result } : r)));
  const handleRemarksChange = (index: number, value: string) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, quality_remarks: value } : r)));
  const handleReasonChange = (index: number, value: string) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, qc_reason_category: value } : r)));

  const handleSave = async (targetStatus: "draft" | "received") => {
    if (!user || !businessId || loading || readOnly) return;
    if (!selectedSupplier || !selectedWarehouse) { toast.error("Supplier and Warehouse are required."); return; }
    if (targetStatus === "received" && items.length === 0) { toast.error("Select a Purchase Order with pending items first."); return; }
    const missingTracking = items.find((it) => it.accepted_qty > 0 && it.tracking_type !== "none" && !it.tracking);
    if (missingTracking) {
      toast.error(`Enter ${missingTracking.tracking_type} details for ${missingTracking.product_name} before saving.`);
      return;
    }
    const isNewGRN = !grnIdRef.current;
    try {
      setLoading(true);
      const saved = await saveGRN({
        userId: user.id,
        id: grnIdRef.current || undefined,
        grn_number: grnNumber,
        purchase_order_id: selectedPO || null,
        supplier_id: selectedSupplier,
        warehouse_id: selectedWarehouse,
        grn_date: grnDate,
        remarks: remarks || null,
        status: targetStatus,
        items,
      });
      grnIdRef.current = saved.id;
      setStatus(saved.status);
      setEditMode(true);
      await logGRNActivity({
        userId: user.id,
        goodsReceiptId: saved.id,
        action: isNewGRN ? "created" : targetStatus === "received" ? "posted" : "draft_saved",
        description: isNewGRN ? `Created as ${saved.grn_number}` : undefined,
      });
      fetchGRNActivityLogs(saved.id).then(setActivityLogs).catch(() => {});
      toast.success(targetStatus === "received" ? `GRN ${saved.grn_number} posted — stock received` : "Draft saved", { duration: 1500 });
      if (isNewGRN) navigate(`/purchase/grn/edit/${saved.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!grnIdRef.current || !user) return;
    setCancelling(true);
    try {
      await cancelGRN(grnIdRef.current);
      await logGRNActivity({ userId: user.id, goodsReceiptId: grnIdRef.current, action: "cancelled", oldData: { status }, newData: { status: "cancelled" } });
      setStatus("cancelled");
      fetchGRNActivityLogs(grnIdRef.current).then(setActivityLogs).catch(() => {});
      toast.success(`GRN ${grnNumber} cancelled — stock reversed`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel GRN");
    } finally {
      setCancelling(false);
    }
  };

  const handleDuplicate = async () => {
    if (!grnIdRef.current || !user || duplicating) return;
    setDuplicating(true);
    try {
      const clone = await duplicateGRN(grnIdRef.current, user.id);
      toast.success(`Duplicated as ${clone.grn_number}`);
      navigate(`/purchase/grn/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate GRN");
    } finally {
      setDuplicating(false);
    }
  };

  useOutputCenterShortcut(
    {
      onSaveDraft: () => handleSave("draft"),
      onSubmit: () => handleSave("received"),
      onEscape: () => navigate("/purchase/grn"),
      onPreview: () => outputCenterRef.current?.preview(),
      onDirectPrint: () => outputCenterRef.current?.directPrint(),
      onOpenMenu: () => outputCenterRef.current?.openMenu(),
    },
    [items, selectedSupplier, selectedWarehouse, selectedPO, grnNumber, grnDate, remarks, readOnly],
  );

  const totals = useMemo(() => items.reduce((acc, it) => ({
    ordered: acc.ordered + it.ordered_qty,
    received: acc.received + it.received_qty,
    damaged: acc.damaged + it.damaged_qty,
    accepted: acc.accepted + it.accepted_qty,
  }), { ordered: 0, received: 0, damaged: 0, accepted: 0 }), [items]);

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: () => handleSave("draft"), disabled: loading || readOnly },
    { key: "post", label: "Post (Receive Stock)", icon: CheckCircle2, shortcut: "Ctrl+Enter", onClick: () => handleSave("received"), disabled: loading || readOnly, variant: "primary" },
    { key: "cancel", label: cancelling ? "Cancelling…" : "Cancel GRN", icon: Ban, onClick: handleCancel, disabled: cancelling, hidden: !editMode || status === "cancelled", className: "border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700" },
    { key: "duplicate", label: duplicating ? "Duplicating…" : "Duplicate", icon: Copy, onClick: handleDuplicate, disabled: duplicating, hidden: !editMode },
    { key: "close", label: "Close", icon: X, onClick: () => navigate("/purchase/grn"), variant: "ghost", className: "text-muted-foreground" },
  ];

  return (
    <DocumentRoot type="grn" printMode="multiCopy" className="grn-entry space-y-0">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? "Edit Goods Receipt Note" : "New Goods Receipt Note"}
            </span>
            {grnNumber && <Badge variant="outline" className="text-[10px]">#{grnNumber}</Badge>}
            {editMode && <DocumentStatusBadge status={status} label={status === "received" ? "Posted" : undefined} />}
          </>
        }
        actions={toolbarActions}
      />
      {editMode && (
        <div className="print:hidden flex justify-end -mt-2 mb-2">
          <DocumentOutputCenter
            ref={outputCenterRef}
            documentTypeId="grn"
            documentId={grnIdRef.current ?? undefined}
            documentNumber={grnNumber}
            disabled={!businessId}
            getUdm={() => buildGRNUdm({
              businessId: businessId!,
              grnNumber,
              grnDate,
              remarks,
              status,
              supplierId: selectedSupplier || null,
              items,
              unitLabel: (id) => unitLabel(id ?? ""),
            })}
          />
        </div>
      )}

      <DocumentSheet>
        <DocumentSheetBanner left="Goods Receipt Note" center="RD Pro" />

        <DocumentHeaderGrid mobileResponsive>
          <DocumentHeaderInputField label="GRN Number" value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} disabled={readOnly} />
          <DocumentHeaderInputField label="GRN Date" labelAlign="right" type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} disabled={readOnly} />

          <DocumentHeaderLabel>Link Purchase Order</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={selectedPO}
              onChange={(e) => handlePOChange(e.target.value)}
              disabled={readOnly}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60"
            >
              <option value="">Select approved PO…</option>
              {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
            </select>
          </DocumentHeaderValue>
          <DocumentHeaderLabel align="right">Supplier</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              disabled={readOnly}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </DocumentHeaderValue>

          <DocumentHeaderLabel>Warehouse</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <select
              value={selectedWarehouse}
              onChange={(e) => {
                if (e.target.value === "__add_new__") { setWarehouseDialogOpen(true); return; }
                setSelectedWarehouse(e.target.value);
              }}
              disabled={readOnly}
              className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60"
            >
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}{w.is_default ? " (Default)" : ""}</option>)}
              {!readOnly && <option value="__add_new__">+ Add Warehouse…</option>}
            </select>
          </DocumentHeaderValue>
          <DocumentHeaderValue />

          <DocumentHeaderLabel span={2}>Remarks</DocumentHeaderLabel>
          <DocumentHeaderValue span={10}>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={readOnly}
              rows={1}
              placeholder="Add description…"
              className="text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none min-h-0 h-6 py-0"
            />
          </DocumentHeaderValue>
        </DocumentHeaderGrid>

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          showSpacerRows={false}
          hasRowActions={false}
          emptyMessage="Select an approved Purchase Order above to load pending items."
          renderRow={(item, idx) => (
            <>
              <td className="px-1.5 py-1 font-medium">{item.product_name}</td>
              <td className="px-1.5 py-1 text-muted-foreground font-mono text-[11px]">{item.part_number}</td>
              <td className="px-1.5 py-1 text-center text-[10px] text-muted-foreground">
                {item.unit_id ? unitLabel(item.unit_id) : "—"}
                {item.stock_accepted_qty != null && (
                  <div className="text-[9px] leading-none mt-0.5">
                    → {fmt(item.stock_accepted_qty)} {(() => {
                      const su = stockUnitOf(unitsByProduct[item.product_id] ?? []);
                      return su ? unitLabel(su.unit_id) : "";
                    })()}
                  </div>
                )}
              </td>
              <td className="px-1.5 py-1 text-right font-semibold tabular-nums">{fmt(item.ordered_qty)}</td>
              <td className="px-0.5 py-0.5">
                <input
                  type="number" disabled={readOnly} value={item.received_qty}
                  onChange={(e) => handleQtyChange(idx, "received_qty", Number(e.target.value))}
                  className="h-6 w-full text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary disabled:opacity-60"
                />
              </td>
              <td className="px-0.5 py-0.5">
                <input
                  type="number" disabled={readOnly} value={item.damaged_qty}
                  onChange={(e) => handleQtyChange(idx, "damaged_qty", Number(e.target.value))}
                  className="h-6 w-full text-[12px] font-mono px-1 text-right text-destructive rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary disabled:opacity-60"
                />
              </td>
              <td className="px-1.5 py-1 text-right font-bold text-emerald-600 tabular-nums">{fmt(item.accepted_qty)}</td>
              <td className="px-1.5 py-1 text-right font-bold text-orange-500 tabular-nums">{fmt(item.pending_qty)}</td>
              <td className="px-1.5 py-1 text-right font-semibold text-destructive tabular-nums">{item.short_qty || "—"}</td>
              <td className="px-1.5 py-1 text-right font-semibold text-blue-500 tabular-nums">{item.excess_qty || "—"}</td>
              <td className="px-0.5 py-0.5">
                <input
                  disabled={readOnly} value={item.quality_remarks} placeholder="e.g. damaged in transit"
                  onChange={(e) => handleRemarksChange(idx, e.target.value)}
                  className="h-6 w-full text-[11px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary disabled:opacity-60"
                />
              </td>
              <td className="px-0.5 py-0.5">
                {item.damaged_qty > 0 || item.short_qty > 0 ? (
                  <select
                    value={item.qc_reason_category ?? ""} disabled={readOnly}
                    onChange={(e) => handleReasonChange(idx, e.target.value)}
                    className="h-6 w-full text-[11px] font-mono px-0.5 rounded-none border-0 bg-transparent focus-visible:ring-0 disabled:opacity-60"
                  >
                    <option value="">Select reason</option>
                    {QC_REASON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span className="text-[10px] text-muted-foreground px-1">—</span>
                )}
              </td>
              <td className="px-1.5 py-1">
                {item.tracking_type === "none" || item.accepted_qty <= 0 ? (
                  <span className="text-[10px] text-muted-foreground">—</span>
                ) : (
                  <Button type="button" size="sm" variant={item.tracking ? "secondary" : "outline"} className="h-6 text-[10px] gap-1" disabled={readOnly} onClick={() => setTrackingDialogIdx(idx)}>
                    <Boxes className="h-3 w-3" />
                    {item.tracking
                      ? (item.tracking_type === "batch" ? item.tracking.batch?.batch_number : `${item.tracking.serial_numbers?.length ?? 0} serials`)
                      : `Add ${item.tracking_type}`}
                  </Button>
                )}
              </td>
            </>
          )}
        />

        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-3 px-3 py-2 border-t border-border text-[12px] font-sans">
            <div><span className="text-muted-foreground">Total Ordered: </span><strong>{fmt(totals.ordered)}</strong></div>
            <div><span className="text-muted-foreground">Total Received: </span><strong>{fmt(totals.received)}</strong></div>
            <div><span className="text-destructive">Total Damaged: </span><strong>{fmt(totals.damaged)}</strong></div>
            <div><span className="text-emerald-600">Total Accepted: </span><strong>{fmt(totals.accepted)}</strong></div>
          </div>
        )}

        {editMode && activityLogs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-3 py-3 border-t border-border">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-sans">Activity Timeline</p>
              <DocumentTimeline entries={activityLogs} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-sans">Audit Log</p>
              <DocumentAuditLog entries={activityLogs} />
            </div>
          </div>
        )}
      </DocumentSheet>

      <style>{`
        .grn-entry input[type=number]::-webkit-outer-spin-button,
        .grn-entry input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .grn-entry input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <WarehouseFormDialog
        open={warehouseDialogOpen}
        onOpenChange={setWarehouseDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={(w) => reloadWarehouses(w.id)}
      />

      {trackingDialogIdx !== null && items[trackingDialogIdx] && (
        <GRNBatchSerialDialog
          open={trackingDialogIdx !== null}
          onOpenChange={(o) => { if (!o) setTrackingDialogIdx(null); }}
          productLabel={items[trackingDialogIdx].product_name}
          trackingType={items[trackingDialogIdx].tracking_type as "batch" | "serial"}
          neededQty={items[trackingDialogIdx].accepted_qty}
          initial={items[trackingDialogIdx].tracking}
          onConfirm={(result) => handleTrackingConfirm(trackingDialogIdx, result)}
        />
      )}
    </DocumentRoot>
  );
}
