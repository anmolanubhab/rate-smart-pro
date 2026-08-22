import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Save, CheckCircle2, Ban, Copy, X, Boxes, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchUnits, fetchProductUnits, purchaseUnitOf, stockUnitOf, toStockQty, type Unit as MeasureUnit, type ProductUnit } from "@/lib/units";
import WarehouseFormDialog, { type WarehouseRow } from "@/components/inventory/WarehouseFormDialog";
import GRNBatchSerialDialog, { type GRNBatchSerialResult } from "@/components/inventory/GRNBatchSerialDialog";
import BinLocationPicker from "@/components/inventory/BinLocationPicker";
import { useInventorySettings } from "@/lib/inventorySettings";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchProducts, type Product } from "@/lib/products";
import type { ProductTrackingType } from "@/lib/products";
import {
  fetchGoodsReceipt, fetchGoodsReceiptItems, fetchPendingPOItemsForGRN, saveGRN, deleteGRN,
  duplicateGRN, cancelGRN, logGRNActivity, fetchGRNActivityLogs, blankGRNLine,
  type GRNLine, type GRNStatus, type GRNActivityLog,
} from "@/lib/goodsReceipts";
import { fetchTransporters, type Transporter } from "@/lib/transporters";
import TransporterFormDialog from "@/components/purchase/TransporterFormDialog";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
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

const BASE_GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "product", header: "Product", widthClass: "min-w-[200px]" },
  { key: "part", header: "Part No.", widthClass: "min-w-[140px]" },
  { key: "unit", header: "Unit", widthClass: "w-20" },
  { key: "received", header: "Bill Qty", align: "right", widthClass: "w-24" },
  { key: "damaged", header: "Damaged Qty", align: "right", widthClass: "w-24" },
  { key: "shortage", header: "Shortage", align: "right", widthClass: "w-24" },
  { key: "accepted", header: "Good Qty", align: "right", widthClass: "w-20" },
  { key: "short", header: "Short (ref.)", align: "right", widthClass: "w-16" },
  { key: "excess", header: "Excess (ref.)", align: "right", widthClass: "w-16" },
  { key: "reason", header: "Reason", widthClass: "w-40" },
  { key: "remarks", header: "Quality Remarks", widthClass: "min-w-[140px]" },
  { key: "tracking", header: "Batch/Serial", widthClass: "w-32" },
  { key: "bin", header: "Put-away Bin", widthClass: "w-36" },
];

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const HEADER_INPUT_CLASS =
  "h-6 w-full text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60";

/**
 * One label+field row of the GRN header, explicitly placed into a
 * deterministic 2-column desktop grid via inline grid-column/grid-row
 * (never relies on 12-col auto-flow, which is what let fields drift out of
 * their logical column/row pairing before). Inline placement is inert when
 * the parent isn't display:grid, so the exact same markup naturally stacks
 * in DOM order on mobile -- which is why each call site below appears in
 * mobile-reading-order, not desktop-visual-order.
 */
function headerRow(col: 1 | 2, row: number, label: ReactNode, content: ReactNode, labelExtra?: ReactNode) {
  return (
    <div className="flex items-center gap-2 md:items-start md:py-0.5" style={{ gridColumn: col, gridRow: row }}>
      <span className="w-[150px] shrink-0 text-muted-foreground md:pt-1">
        {label}
        {labelExtra}
      </span>
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  );
}

export default function PurchaseGRN() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const { enableBinManagement } = useInventorySettings();
  const GRID_COLUMNS = useMemo(
    () => (enableBinManagement ? BASE_GRID_COLUMNS : BASE_GRID_COLUMNS.filter((c) => c.key !== "bin")),
    [enableBinManagement],
  );

  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
  const [supplierChallanNumber, setSupplierChallanNumber] = useState("");
  const [supplierChallanDate, setSupplierChallanDate] = useState("");
  const [lrDate, setLrDate] = useState("");

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);

  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [selectedPO, setSelectedPO] = useState("");

  // Receiving-time transport details — captured here (not on the PO) since
  // the actual transporter/LR/vehicle for a shipment is only known once
  // goods physically arrive, and a supplier may use a different transporter
  // per shipment against the same PO.
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [transporterId, setTransporterId] = useState<string | null>(null);
  const [transporterQuery, setTransporterQuery] = useState("");
  const [quickCreateTransporterOpen, setQuickCreateTransporterOpen] = useState(false);
  const [transportName, setTransportName] = useState("");
  const [transportMode, setTransportMode] = useState<string>("");
  const [lrNumber, setLrNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");

  const [items, setItems] = useState<GRNLine[]>([]);
  const [trackingDialogIdx, setTrackingDialogIdx] = useState<number | null>(null);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [allUnits, setAllUnits] = useState<MeasureUnit[]>([]);
  useEffect(() => { fetchUnits().then(setAllUnits).catch(() => {}); }, []);
  const unitLabel = (unitId: string) => allUnits.find((u) => u.id === unitId)?.symbol ?? "";

  // Manual product entry — a GRN line does not require a PO reference (see
  // module doc); the operator can search and add any product actually
  // received, exactly like CreatePurchaseOrder.tsx's line-item search.
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchHighlight, setSearchHighlight] = useState(0);

  const transporterResults = useMemo(() => {
    const q = transporterQuery.trim().toLowerCase();
    if (!q) return transporters.slice(0, 12);
    return transporters.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 12);
  }, [transporters, transporterQuery]);

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
    fetchTransporters(businessId).then(setTransporters).catch(() => {});
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
        // A GRN is a standalone receiving document — it doesn't need a PO to
        // start. Seed a few blank, manually-fillable rows the same way
        // CreatePurchaseOrder.tsx does, instead of waiting on a PO pick.
        setItems(Array.from({ length: 3 }, blankGRNLine));
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
          setTransporterId(grn.transporter_id ?? null);
          setTransportName(grn.transport_name ?? "");
          setTransportMode(grn.transport_mode ?? "");
          setLrNumber(grn.lr_number ?? "");
          setLrDate(grn.lr_date ?? "");
          setVehicleNumber(grn.vehicle_number ?? "");
          setSupplierChallanNumber(grn.supplier_challan_number ?? "");
          setSupplierChallanDate(grn.supplier_challan_date ?? "");
          setSupplierInvoiceNumber(grn.supplier_invoice_number ?? "");
          setSupplierInvoiceDate(grn.supplier_invoice_date ?? "");
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
              shortage_qty: Number(it.shortage_qty ?? 0),
              accepted_qty: Number(it.accepted_qty),
              pending_qty: Number(it.pending_qty),
              short_qty: Number(it.short_qty),
              excess_qty: Number(it.excess_qty),
              quality_remarks: it.quality_remarks ?? "",
              qc_reason_category: it.qc_reason_category,
              unit_id: it.unit_id,
              stock_accepted_qty: it.stock_accepted_qty,
              stock_shortage_qty: it.stock_shortage_qty ?? null,
              stock_received_qty: it.stock_received_qty ?? null,
              bin_id: it.bin_id ?? null,
            })),
          );
          fetchGRNActivityLogs(grn.id).then(setActivityLogs).catch(() => {});
        } catch (e: any) {
          toast.error(e.message);
        }
      }
    })();
  }, [businessId, editId]);

  // Set transporter query when transporter loads
  useEffect(() => {
    if (!transporterId) return;
    const t = transporters.find((x) => x.id === transporterId);
    if (t) setTransporterQuery(t.name);
  }, [transporterId, transporters]);

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

  // ─── PO selection (optional convenience) → auto-fill + pre-fill pending items ──
  // Linking a PO is never required to create/post a GRN (see module doc) --
  // this only pre-fills rows as a shortcut. It merges into whatever's
  // already in the grid (dropping only unused blank placeholder rows)
  // rather than replacing it, so manually-added lines survive picking a PO.
  const handlePOChange = async (poId: string) => {
    setSelectedPO(poId);
    if (!poId) return;
    setLoading(true);
    try {
      const { data: poDetails } = await supabase.from("purchase_orders").select("supplier_id, warehouse_id").eq("id", poId).single();
      if (poDetails) {
        if (poDetails.supplier_id && !selectedSupplier) setSelectedSupplier(poDetails.supplier_id);
        if (poDetails.warehouse_id && !selectedWarehouse) setSelectedWarehouse(poDetails.warehouse_id);
      }
      const pending = await fetchPendingPOItemsForGRN(poId);
      setItems((prev) => {
        const existing = prev.filter((it) => it.product_id.trim());
        return [...existing, ...pending];
      });
      const productIds = [...new Set(pending.map((p) => p.product_id))];
      const puByProduct: Record<string, ProductUnit[]> = {};
      await Promise.all(productIds.map(async (pid) => {
        try { puByProduct[pid] = await fetchProductUnits(pid); } catch { puByProduct[pid] = []; }
      }));
      setUnitsByProduct((m) => ({ ...m, ...puByProduct }));
      if (pending.length === 0) {
        toast.info("Nothing pending on this PO — add the actual received items manually below.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (index: number, field: "received_qty" | "damaged_qty" | "shortage_qty", value: number) => {
    setItems((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const item = { ...row };
      if (field === "received_qty") item.received_qty = Math.max(0, value);
      if (field === "damaged_qty") item.damaged_qty = Math.max(0, value);
      if (field === "shortage_qty") item.shortage_qty = Math.max(0, value);
      // Damaged + physical shortage can never exceed what was actually
      // received -- without this, a stray large number in either field
      // (with Received left at its default) produces a nonsensical state
      // (e.g. "0 received, 700 damaged").
      item.damaged_qty = Math.min(item.damaged_qty, item.received_qty);
      item.shortage_qty = Math.min(item.shortage_qty, Math.max(0, item.received_qty - item.damaged_qty));
      item.accepted_qty = Math.max(0, item.received_qty - item.damaged_qty - item.shortage_qty);
      // Short/excess against a reference qty are purely informational and
      // only meaningful when this line actually has one (i.e. it was loaded
      // from a linked PO) -- a manually-added line with no reference is
      // never "short" or "excess", it's just what physically arrived.
      const hasReference = !!item.purchase_order_item_id;
      item.pending_qty = hasReference ? Math.max(0, item.ordered_qty - item.received_qty) : 0;
      item.short_qty = hasReference ? Math.max(0, item.ordered_qty - item.received_qty) : 0;
      item.excess_qty = hasReference ? Math.max(0, item.received_qty - item.ordered_qty) : 0;
      const pu = unitsByProduct[item.product_id];
      item.stock_accepted_qty = pu?.length ? toStockQty(item.accepted_qty, item.unit_id, pu) : null;
      item.stock_shortage_qty = pu?.length ? toStockQty(item.shortage_qty, item.unit_id, pu) : null;
      item.stock_received_qty = pu?.length ? toStockQty(item.received_qty, item.unit_id, pu) : null;
      item.tracking = undefined; // qty changed — any prior batch/serial entry no longer matches
      return item;
    }));
  };

  // ─── Manual line entry (no PO reference required) ──────────────────────────
  const updateRow = (idx: number, patch: Partial<GRNLine>) =>
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addRow = () => setItems((r) => [...r, blankGRNLine()]);

  const delRow = (idx: number) =>
    setItems((r) => (r.length <= 1 ? [blankGRNLine()] : r.filter((_, i) => i !== idx)));

  const loadProductUnits = async (productId: string): Promise<ProductUnit[]> => {
    if (unitsByProduct[productId]) return unitsByProduct[productId];
    try {
      const pu = await fetchProductUnits(productId);
      setUnitsByProduct((m) => ({ ...m, [productId]: pu }));
      return pu;
    } catch {
      return [];
    }
  };

  /** Picking a product on a row (manually-added, or overwriting a
   *  PO-sourced row) clears any PO reference on that row -- the reference
   *  qty/short/excess belonged to the old product, not this one. */
  const pickProduct = async (idx: number, p: Product) => {
    updateRow(idx, {
      product_id: p.id,
      product_name: p.name,
      part_number: p.part_number,
      tracking_type: (p.tracking_type as ProductTrackingType) ?? "none",
      purchase_order_item_id: null,
      ordered_qty: 0,
      pending_qty: 0,
      short_qty: 0,
      excess_qty: 0,
      unit_id: null,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);

    const pu = await loadProductUnits(p.id);
    if (pu.length) {
      const defaultUnit = purchaseUnitOf(pu);
      if (defaultUnit) updateRow(idx, { unit_id: defaultUnit.unit_id });
    }
  };

  // Product search (mirrors CreatePurchaseOrder.tsx's line-item search)
  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8)
        .then((r) => { setSearchResults(r); setSearchHighlight(0); })
        .catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [searchTerm, searchIdx, user]);

  const handleTrackingConfirm = (index: number, result: GRNBatchSerialResult) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, tracking: result } : r)));
  const handleRemarksChange = (index: number, value: string) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, quality_remarks: value } : r)));
  const handleReasonChange = (index: number, value: string) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, qc_reason_category: value } : r)));
  const handleBinChange = (index: number, binId: string | null) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, bin_id: binId } : r)));

  const validItems = () => items.filter((it) => it.product_id.trim() && Number(it.received_qty) > 0);

  const handleSave = async (targetStatus: "draft" | "received") => {
    if (!user || !businessId || loading || readOnly) return;
    if (!selectedSupplier || !selectedWarehouse) { toast.error("Supplier and Warehouse are required."); return; }
    if (targetStatus === "received" && validItems().length === 0) { toast.error("Add at least one received item first."); return; }
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
        transporter_id: transporterId,
        transport_name: transportName || null,
        transport_mode: (transportMode as any) || null,
        lr_number: lrNumber || null,
        lr_date: lrDate || null,
        vehicle_number: vehicleNumber || null,
        supplier_challan_number: supplierChallanNumber || null,
        supplier_challan_date: supplierChallanDate || null,
        supplier_invoice_number: supplierInvoiceNumber || null,
        supplier_invoice_date: supplierInvoiceDate || null,
        status: targetStatus,
        items: validItems(),
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
    shortage: acc.shortage + it.shortage_qty,
    accepted: acc.accepted + it.accepted_qty,
  }), { ordered: 0, received: 0, damaged: 0, shortage: 0, accepted: 0 }), [items]);

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

        {/* Deterministic 2-column header: LEFT = GRN Number, Supplier, Supplier
            Invoice No./Date, Supplier Challan No./Date, Mode, Vehicle Number,
            Remarks. RIGHT = GRN Date, Warehouse, Transporter, LR Number/Date,
            Link PO. Every field's grid-column/grid-row is explicit (see
            headerRow() above) instead of relying on 12-col auto-flow, so
            label/value pairing can never drift apart regardless of content
            length. DOM order below equals the intended mobile stacking
            order, since grid placement is inert once the parent drops to
            flex-col below md:. */}
        <div className="flex flex-col gap-1 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-0.5 px-3 py-2 border-b border-border text-[12px]">
          {headerRow(1, 1, "GRN Number", (
            <input className={HEADER_INPUT_CLASS} value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} disabled={readOnly} />
          ))}
          {headerRow(2, 1, "GRN Date", (
            <input type="date" className={HEADER_INPUT_CLASS} value={grnDate} onChange={(e) => setGrnDate(e.target.value)} disabled={readOnly} />
          ))}

          {headerRow(1, 2, "Supplier", (
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              disabled={readOnly}
              className={HEADER_INPUT_CLASS}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ))}
          {headerRow(2, 2, "Warehouse", (
            <select
              value={selectedWarehouse}
              onChange={(e) => {
                if (e.target.value === "__add_new__") { setWarehouseDialogOpen(true); return; }
                setSelectedWarehouse(e.target.value);
              }}
              disabled={readOnly}
              className={HEADER_INPUT_CLASS}
            >
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}{w.is_default ? " (Default)" : ""}</option>)}
              {!readOnly && <option value="__add_new__">+ Add Warehouse…</option>}
            </select>
          ))}

          {headerRow(1, 3, "Supplier Invoice No.", (
            <input className={HEADER_INPUT_CLASS} value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} disabled={readOnly} placeholder="Optional — if already known" />
          ))}
          {headerRow(1, 4, "Supplier Invoice Date", (
            <input type="date" className={HEADER_INPUT_CLASS} value={supplierInvoiceDate} onChange={(e) => setSupplierInvoiceDate(e.target.value)} disabled={readOnly} />
          ))}
          {headerRow(1, 5, "Supplier Challan No.", (
            <input className={HEADER_INPUT_CLASS} value={supplierChallanNumber} onChange={(e) => setSupplierChallanNumber(e.target.value)} disabled={readOnly} placeholder="Optional — delivery note #" />
          ))}
          {headerRow(1, 6, "Challan Date", (
            <input type="date" className={HEADER_INPUT_CLASS} value={supplierChallanDate} onChange={(e) => setSupplierChallanDate(e.target.value)} disabled={readOnly} />
          ))}

          {headerRow(2, 3, "Transporter", (
            <DocumentEntitySearchField
              results={transporterResults}
              getKey={(t) => t.id}
              query={transporterQuery}
              disabled={readOnly}
              onQueryChange={(v) => {
                setTransporterQuery(v);
                setTransportName(v);
                const match = transporters.find((t) => t.name.toLowerCase() === v.trim().toLowerCase());
                setTransporterId(match ? match.id : null);
              }}
              onSelect={(t) => {
                setTransporterId(t.id);
                setTransporterQuery(t.name);
                setTransportName(t.name);
              }}
              renderRow={(t) => <span>{t.name}</span>}
              placeholder="Type to search transporter…"
              inputClassName={HEADER_INPUT_CLASS}
              onQuickCreate={readOnly ? undefined : () => setQuickCreateTransporterOpen(true)}
              quickCreateLabel="Transporter"
            />
          ))}
          {headerRow(2, 4, "LR Number", (
            <input className={HEADER_INPUT_CLASS} value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} disabled={readOnly} />
          ))}
          {headerRow(2, 5, "LR Date", (
            <input type="date" className={HEADER_INPUT_CLASS} value={lrDate} onChange={(e) => setLrDate(e.target.value)} disabled={readOnly} />
          ))}
          {headerRow(2, 6, "Link Purchase Order", (
            <select
              value={selectedPO}
              onChange={(e) => handlePOChange(e.target.value)}
              disabled={readOnly}
              className={HEADER_INPUT_CLASS}
            >
              <option value="">No PO — receiving directly</option>
              {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
            </select>
          ), <span className="block text-[10px] normal-case text-muted-foreground/80">Optional — pre-fills items</span>)}

          {headerRow(1, 7, "Mode", (
            <select
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              disabled={readOnly}
              className={HEADER_INPUT_CLASS}
            >
              <option value="">Select mode…</option>
              <option value="road">Road</option>
              <option value="rail">Rail</option>
              <option value="air">Air</option>
              <option value="courier">Courier</option>
              <option value="self_pickup">Self Pickup</option>
              <option value="other">Other</option>
            </select>
          ))}
          {headerRow(1, 8, "Vehicle Number", (
            <input className={HEADER_INPUT_CLASS} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} disabled={readOnly} />
          ))}
          {headerRow(1, 9, "Remarks", (
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={readOnly}
              rows={1}
              placeholder="Add remarks…"
              className="text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none min-h-0 h-6 py-0 w-full"
            />
          ))}
        </div>

        {items.length > 0 && !readOnly && (
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border bg-muted/30 print:hidden">
            Search and add every product the supplier actually delivered — a Purchase Order is optional. Enter the <strong className="text-foreground">Bill Qty</strong> (the full quantity per the supplier's document), then how much of that was bad under <strong className="text-foreground">Damaged Qty</strong> and how much was physically missing under <strong className="text-foreground">Shortage</strong> — Good Qty (what actually enters saleable inventory) is calculated for you. Damage/Shortage are settled as a Debit Note against the Purchase Invoice's own rate/discount/GST once it's linked — the Bill Qty itself, and the invoice, are never edited down. Short/Excess (ref.) only appear when a line was pre-filled from a linked PO.
          </p>
        )}

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          showSpacerRows={false}
          emptyMessage="No lines yet — search for a product below or link a Purchase Order above to pre-fill pending items."
          renderRow={(item, idx) => (
            <>
              <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
              <td className="px-0.5 py-0.5 relative">
                <input
                  disabled={readOnly}
                  value={searchIdx === idx ? searchTerm : item.product_name}
                  placeholder="Search product…"
                  onChange={(e) => {
                    setSearchIdx(idx);
                    setSearchTerm(e.target.value);
                    setSearchHighlight(0);
                  }}
                  onFocus={() => { setSearchIdx(idx); setSearchTerm(item.product_name); setSearchHighlight(0); }}
                  onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx ? null : s)), 150)}
                  onKeyDown={(e) => {
                    if (searchIdx !== idx || searchResults.length === 0) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight((p) => Math.min(p + 1, searchResults.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight((p) => Math.max(p - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); const s = searchResults[searchHighlight]; if (s) pickProduct(idx, s); }
                    else if (e.key === "Escape") { setSearchIdx(null); setSearchResults([]); }
                  }}
                  className="h-6 w-full text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary disabled:opacity-60"
                />
                {searchIdx === idx && searchResults.length > 0 && (
                  <div className="absolute z-50 left-0 mt-0.5 w-80 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto scroll-smooth">
                    {searchResults.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickProduct(idx, p); }}
                        className={`w-full text-left px-2 py-1.5 text-[12px] border-b border-border last:border-0 ${searchHighlight === i ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{p.part_number}</span>
                          <span className={`text-[10px] ${searchHighlight === i ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Stk {p.stock}</span>
                        </div>
                        <div className="text-[11px] truncate">{p.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-1.5 py-1 text-muted-foreground font-mono text-[11px] whitespace-nowrap" title={item.part_number || undefined}>{item.part_number || "—"}</td>
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
              <td className="px-0.5 py-0.5">
                <input
                  type="number" disabled={readOnly} value={item.received_qty}
                  onChange={(e) => handleQtyChange(idx, "received_qty", Number(e.target.value))}
                  title="Editable: Bill Qty — the full quantity per the supplier's document/challan"
                  className="h-6 w-full text-[12px] font-mono px-1 text-right rounded border border-input bg-background focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:bg-transparent disabled:border-0"
                />
              </td>
              <td className="px-0.5 py-0.5">
                <input
                  type="number" disabled={readOnly} value={item.damaged_qty}
                  onChange={(e) => handleQtyChange(idx, "damaged_qty", Number(e.target.value))}
                  title="Editable: how much of the received qty was found damaged"
                  className="h-6 w-full text-[12px] font-mono px-1 text-right text-destructive rounded border border-input bg-background focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:bg-transparent disabled:border-0"
                />
              </td>
              <td className="px-0.5 py-0.5">
                <input
                  type="number" disabled={readOnly} value={item.shortage_qty}
                  onChange={(e) => handleQtyChange(idx, "shortage_qty", Number(e.target.value))}
                  title="Editable: how much of the received qty was physically missing at verification (distinct from Damaged)"
                  className="h-6 w-full text-[12px] font-mono px-1 text-right text-destructive rounded border border-input bg-background focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:bg-transparent disabled:border-0"
                />
              </td>
              <td className="px-1.5 py-1 text-right font-bold text-emerald-600 tabular-nums">{fmt(item.accepted_qty)}</td>
              <td className="px-1.5 py-1 text-right font-semibold text-destructive tabular-nums">{item.purchase_order_item_id ? (item.short_qty || "—") : "—"}</td>
              <td className="px-1.5 py-1 text-right font-semibold text-orange-500 tabular-nums">{item.purchase_order_item_id ? (item.excess_qty || "—") : "—"}</td>
              <td className="px-0.5 py-0.5">
                {item.damaged_qty > 0 || item.shortage_qty > 0 || item.short_qty > 0 ? (
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
              <td className="px-0.5 py-0.5">
                <input
                  disabled={readOnly} value={item.quality_remarks} placeholder="e.g. damaged in transit"
                  onChange={(e) => handleRemarksChange(idx, e.target.value)}
                  className="h-6 w-full text-[11px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary disabled:opacity-60"
                />
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
              {enableBinManagement && (
                <td className="px-1 py-0.5">
                  <BinLocationPicker
                    warehouseId={selectedWarehouse || null}
                    value={item.bin_id}
                    onChange={(binId) => handleBinChange(idx, binId)}
                    disabled={readOnly}
                    placeholder="Auto"
                    className="h-6 text-[11px] px-1.5 rounded-none border-0 border-b border-dotted border-border bg-transparent focus:ring-0"
                  />
                </td>
              )}
              <td className="px-0.5 py-0.5">
                {!readOnly && (
                  <button type="button" onClick={() => delRow(idx)} className="text-destructive/60 hover:text-destructive transition-colors" title="Remove row">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </td>
            </>
          )}
          renderFooter={
            !readOnly ? (
              <td colSpan={GRID_COLUMNS.length + 2} className="px-1.5 py-1.5">
                <button type="button" onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add Row
                </button>
              </td>
            ) : undefined
          }
        />

        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-3 px-3 py-2 border-t border-border text-[12px] font-sans">
            <div><span className="text-muted-foreground">Total Bill Qty: </span><strong>{fmt(totals.received)}</strong></div>
            <div><span className="text-destructive">Total Damaged: </span><strong>{fmt(totals.damaged)}</strong></div>
            <div><span className="text-destructive">Total Shortage: </span><strong>{fmt(totals.shortage)}</strong></div>
            <div><span className="text-emerald-600">Total Good Stock: </span><strong>{fmt(totals.accepted)}</strong></div>
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

      {user && businessId && (
        <TransporterFormDialog
          open={quickCreateTransporterOpen}
          onOpenChange={setQuickCreateTransporterOpen}
          businessId={businessId}
          userId={user.id}
          onCreated={(t) => {
            setTransporters((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
            setTransporterId(t.id);
            setTransporterQuery(t.name);
            setTransportName(t.name);
          }}
        />
      )}

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
