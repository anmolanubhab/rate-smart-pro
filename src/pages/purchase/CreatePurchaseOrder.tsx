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
  AlertCircle,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/lib/purchaseOrders";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLS = ["part", "desc", "qty", "rate", "disc", "gst"] as const;
type Col = (typeof COLS)[number];

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<POStatus, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/5",
  pending_approval: "border-blue-500/40 text-blue-600 bg-blue-500/5",
  approved: "border-emerald-500/40 text-emerald-600 bg-emerald-500/5",
  ordered: "border-primary/40 text-primary bg-primary/5",
  partially_received: "border-orange-500/40 text-orange-600 bg-orange-500/5",
  received: "border-emerald-600/40 text-emerald-700 bg-emerald-600/5",
  cancelled: "border-destructive/40 text-destructive bg-destructive/5",
  closed: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CreatePurchaseOrder() {
  const { user, loading: authLoading } = useAuth();
  const businessId = getActiveBusinessIdSync();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();

  // Header fields
  const [poNumber, setPONumber] = useState("");
  const [poDate, setPODate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [remarks, setRemarks] = useState("");

  // Supplier (from parties, type = supplier)
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierHighlight, setSupplierHighlight] = useState(0);

  // Warehouse (static placeholder for now — wire to warehouses table when ready)
  const [warehouseId] = useState<string | null>(null);

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
  const [savedPO, setSavedPO] = useState<PurchaseOrder | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const poIdRef = useRef<string | null>(editId || null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const supplierResults = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 12);
    return suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 12);
  }, [suppliers, supplierQuery]);

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

    fetchParties(user.id).then(setSuppliers).catch(() => {});

    if (!editId) {
      setPONumber(localPONumber());
      nextPONumber(businessId)
        .then((n) => setPONumber(n))
        .catch(() => {});
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
          setCurrentStatus(po.status);
          setSavedPO(po);
          setEditMode(true);
          poIdRef.current = po.id;
          setItems(its.length ? its : Array.from({ length: 5 }, blankPOItem));
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); handleSave("draft"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSave("pending_approval"); }
      if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); addRow(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, supplierId, user, poNumber, poDate]);

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

  const pickProduct = (idx: number, p: Product) => {
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      rate: Number(p.mrp),
      gst_percent: Number(p.gst_pct),
      qty: items[idx].qty || 1,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);
  };

  const focusCell = (row: number, col: Col) => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`
    );
    el?.focus();
    el?.select();
  };

  const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
    if (supplierOpen && supplierResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSupplierHighlight((p) => Math.min(p + 1, supplierResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSupplierHighlight((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const s = supplierResults[supplierHighlight];
        if (s) { setSupplierId(s.id); setSupplierQuery(s.name); setSupplierOpen(false); setTimeout(() => focusCell(0, "part"), 10); }
        return;
      }
      if (e.key === "Escape") { setSupplierOpen(false); return; }
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      focusCell(0, "part");
    }
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    if (searchIdx === idx && searchResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight((p) => Math.min(p + 1, searchResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); const s = searchResults[searchHighlight]; if (s) pickProduct(idx, s); return; }
      if (e.key === "Escape") { setSearchIdx(null); setSearchResults([]); return; }
    }
    const ci = COLS.indexOf(col);
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (ci < COLS.length - 1) focusCell(idx, COLS[ci + 1]);
      else { if (idx === items.length - 1) addRow(); setTimeout(() => focusCell(idx + 1, "part"), 10); }
    } else if (e.key === "ArrowDown") { e.preventDefault(); focusCell(Math.min(items.length - 1, idx + 1), col); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(Math.max(0, idx - 1), col); }
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
        items: validItems(),
      });
      poIdRef.current = saved.id;
      setSavedPO(saved);
      setCurrentStatus(saved.status);
      setEditMode(true);
      if (!poNumber) setPONumber(saved.po_number);

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
      setCurrentStatus("approved");
      toast.success("Purchase Order approved");
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

  return (
    <div className="po-entry max-w-[1400px] mx-auto text-[13px] font-mono space-y-0">
      {/* ── Top action bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
            {editMode ? "Edit Purchase Order" : "New Purchase Order"}
          </span>
          {poNumber && (
            <Badge variant="outline" className="text-[10px]">#{poNumber}</Badge>
          )}
          {editMode && (
            <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[currentStatus]}`}>
              {currentStatus.replace(/_/g, " ")}
            </Badge>
          )}
          {dupSet.size > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]">
              <AlertCircle className="h-3 w-3 mr-1" />Duplicate items
            </Badge>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="ghost" onClick={downloadPOImportTemplate} className="h-8 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-8 text-xs">
            <Upload className="h-3.5 w-3.5 mr-1" />Import XLS
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} className="h-8 text-xs">
            <FileDown className="h-3.5 w-3.5 mr-1" />Export XLS
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSave("draft")} disabled={saving} className="h-8 text-xs" title="Ctrl+S">
            <Save className="h-3.5 w-3.5 mr-1" />Save Draft
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSave("pending_approval")} disabled={saving} className="h-8 text-xs" title="Ctrl+Enter">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Submit
          </Button>
          {editMode && currentStatus === "pending_approval" && (
            <Button size="sm" onClick={handleApprove} disabled={saving} className="h-8 text-xs gradient-primary text-white border-0">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />Approve
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => navigate("/purchase/orders")} className="h-8 text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" />Cancel
          </Button>
        </div>
      </div>

      {/* ── PO Sheet ────────────────────────────────────────────────────── */}
      <div className="border border-border bg-[hsl(var(--invoice-bg,60_30%_96%))] shadow-soft">

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
          <div className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-1.5 px-3 py-3 border-b border-border text-[12px]">

            {/* PO Number */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center">PO Number</div>
            <div className="col-span-1 md:col-span-4">
              <Input
                value={poNumber}
                onChange={(e) => setPONumber(e.target.value)}
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>

            {/* Date */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center md:text-right">PO Date</div>
            <div className="col-span-1 md:col-span-4">
              <Input
                type="date"
                value={poDate}
                onChange={(e) => setPODate(e.target.value)}
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>

            {/* Supplier */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center">Supplier</div>
            <div className="col-span-1 md:col-span-10 relative">
              <Input
                ref={supplierInputRef}
                value={supplierQuery}
                onChange={(e) => {
                  setSupplierQuery(e.target.value);
                  setSupplierOpen(true);
                  setSupplierHighlight(0);
                  // clear selection if typed value doesn't match
                  const match = suppliers.find((s) => s.name.toLowerCase() === e.target.value.trim().toLowerCase());
                  if (match) setSupplierId(match.id);
                  else setSupplierId("");
                }}
                onFocus={() => { setSupplierOpen(true); setSupplierHighlight(0); }}
                onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                onKeyDown={handleSupplierKeyDown}
                placeholder="Type to search supplier…"
                className="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
              {supplierOpen && supplierResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto">
                  {supplierResults.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setSupplierId(s.id); setSupplierQuery(s.name); setSupplierOpen(false); }}
                      className={`w-full text-left px-2 py-1.5 text-[12px] border-b border-border last:border-0 flex items-center justify-between gap-2 ${supplierHighlight === i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <span className="font-semibold">{s.name}</span>
                      {s.gst && (
                        <span className={`text-[10px] ${supplierHighlight === i ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          GST: {s.gst}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Supplier info row */}
            {supplier && (
              <>
                <div className="col-span-1 md:col-span-2 text-muted-foreground self-center">Address</div>
                <div className="col-span-1 md:col-span-10 truncate italic text-[12px]">
                  {supplier.billing_address || supplier.address || "—"}
                </div>
              </>
            )}

            {/* Warehouse (placeholder) */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center">Warehouse</div>
            <div className="col-span-1 md:col-span-4">
              <Input
                placeholder="Default warehouse"
                disabled
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 opacity-50 cursor-not-allowed"
              />
            </div>

            {/* Expected Delivery */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center md:text-right">Expected Delivery</div>
            <div className="col-span-1 md:col-span-4">
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>

            {/* Remarks */}
            <div className="col-span-1 md:col-span-2 text-muted-foreground self-center">Remarks</div>
            <div className="col-span-1 md:col-span-10">
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes or reference…"
                className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
          </div>
        )}

        {/* ── Line items table ─────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="text-left px-1.5 py-1.5 w-7">#</th>
                <th className="text-left px-1.5 py-1.5 min-w-[120px]">Part No.</th>
                <th className="text-left px-1.5 py-1.5 min-w-[180px]">Description</th>
                <th className="text-right px-1.5 py-1.5 w-20">Qty</th>
                <th className="text-right px-1.5 py-1.5 w-24">Rate (₹)</th>
                <th className="text-right px-1.5 py-1.5 w-16">Disc %</th>
                <th className="text-right px-1.5 py-1.5 w-16">GST %</th>
                <th className="text-right px-1.5 py-1.5 w-24">Taxable</th>
                <th className="text-right px-1.5 py-1.5 w-20">Tax</th>
                <th className="text-right px-1.5 py-1.5 w-24">Total (₹)</th>
                <th className="w-7"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const isDup = it.part_number.trim() && dupSet.has(it.part_number.trim().toLowerCase());
                return (
                  <tr
                    key={idx}
                    className={`border-b border-border/60 hover:bg-muted/30 ${isDup ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>

                    {/* Part Number with autocomplete */}
                    <td className="px-0.5 py-0.5 relative">
                      <Input
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

                    {/* Description */}
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="desc"
                        value={it.description}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "desc")}
                        className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                        placeholder="Description"
                      />
                    </td>

                    {/* Qty */}
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="qty"
                        type="number"
                        step="any"
                        value={it.qty || ""}
                        onChange={(e) => updateRow(idx, { qty: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "qty")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>

                    {/* Rate */}
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="rate"
                        type="number"
                        step="any"
                        value={it.rate || ""}
                        onChange={(e) => updateRow(idx, { rate: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "rate")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>

                    {/* Discount % */}
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="disc"
                        type="number"
                        step="any"
                        value={it.discount_percent || ""}
                        onChange={(e) => updateRow(idx, { discount_percent: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "disc")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>

                    {/* GST % */}
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="gst"
                        type="number"
                        step="any"
                        value={it.gst_percent || ""}
                        onChange={(e) => updateRow(idx, { gst_percent: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "gst")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>

                    {/* Computed cols */}
                    <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.taxable_amount)}</td>
                    <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.tax_amount)}</td>
                    <td className="px-1.5 py-0.5 text-right tabular-nums font-semibold">{fmt(it.total_amount)}</td>

                    {/* Delete */}
                    <td className="px-0.5 py-0.5">
                      <button
                        onClick={() => delRow(idx)}
                        className="text-destructive/60 hover:text-destructive transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Spacer rows */}
              {Array.from({ length: Math.max(0, 3 - (items.length % 3)) }).map((_, i) => (
                <tr key={`sp-${i}`} className="border-b border-border/30 h-6">
                  <td colSpan={11}>&nbsp;</td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td colSpan={3} className="px-1.5 py-1.5">
                  <div className="flex items-center gap-4 font-sans">
                    <button
                      onClick={addRow}
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                      title="Alt+N"
                    >
                      <Plus className="h-3 w-3" /> Add Row
                    </button>
                    <button
                      onClick={() => setImportOpen(true)}
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Upload className="h-3 w-3" /> Import XLS
                    </button>
                    <button
                      onClick={downloadPOImportTemplate}
                      className="text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-1"
                    >
                      <FileSpreadsheet className="h-3 w-3" /> Template
                    </button>
                  </div>
                </td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.total_qty)} Qty</td>
                <td colSpan={3}></td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable)}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.tax_total)}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.grand_total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer: remarks + totals ────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-3 py-3 border-t border-border">

          {/* Left: narration / terms */}
          <div className="md:col-span-7 space-y-2">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-sans">
                Additional Remarks
              </p>
              <Input
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
            <div className="border border-border bg-card/60">
              <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border font-sans">
                PO Totals
              </div>
              <div className="px-2 py-2 text-[12px] space-y-0.5">
                <TotalRow label="Subtotal (Gross)" value={fmt(totals.subtotal)} />
                <TotalRow label="Discount" value={`− ${fmt(totals.discount_total)}`} />
                <TotalRow label="Taxable Amount" value={fmt(totals.taxable)} bold />
                <TotalRow label="CGST" value={fmt(cgst)} />
                <TotalRow label="SGST" value={fmt(sgst)} />
                <TotalRow label="Round Off" value={(roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff))} />
                <div className="border-t border-border mt-1.5 pt-2 flex items-baseline justify-between bg-primary/10 px-2 py-1 rounded">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-foreground font-sans">
                    Grand Total
                  </span>
                  <span className="font-extrabold text-lg text-primary tabular-nums">
                    ₹{fmt(finalTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons (duplicated below totals for quick access) */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave("draft")}
                disabled={saving}
                className="flex-1 min-w-[100px]"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />Save Draft
              </Button>
              <Button
                size="sm"
                onClick={() => handleSave("pending_approval")}
                disabled={saving}
                className="flex-1 min-w-[100px] gradient-primary text-white border-0"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Submit
              </Button>
              {editMode && currentStatus === "pending_approval" && (
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={saving}
                  className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Approve
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/purchase/orders")}
                className="flex-1 min-w-[100px] text-muted-foreground"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>

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
        :root { --invoice-bg: 60 30% 96%; }
        .dark { --invoice-bg: 240 8% 12%; }
      `}</style>
    </div>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────
const TotalRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
  </div>
);
