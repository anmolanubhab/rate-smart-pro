import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Save,
  CheckCircle2,
  ShieldCheck,
  X,
  Plus,
  Trash2,
  FileDown,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Upload,
  Printer,
  Ban,
  Copy,
} from "lucide-react";
import MultiCopyPrintRun from "@/components/print/MultiCopyPrintRun";
import PrintCopyDialog from "@/components/print/PrintCopyDialog";
import { applyPrintPageStyle, contentWidthMm } from "@/components/print/printPageStyle";
import { fetchEnabledPrintCopyTypes, type PrintCopyType } from "@/lib/printCopyTypes";
import { fetchDefaultPrintProfile, profileToPrintConfig, type PrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";
import {
  fetchProductUnits, fetchUnits, purchaseUnitOf, stockUnitOf, toStockQty,
  type ProductUnit, type Unit as MeasureUnit,
} from "@/lib/units";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Badge } from "@/components/ui/badge";
import { fetchParties, Party } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import POExcelUpload from "@/components/purchase/POExcelUpload";
import {
  POItem,
  POStatus,
  PurchaseOrder,
  blankPOItem,
  computePOItem,
  computePOTotals,
  exportPOToExcel,
  downloadPOImportTemplate,
  fetchPOItems,
  fetchPurchaseOrder,
  localPONumber,
  nextPONumber,
  savePurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  cancelPurchaseOrder,
  duplicatePurchaseOrder,
  deletePurchaseOrder,
  logPOActivity,
  fetchPOActivityLogs,
  type POActivityLog,
} from "@/lib/purchaseOrders";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, DocumentToolbarButton, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { DocumentImportExportButtons } from "@/components/documentEngine/DocumentImportExportButtons";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentAuditLog } from "@/components/documentEngine/DocumentAuditLog";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import { useDocumentShortcuts } from "@/hooks/useDocumentShortcuts";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLS = ["part", "desc", "qty", "rate", "disc", "gst"] as const;
type Col = (typeof COLS)[number];

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[120px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[180px]" },
  { key: "qty", header: "Qty", align: "right", widthClass: "w-20" },
  { key: "unit", header: "Unit", widthClass: "w-16" },
  { key: "rate", header: "Rate (₹)", align: "right", widthClass: "w-24" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-16" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-16" },
  { key: "taxable", header: "Taxable", align: "right", widthClass: "w-24" },
  { key: "tax", header: "Tax", align: "right", widthClass: "w-20" },
  { key: "total", header: "Total (₹)", align: "right", widthClass: "w-24" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CreatePurchaseOrder() {
  const { user, loading: authLoading } = useAuth();
  const { role, permissions } = useBusiness();
  const canApprove = canGranular(role, "purchase.approve", permissions);
  const businessId = getActiveBusinessIdSync();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();

  // Header fields
  const [poNumber, setPONumber] = useState("");
  const [poDate, setPODate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [remarks, setRemarks] = useState("");
  const [transportName, setTransportName] = useState("");
  const [transportMode, setTransportMode] = useState<string>("");
  const [lrNumber, setLrNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [termsConditions, setTermsConditions] = useState("");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");

  // Supplier (from parties, type = supplier)
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");

  // Warehouse
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  // Layer C1: per-product unit options, cached by product_id to avoid N+1 fetches
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [allUnits, setAllUnits] = useState<MeasureUnit[]>([]);
  useEffect(() => { fetchUnits().then(setAllUnits).catch(() => {}); }, []);
  const unitLabel = (unitId: string) => {
    const u = allUnits.find((x) => x.id === unitId);
    return u ? `${u.symbol}` : "";
  };
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

  // Items
  const [items, setItems] = useState<POItem[]>(Array.from({ length: 5 }, blankPOItem));

  // Product autocomplete
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchHighlight, setSearchHighlight] = useState(0);

  // UI state
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<POStatus>("draft");
  // Once goods have been received against this PO, changing who it was
  // ordered from would corrupt the supplier ledger / receiving history --
  // same "can't rewrite the past" reasoning as the item-edit block in
  // savePurchaseOrder(), applied to the one header field where it actually
  // matters (dates/remarks/transport can still be corrected).
  const [hasGRN, setHasGRN] = useState(false);
  const [savedPO, setSavedPO] = useState<PurchaseOrder | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<POActivityLog[]>([]);
  const [duplicating, setDuplicating] = useState(false);

  // Print
  const [printData, setPrintData] = useState<{ company: any; party: any; meta: any; items: any[]; totals: any } | null>(null);
  const [printProfile, setPrintProfile] = useState<PrintProfile | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTypes, setCopyTypes] = useState<PrintCopyType[]>([]);
  const [copyLabels, setCopyLabels] = useState<string[]>([]);

  const poIdRef = useRef<string | null>(editId || null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const { focusCell, handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const supplierResults = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 12);
    if (supplier && supplier.name.trim().toLowerCase() === q) return [];
    return suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 12);
  }, [suppliers, supplierQuery, supplier]);

  // Mirrors the server-side edit-lock in savePurchaseOrder(): once a PO has
  // moved past draft/pending_approval, supplier/warehouse/rate become
  // read-only, and qty is only locked per line once something has actually
  // been received. This is the UI-level version of that same rule — the
  // server check is the real guard, this just avoids a surprise save-time
  // error by disabling the fields up front.
  const isApprovalLocked = editMode && ["approved", "ordered", "partially_received", "received"].includes(currentStatus);
  const isQtyLocked = isApprovalLocked && Number(savedPO?.received_qty ?? 0) > 0;

  const totals = useMemo(() => computePOTotals(items), [items]);
  const cgst = +(totals.tax_total / 2).toFixed(2);
  const sgst = +(totals.tax_total / 2).toFixed(2);
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2);
  const finalTotal = Math.round(totals.grand_total);
  const validItems = () => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  const dupSet = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => {
      const k = r.part_number.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [items]);

  // ─── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.title = editId ? "Edit Purchase Order — RD Pro" : "New Purchase Order — RD Pro";
  }, [editId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !businessId) return;

    fetchParties(user.id, "supplier").then(setSuppliers).catch(() => {});
    supabase
      .from("warehouses")
      .select("id, warehouse_name")
      .eq("business_id", businessId)
      .order("warehouse_name", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setWarehouses(data);
          if (data.length === 1) setWarehouseId(data[0].id);
        }
      });

    if (!editId) {
      setPONumber(localPONumber());
      nextPONumber(businessId).then((n) => setPONumber(n)).catch(() => {});
      setTimeout(() => supplierInputRef.current?.focus(), 100);
    } else {
      (async () => {
        try {
          const po = await fetchPurchaseOrder(editId);
          const its = await fetchPOItems(editId);
          setPONumber(po.po_number);
          setPODate(po.po_date);
          setExpectedDelivery(po.expected_delivery_date || "");
          setRemarks(po.remarks || "");
          setSupplierId(po.supplier_id || "");
          setWarehouseId(po.warehouse_id || null);
          setTransportName(po.transport_name || "");
          setTransportMode(po.transport_mode || "");
          setLrNumber(po.lr_number || "");
          setVehicleNumber(po.vehicle_number || "");
          setPaymentTerms(po.payment_terms || "");
          setTermsConditions(po.terms_conditions || "");
          setTaxMode(po.tax_mode || "exclusive");
          setCurrentStatus(po.status);
          setSavedPO(po);
          setEditMode(true);
          poIdRef.current = po.id;
          setItems(its.length ? its : Array.from({ length: 5 }, blankPOItem));
          fetchPOActivityLogs(po.id).then(setActivityLogs).catch(() => {});

          const { count: grnCount } = await supabase
            .from("goods_receipts")
            .select("id", { count: "exact", head: true })
            .eq("purchase_order_id", editId);
          setHasGRN((grnCount ?? 0) > 0);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    }
  }, [authLoading, user, businessId, editId]);

  // Set supplier query when supplier loads
  useEffect(() => {
    if (supplier) setSupplierQuery(supplier.name);
  }, [supplierId]);

  // Product search
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

  // Auto-scroll product dropdown
  useEffect(() => {
    const el = document.getElementById(`po-prod-${searchHighlight}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [searchHighlight]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const updateRow = (idx: number, patch: Partial<POItem>) => {
    setItems((rows) =>
      rows.map((r, i) => (i !== idx ? r : computePOItem({ ...r, ...patch })))
    );
  };

  const addRow = () => setItems((r) => [...r, blankPOItem()]);

  const delRow = (idx: number) =>
    setItems((r) => (r.length <= 1 ? [blankPOItem()] : r.filter((_, i) => i !== idx)));

  const pickProduct = async (idx: number, p: Product) => {
    const qty = items[idx].qty || 1;
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      rate: Number(p.mrp),
      gst_percent: Number(p.gst_pct),
      qty,
      unit_id: null,
      stock_qty: null,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);

    // Layer C1: default to this product's configured Purchase Unit, if any
    const pu = await loadProductUnits(p.id);
    if (pu.length) {
      const defaultUnit = purchaseUnitOf(pu);
      if (defaultUnit) {
        updateRow(idx, {
          unit_id: defaultUnit.unit_id,
          stock_qty: toStockQty(qty, defaultUnit.unit_id, pu),
        });
      }
    }
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    if (searchIdx === idx && searchResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight((p) => Math.min(p + 1, searchResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); const s = searchResults[searchHighlight]; if (s) pickProduct(idx, s); return; }
      if (e.key === "Escape") { setSearchIdx(null); setSearchResults([]); return; }
    }
    handleGridKey(e, idx, col, { rowCount: items.length, onAddRow: addRow });
  };

  const handleImport = (imported: POItem[]) => {
    setItems((prev) => {
      // Remove blank placeholder rows first
      const existing = prev.filter((it) => it.part_number.trim() || Number(it.qty) > 0);
      const merged = [...existing, ...imported];
      // Pad with blank rows so the grid never looks empty
      while (merged.length < 5) merged.push(blankPOItem());
      return merged;
    });
  };

  const handleSave = async (status: POStatus = "draft") => {
    if (!user || saving) return;
    if (status !== "draft" && !supplierId) { toast.error("Please select a supplier"); return; }
    if (status !== "draft" && !validItems().length) { toast.error("Add at least one line item"); return; }
    const isNewPO = !poIdRef.current;
    try {
      setSaving(true);
      const saved = await savePurchaseOrder({
        userId: user.id,
        id: poIdRef.current || undefined,
        po_number: poNumber,
        supplier_id: supplierId || null,
        warehouse_id: warehouseId,
        po_date: poDate,
        expected_delivery_date: expectedDelivery || null,
        status,
        remarks: remarks || null,
        transport_name: transportName || null,
        transport_mode: (transportMode as any) || null,
        lr_number: lrNumber || null,
        vehicle_number: vehicleNumber || null,
        payment_terms: paymentTerms || null,
        terms_conditions: termsConditions || null,
        tax_mode: taxMode,
        items: validItems(),
      });
      poIdRef.current = saved.id;
      setSavedPO(saved);
      setCurrentStatus(saved.status);
      setEditMode(true);
      if (!poNumber) setPONumber(saved.po_number);

      await logPOActivity({
        userId: user.id,
        purchaseOrderId: saved.id,
        action: isNewPO ? "created" : status === "pending_approval" ? "submitted" : "draft_saved",
        description: isNewPO ? `Created as ${saved.po_number}` : undefined,
      });
      fetchPOActivityLogs(saved.id).then(setActivityLogs).catch(() => {});

      if (status === "pending_approval") {
        toast.success("Purchase Order submitted for approval");
        navigate(`/purchase/orders`);
      } else {
        toast.success("Draft saved", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !poIdRef.current) return;
    try {
      setSaving(true);
      await approvePurchaseOrder(poIdRef.current, user.id);
      await logAudit({
        business_id: businessId,
        action: "purchase_order.approve",
        entity_type: "purchase_order",
        entity_id: poIdRef.current,
        old_value: { status: currentStatus },
        new_value: { status: "approved" },
      });
      await logPOActivity({ userId: user.id, purchaseOrderId: poIdRef.current, action: "approved", oldData: { status: currentStatus }, newData: { status: "approved" } });
      fetchPOActivityLogs(poIdRef.current).then(setActivityLogs).catch(() => {});
      setCurrentStatus("approved");
      toast.success("Purchase Order approved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!user || !poIdRef.current) return;
    const reason = window.prompt("Reason for rejecting this PO? (optional)") ?? "";
    try {
      setSaving(true);
      await rejectPurchaseOrder(poIdRef.current, user.id, reason || null);
      await logAudit({
        business_id: businessId,
        action: "purchase_order.reject",
        entity_type: "purchase_order",
        entity_id: poIdRef.current,
        old_value: { status: currentStatus },
        new_value: { status: "rejected", reason },
        reason: reason || null,
      });
      await logPOActivity({ userId: user.id, purchaseOrderId: poIdRef.current, action: "rejected", description: reason || undefined, oldData: { status: currentStatus }, newData: { status: "rejected" } });
      fetchPOActivityLogs(poIdRef.current).then(setActivityLogs).catch(() => {});
      setCurrentStatus("rejected");
      toast.success("Purchase Order rejected");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPO = async () => {
    if (!user || !poIdRef.current) return;
    const reason = window.prompt("Reason for cancelling this Purchase Order? (optional)") ?? "";
    try {
      setSaving(true);
      await cancelPurchaseOrder(poIdRef.current, reason, user.id);
      await logAudit({
        business_id: businessId,
        action: "purchase_order.cancel",
        entity_type: "purchase_order",
        entity_id: poIdRef.current,
        old_value: { status: currentStatus },
        new_value: { status: "cancelled", reason },
        reason: reason || null,
      });
      await logPOActivity({ userId: user.id, purchaseOrderId: poIdRef.current, action: "cancelled", description: reason || undefined, oldData: { status: currentStatus }, newData: { status: "cancelled" } });
      fetchPOActivityLogs(poIdRef.current).then(setActivityLogs).catch(() => {});
      setCurrentStatus("cancelled");
      toast.success("Purchase Order cancelled");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!savedPO) { toast.error("Save the PO first to export"); return; }
    exportPOToExcel(savedPO, validItems(), supplier?.name);
  };

  const handleDuplicate = async () => {
    if (!user || !poIdRef.current || duplicating) return;
    setDuplicating(true);
    try {
      const clone = await duplicatePurchaseOrder(poIdRef.current, user.id);
      toast.success(`Duplicated as ${clone.po_number}`);
      navigate(`/purchase/orders/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate purchase order");
    } finally {
      setDuplicating(false);
    }
  };

  const handlePrint = async () => {
    if (!savedPO || !businessId) { toast.error("Save the PO first to print"); return; }
    try {
      const [{ data: biz }, types, profile] = await Promise.all([
        supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
        fetchEnabledPrintCopyTypes(businessId),
        fetchDefaultPrintProfile(businessId, "purchase_order"),
      ]);
      const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean);
      const items = validItems();
      const weights = await fetchProductWeights(items.map((it) => it.product_id));

      setPrintData({
        company: { name: biz?.business_name ?? "—", addressLines, gstin: biz?.gst_number ?? null, logoUrl: biz?.logo_url ?? null },
        party: {
          name: supplier?.name ?? "—",
          mobile: supplier?.phone ?? null,
          address: supplier?.address ?? null,
          gstNo: supplier?.gst ?? null,
        },
        meta: { number: poNumber, numberLabel: "PO No", date: poDate },
        items: items.map((it) => ({
          partNumber: it.part_number ?? "",
          description: it.description ?? "",
          hsn: null,
          qty: Number(it.qty) || 0,
          rate: Number(it.rate) || 0,
          gstPct: Number(it.gst_percent) || 0,
          amount: Number(it.total_amount) || 0,
          discountPct: it.discount_percent != null ? Number(it.discount_percent) : null,
          weight: it.product_id ? weights.get(it.product_id) ?? null : null,
        })),
        totals: {
          subtotal: Number(totals.subtotal) || 0,
          discount: Number(totals.discount_total) || 0,
          tax: Number(totals.tax_total) || 0,
          grandTotal: finalTotal,
        },
      });
      setPrintProfile(profile);
      setCopyTypes(types);
      setCopyDialogOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare purchase order for printing");
    }
  };

  useDocumentShortcuts(
    {
      onSaveDraft: () => handleSave("draft"),
      onSubmit: () => handleSave("pending_approval"),
      onAddRow: addRow,
    },
    [items, supplierId, user, poNumber, poDate],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Show skeleton while auth or business context is resolving — prevents white flash
  if (authLoading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-pulse space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="flex gap-2">
            {[80, 96, 96, 72].map((w, i) => (
              <div key={i} className="h-8 bg-muted rounded" style={{ width: w }} />
            ))}
          </div>
        </div>
        <div className="border border-border rounded">
          <div className="h-8 bg-primary/20 rounded-t" />
          <div className="p-4 grid grid-cols-2 gap-3 border-b border-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted rounded" />
            ))}
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-7 bg-muted/60 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "print", label: "Print", icon: Printer, onClick: handlePrint, hidden: !editMode },
    { key: "save", label: "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: () => handleSave("draft"), disabled: saving },
    { key: "submit", label: "Submit", icon: CheckCircle2, shortcut: "Ctrl+Enter", onClick: () => handleSave("pending_approval"), disabled: saving, variant: "primary" },
    { key: "reject", label: "Reject", icon: X, onClick: handleReject, disabled: saving, hidden: !(editMode && currentStatus === "pending_approval" && canApprove), className: "border-destructive/40 text-destructive" },
    { key: "approve", label: "Approve", icon: ShieldCheck, onClick: handleApprove, disabled: saving, hidden: !(editMode && currentStatus === "pending_approval" && canApprove), variant: "primary" },
    { key: "cancel", label: "Cancel PO", icon: Ban, onClick: handleCancelPO, disabled: saving, hidden: !(editMode && currentStatus !== "cancelled" && currentStatus !== "closed"), className: "border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700" },
    { key: "duplicate", label: duplicating ? "Duplicating…" : "Duplicate", icon: Copy, onClick: handleDuplicate, disabled: duplicating, hidden: !editMode },
    { key: "close", label: "Close", icon: X, onClick: () => navigate("/purchase/orders"), variant: "ghost", className: "text-muted-foreground" },
  ];

  return (
    <DocumentRoot type="purchase_order" printMode="multiCopy" className="po-entry space-y-0">
      {/* ── Top action bar ──────────────────────────────────────────────── */}
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? "Edit Purchase Order" : "New Purchase Order"}
            </span>
            {poNumber && <Badge variant="outline" className="text-[10px]">#{poNumber}</Badge>}
            {editMode && <DocumentStatusBadge status={currentStatus} label={currentStatus.replace(/_/g, " ")} />}
            {dupSet.size > 0 && <DocumentStatusBadge status="duplicate_items" tone="warning" label="Duplicate items" />}
          </>
        }
        actions={[
          { key: "template", label: "Template", icon: FileSpreadsheet, onClick: downloadPOImportTemplate, variant: "ghost" },
          { key: "import", label: "Import XLS", icon: Upload, onClick: () => setImportOpen(true) },
          { key: "export", label: "Export XLS", icon: FileDown, onClick: handleExport },
          ...toolbarActions,
        ]}
      />

      {/* ── PO Sheet ────────────────────────────────────────────────────── */}
      <DocumentSheet>

        {/* Header bar */}
        <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center justify-between text-xs">
          <div className="font-sans font-semibold tracking-wide">Purchase Order</div>
          <div className="font-sans opacity-80">RD Pro</div>
          <button
            onClick={() => setHeaderCollapsed((p) => !p)}
            className="opacity-70 hover:opacity-100 transition-opacity md:hidden"
            title="Toggle header"
          >
            {headerCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>

        {/* Header fields */}
        {!headerCollapsed && (
          <DocumentHeaderGrid mobileResponsive>
            <DocumentHeaderInputField label="PO Number" value={poNumber} onChange={(e) => setPONumber(e.target.value)} />
            <DocumentHeaderInputField label="PO Date" labelAlign="right" type="date" value={poDate} onChange={(e) => setPODate(e.target.value)} />

            <DocumentHeaderLabel span={2}>
              Supplier
              {(hasGRN || isApprovalLocked) && (
                <span className="block text-[10px] normal-case text-amber-600">
                  {hasGRN ? "Locked — goods already received" : "Locked — approved"}
                </span>
              )}
            </DocumentHeaderLabel>
            <DocumentHeaderValue span={10}>
              <DocumentEntitySearchField
                results={supplierResults}
                getKey={(s) => s.id}
                query={supplierQuery}
                disabled={hasGRN || isApprovalLocked}
                onQueryChange={(v) => {
                  setSupplierQuery(v);
                  const match = suppliers.find((s) => s.name.toLowerCase() === v.trim().toLowerCase());
                  setSupplierId(match ? match.id : "");
                }}
                onSelect={(s, source) => {
                  setSupplierId(s.id);
                  setSupplierQuery(s.name);
                  if (source === "keyboard") setTimeout(() => focusCell(0, "part"), 10);
                }}
                renderRow={(s, highlighted) => (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.name}</span>
                    {s.gst && (
                      <span className={`text-[10px] ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        GST: {s.gst}
                      </span>
                    )}
                  </div>
                )}
                placeholder="Type to search supplier…"
                inputRef={supplierInputRef}
                inputClassName="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </DocumentHeaderValue>

            {supplier && (
              <>
                <DocumentHeaderLabel>Address</DocumentHeaderLabel>
                <DocumentHeaderValue span={10} className="truncate italic">
                  {supplier.billing_address || supplier.address || "—"}
                </DocumentHeaderValue>
              </>
            )}

            <DocumentHeaderLabel>Warehouse</DocumentHeaderLabel>
            <DocumentHeaderValue>
              <select
                value={warehouseId ?? ""}
                onChange={(e) => setWarehouseId(e.target.value || null)}
                disabled={isApprovalLocked}
                className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.warehouse_name}</option>
                ))}
              </select>
            </DocumentHeaderValue>

            <DocumentHeaderInputField label="Transport" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="Transporter name" />
            <DocumentHeaderLabel align="right">Mode</DocumentHeaderLabel>
            <DocumentHeaderValue>
              <select
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              >
                <option value="">Select mode…</option>
                <option value="road">Road</option>
                <option value="rail">Rail</option>
                <option value="air">Air</option>
                <option value="courier">Courier</option>
                <option value="self_pickup">Self Pickup</option>
                <option value="other">Other</option>
              </select>
            </DocumentHeaderValue>

            <DocumentHeaderInputField label="LR Number" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
            <DocumentHeaderInputField label="Vehicle Number" labelAlign="right" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />

            <DocumentHeaderInputField label="Payment Terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30 days" />
            <DocumentHeaderLabel align="right">Tax Mode</DocumentHeaderLabel>
            <DocumentHeaderValue>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as "inclusive" | "exclusive")}
                className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              >
                <option value="exclusive">Exclusive of Tax</option>
                <option value="inclusive">Inclusive of Tax</option>
              </select>
            </DocumentHeaderValue>

            <DocumentHeaderInputField label="Terms & Conditions" value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} placeholder="Printed on the PO document…" valueSpan={10} />

            <DocumentHeaderLabel align="right">Expected Delivery</DocumentHeaderLabel>
            <DocumentHeaderValue>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary w-full outline-none"
              />
            </DocumentHeaderValue>

            {editMode && savedPO && (
              <>
                <DocumentHeaderLabel>Qty Status</DocumentHeaderLabel>
                <DocumentHeaderValue span={10} className="flex gap-4 font-mono">
                  <span>Ordered: <strong>{savedPO.total_qty}</strong></span>
                  <span className="text-emerald-600">Received: <strong>{savedPO.received_qty}</strong></span>
                  <span className="text-orange-500">Pending: <strong>{savedPO.pending_qty}</strong></span>
                </DocumentHeaderValue>
              </>
            )}

            <DocumentHeaderInputField label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes or reference…" valueSpan={10} />
          </DocumentHeaderGrid>
        )}

        {/* ── Line items table ─────────────────────────────────────────── */}
        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          spacerModulo={3}
          isDuplicate={(r) => !!r.part_number.trim() && dupSet.has(r.part_number.trim().toLowerCase())}
          renderRow={(it, idx) => (
            <>
              <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
              <td className="px-0.5 py-0.5 relative">
                <DocumentGridCellInput
                  data-row={idx}
                  data-col="part"
                  value={it.part_number}
                  onChange={(e) => {
                    updateRow(idx, { part_number: e.target.value.toUpperCase() });
                    setSearchIdx(idx);
                    setSearchTerm(e.target.value);
                    setSearchHighlight(0);
                  }}
                  onFocus={() => { setSearchIdx(idx); setSearchTerm(it.part_number); setSearchHighlight(0); }}
                  onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx ? null : s)), 150)}
                  onKeyDown={(e) => handleKey(e, idx, "part")}
                  className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary uppercase"
                  placeholder="Part #"
                />
                {searchIdx === idx && searchResults.length > 0 && (
                  <div className="absolute z-50 left-0 mt-0.5 w-80 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto scroll-smooth">
                    {searchResults.map((p, i) => (
                      <button
                        key={p.id}
                        id={`po-prod-${i}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickProduct(idx, p); }}
                        className={`w-full text-left px-2 py-1.5 text-[12px] border-b border-border last:border-0 ${searchHighlight === i ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{p.part_number}</span>
                          <span className={`text-[10px] ${searchHighlight === i ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            Stk {p.stock}
                          </span>
                        </div>
                        <div className="text-[11px] truncate">{p.name}</div>
                        <div className={`text-[10px] ${searchHighlight === i ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          MRP ₹{fmt(Number(p.mrp))} · GST {p.gst_pct}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput data-row={idx} data-col="desc" value={it.description} onChange={(e) => updateRow(idx, { description: e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "desc")} placeholder="Description" />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput
                  align="right" data-row={idx} data-col="qty" type="number" step="any" value={it.qty || ""}
                  disabled={isQtyLocked && !!it.id}
                  onChange={(e) => {
                    const qty = +e.target.value;
                    const pu = it.product_id ? unitsByProduct[it.product_id] : undefined;
                    updateRow(idx, { qty, stock_qty: pu ? toStockQty(qty, it.unit_id, pu) : null });
                  }}
                  onKeyDown={(e) => handleKey(e, idx, "qty")}
                />
              </td>
              <td className="px-0.5 py-0.5">
                {it.product_id && unitsByProduct[it.product_id]?.length ? (
                  <select
                    value={it.unit_id ?? ""}
                    onChange={(e) => {
                      const pu = unitsByProduct[it.product_id!] ?? [];
                      updateRow(idx, { unit_id: e.target.value || null, stock_qty: toStockQty(it.qty, e.target.value, pu) });
                    }}
                    className="h-6 text-[11px] font-mono px-0.5 rounded-none border-0 bg-transparent focus-visible:ring-0 w-full"
                  >
                    {unitsByProduct[it.product_id].map((u) => (
                      <option key={u.unit_id} value={u.unit_id}>{unitLabel(u.unit_id)}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] text-muted-foreground px-1">—</span>
                )}
                {it.stock_qty != null && it.product_id && (
                  <div className="text-[9px] text-muted-foreground px-1 leading-none pb-0.5">
                    → {fmt(it.stock_qty)} {(() => {
                      const su = unitsByProduct[it.product_id!] && stockUnitOf(unitsByProduct[it.product_id!]);
                      return su ? unitLabel(su.unit_id) : "";
                    })()}
                  </div>
                )}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="rate" type="number" step="any" value={it.rate || ""} onChange={(e) => updateRow(idx, { rate: +e.target.value })}
                  disabled={isApprovalLocked && !!it.id}
                  onKeyDown={(e) => handleKey(e, idx, "rate")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="disc" type="number" step="any" value={it.discount_percent || ""} onChange={(e) => updateRow(idx, { discount_percent: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "disc")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="gst" type="number" step="any" value={it.gst_percent || ""} onChange={(e) => updateRow(idx, { gst_percent: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "gst")} />
              </td>
              <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.taxable_amount)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.tax_amount)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums font-semibold">{fmt(it.total_amount)}</td>
              <td className="px-0.5 py-0.5">
                <button onClick={() => delRow(idx)} className="text-destructive/60 hover:text-destructive transition-colors" title="Remove row">
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </>
          )}
          renderFooter={
            <>
              <td colSpan={3} className="px-1.5 py-1.5">
                <div className="flex items-center gap-4 font-sans">
                  <button onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1" title="Alt+N">
                    <Plus className="h-3 w-3" /> Add Row
                  </button>
                  <button onClick={() => setImportOpen(true)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                    <Upload className="h-3 w-3" /> Import XLS
                  </button>
                  <button onClick={downloadPOImportTemplate} className="text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-1">
                    <FileSpreadsheet className="h-3 w-3" /> Template
                  </button>
                </div>
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.total_qty)} Qty</td>
              <td colSpan={4}></td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.tax_total)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.grand_total)}</td>
              <td></td>
            </>
          }
        />

        {/* ── Footer: remarks + totals ────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-3 py-3 border-t border-border">

          {/* Left: narration / terms */}
          <div className="md:col-span-7 space-y-2">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-sans">
                Additional Remarks
              </p>
              <DocumentGridCellInput
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Delivery instructions, payment terms, etc."
                className="h-7 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
            <p className="text-[11px] text-muted-foreground font-sans">
              Shortcuts: <kbd className="font-mono border border-border rounded px-1 text-[10px]">Ctrl+S</kbd> Save Draft&nbsp;&nbsp;
              <kbd className="font-mono border border-border rounded px-1 text-[10px]">Ctrl+Enter</kbd> Submit&nbsp;&nbsp;
              <kbd className="font-mono border border-border rounded px-1 text-[10px]">Alt+N</kbd> Add Row
            </p>
          </div>

          {/* Right: totals panel */}
          <div className="md:col-span-5">
            <DocumentTotals
              title="PO Totals"
              lines={[
                { label: "Subtotal (Gross)", value: fmt(totals.subtotal) },
                { label: "Discount", value: `− ${fmt(totals.discount_total)}` },
                { label: "Taxable Amount", value: fmt(totals.taxable), bold: true },
                { label: "CGST", value: fmt(cgst) },
                { label: "SGST", value: fmt(sgst) },
                { label: "Round Off", value: (roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff)) },
              ]}
              grandTotal={`₹${fmt(finalTotal)}`}
            />

            {/* Action buttons (duplicated below totals for quick access) — omits Print/Template/Import/Export, matching the original's "quick decision actions only" bottom row */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {toolbarActions
                .filter((a) => !a.hidden && a.key !== "print")
                .map((a) => (
                  <DocumentToolbarButton key={a.key} action={a} extraClassName="flex-1 min-w-[100px]" />
                ))}
            </div>
          </div>
        </div>

        {/* ── Activity Timeline + Audit Log (once the PO has been saved at least once) ── */}
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

      {/* ── Excel Import Dialog ────────────────────────────────────── */}
      {user && (
        <POExcelUpload
          open={importOpen}
          onOpenChange={setImportOpen}
          userId={user.id}
          onImport={handleImport}
        />
      )}

      <style>{`
        .po-entry input[type=number]::-webkit-outer-spin-button,
        .po-entry input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .po-entry input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {printData && printProfile && (
        <PrintCopyDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          copyTypes={copyTypes}
          onConfirm={(labels) => {
            applyPrintPageStyle(printProfile);
            setCopyLabels(labels);
            setTimeout(() => window.print(), 50);
          }}
        />
      )}
      {printData && printProfile && copyLabels.length > 0 && (
        <MultiCopyPrintRun
          copyLabels={copyLabels}
          config={profileToPrintConfig(printProfile)}
          company={printData.company}
          party={printData.party}
          meta={printData.meta}
          items={printData.items}
          totals={printData.totals}
          contentWidthMm={contentWidthMm(printProfile)}
        />
      )}
    </DocumentRoot>
  );
}
