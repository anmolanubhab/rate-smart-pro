import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2, Printer, FileDown, Plus, Trash2, Upload, FileSpreadsheet } from "lucide-react";
import OrderExcelUpload from "@/components/OrderExcelUpload";
import { downloadOrderTemplate } from "@/lib/excelTemplates";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchParties, Party } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { fetchActiveWarehouses, resolveDefaultWarehouseId, type Warehouse } from "@/lib/warehouses";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import {
  computeItem,
  computeTotals,
  nextOrderNumber,
  saveOrder,
  OrderItem,
  OrderStatus,
  fetchOrder,
  fetchOrderItems,
} from "@/lib/orders";
import {
  fetchProductUnits, fetchUnits, salesUnitOf, toStockQty,
  type ProductUnit, type Unit as MeasureUnit,
} from "@/lib/units";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridPrintTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { DocumentImportExportButtons } from "@/components/documentEngine/DocumentImportExportButtons";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import { useDocumentShortcuts } from "@/hooks/useDocumentShortcuts";

/** Extended row that also carries HSN/Rack for the Tally-style UI (not persisted). */
type Row = OrderItem & { hsn?: string; rack?: string };

const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "",
  rack: "",
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLS = ["part", "desc", "hsn", "gst", "rack", "qty", "mrp", "disc"] as const;
type Col = (typeof COLS)[number];

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[120px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[180px]" },
  { key: "hsn", header: "HSN/SAC", widthClass: "w-20" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-14" },
  { key: "rack", header: "Rack", widthClass: "w-14" },
  { key: "qty", header: "Quantity", align: "right", widthClass: "w-16" },
  { key: "unit", header: "Unit", widthClass: "w-14" },
  { key: "mrp", header: "MRP", align: "right", widthClass: "w-20" },
  { key: "rate", header: "Rate", align: "right", widthClass: "w-20" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-14" },
  { key: "net_rate", header: "Net Rate", align: "right", widthClass: "w-20" },
  { key: "amount", header: "Amount", align: "right", widthClass: "w-24" },
];

const PRINT_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "w-48" },
  { key: "desc", header: "Description", widthClass: "w-[40%]" },
  { key: "qty", header: "Quantity", align: "right", widthClass: "w-16" },
  { key: "rack", header: "Rack", widthClass: "w-14" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-14" },
  { key: "mrp", header: "MRP", align: "right", widthClass: "w-20" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-14" },
  { key: "net_rate", header: "Net Rate", align: "right", widthClass: "w-20" },
  { key: "amount", header: "Amount", align: "right", widthClass: "w-24" },
];

const CreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const editId = routeParams.id || params.get("id");
  const printOnLoad = params.get("print") === "1";
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState<OrderStatus>("draft");
  const baseTitle = printOnLoad ? "Order" : "Invoice Entry — Spare Parts OMS";

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");

  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState("");
  const [voucherType] = useState("TVS Tax Invoice");
  const [salesman, setSalesman] = useState("");
  const [narration, setNarration] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [items, setItems] = useState<Row[]>(Array.from({ length: 6 }, blankRow));
  const [saving, setSaving] = useState(false);

  // FIXED: Mutating ref to always catch exact id inside Async intervals instantly
  const [draftId, setDraftId] = useState<string | null>(editId);
  const draftIdRef = useRef<string | null>(editId);

  // product autocomplete
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchCol, setSearchCol] = useState<Col>("part");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Autofocus input ref
  const partyInputRef = useRef<HTMLInputElement>(null);
  const { focusCell, handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const day = useMemo(
    () => new Date(orderDate).toLocaleDateString("en-IN", { weekday: "long" }),
    [orderDate],
  );

  // Filtered party list based on input query
  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    if (party && party.name.trim().toLowerCase() === q) return [];
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery, party]);

  // Exact Match Verification Logic
  const checkExactPartyMatch = (query: string, currentParties: Party[]) => {
    const cleanQuery = query.trim().toLowerCase();
    const exactMatch = currentParties.find((p) => p.name.trim().toLowerCase() === cleanQuery);
    if (exactMatch) {
      setPartyId(exactMatch.id);
    } else {
      if (party && party.name.trim().toLowerCase() !== cleanQuery) {
        setPartyId("");
      }
    }
  };

  // Focus party input field on mount (Create Mode only)
  useEffect(() => {
    if (!editId) {
      setTimeout(() => {
        partyInputRef.current?.focus();
      }, 100);
    }
  }, [editId]);

  // Dynamic Auto-Scroll handler for keyboard navigation inside dropdown list
  useEffect(() => {
    if (searchIdx !== null && searchResults.length > 0) {
      const activeEl = document.getElementById(`prod-item-${highlightedIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [highlightedIndex, searchIdx, searchResults]);

  useEffect(() => {
    document.title = baseTitle;
  }, [baseTitle]);

  useEffect(() => {
    const onBefore = () => {
      document.title = "Order";
    };
    const onAfter = () => {
      document.title = baseTitle;
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [baseTitle]);

  useEffect(() => {
    if (!user) return;
    const biz = getActiveBusinessIdSync();
    if (!biz) return;
    fetchActiveWarehouses(biz)
      .then((list) => {
        setWarehouses(list);
        // Functional update: if edit-mode's own effect already set an explicit
        // warehouse_id from the loaded order, keep it — only fall back to the
        // business default when nothing's been set yet.
        setWarehouseId((prev) => prev ?? resolveDefaultWarehouseId(list));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id, "customer")
      .then((data) => {
        setParties(data);
        if (partyQuery) checkExactPartyMatch(partyQuery, data);
      })
      .catch((e) => toast.error(e.message));

    if (!editId) {
      nextOrderNumber(user.id).then(setOrderNumber).catch(() => {});
      setEditMode(false);
    } else {
      (async () => {
        try {
          const o = await fetchOrder(editId);
          const its = await fetchOrderItems(editId);
          setOrderNumber(o.order_number);
          setOrderDate(o.order_date);
          setPartyId(o.party_id || "");
          setSalesman(o.salesman || "");
          setWarehouseId(o.warehouse_id ?? null);
          setNarration(o.notes || "");
          setRefNo((o.remarks || "").replace(/^Ref:\s*/i, ""));
          setEditMode(true);
          setEditStatus(o.status);
          setDraftId(o.id);
          draftIdRef.current = o.id;
          const rows: Row[] = its.length
            ? its.map((it) => ({ ...computeItem(it), hsn: "", rack: "" }))
            : Array.from({ length: 6 }, blankRow);
          setItems(rows);
          if (printOnLoad) setTimeout(() => window.print(), 600);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    }
  }, [user, editId]);

  // apply default discount when party changes
  useEffect(() => {
    if (!party) return;
    const def =
      Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) =>
      rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: def } : r)),
    );
    setPartyQuery(party.name);
  }, [partyId]);

  // product search
  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8)
        .then((results) => {
          setSearchResults(results);
          setHighlightedIndex(0);
        })
        .catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [searchTerm, searchIdx, user]);

  const totals = useMemo(() => computeTotals(items, 0), [items]);
  const cgst = +(totals.gst_total / 2).toFixed(2);
  const sgst = +(totals.gst_total / 2).toFixed(2);
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2);
  const finalTotal = Math.round(totals.grand_total);
  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setItems((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const merged = { ...r, ...patch };
        const computed = computeItem(merged);
        return { ...computed, hsn: merged.hsn, rack: merged.rack } as Row;
      }),
    );
  };

  const addRow = () => setItems((r) => [...r, blankRow()]);
  const delRow = (idx: number) =>
    setItems((r) => (r.length <= 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));

  // Layer C3: per-product unit options, cached by product_id to avoid N+1 fetches
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [allUnits, setAllUnits] = useState<MeasureUnit[]>([]);
  useEffect(() => { fetchUnits().then(setAllUnits).catch(() => {}); }, []);
  const unitLabel = (unitId: string) => allUnits.find((u) => u.id === unitId)?.symbol ?? "";
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

  const pickProduct = async (idx: number, p: Product) => {
    const def = party
      ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0
      : 0;
    const qty = items[idx].qty || 1;
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      vehicle_model: p.vehicle_model,
      mrp: Number(p.mrp),
      gst_pct: Number(p.gst_pct),
      discount_pct: items[idx].discount_pct || def,
      qty,
      unit_id: null,
      stock_qty: null,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);

    // Default to this product's configured Sales Unit, if any
    const pu = await loadProductUnits(p.id);
    if (pu.length) {
      const defaultUnit = salesUnitOf(pu);
      if (defaultUnit) {
        updateRow(idx, {
          unit_id: defaultUnit.unit_id,
          stock_qty: toStockQty(qty, defaultUnit.unit_id, pu),
        });
      }
    }
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    // PRODUCT DROPDOWN INTERACTION
    if (searchIdx === idx && searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selected = searchResults[highlightedIndex];
        if (selected) {
          pickProduct(idx, selected);
        }
        return;
      }
      if (e.key === "Escape") {
        setSearchIdx(null);
        setSearchResults([]);
        return;
      }
    }
    handleGridKey(e, idx, col, { rowCount: items.length, onAddRow: addRow });
  };

  const validRows = () =>
    items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  // FIXED: Synchronized handleSave to safely prevent duplicates on immediate subsequent triggers
  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user || saving) return;
    const valid = validRows();
    if (status === "pending" && (!partyId || !valid.length)) {
      toast.error("Select party and add at least one item");
      return;
    }
    // A "draft" save (manual "Save Draft"/Ctrl+S, or the 30s autosave) must
    // never downgrade an order that has already moved past draft — e.g.
    // approved, partial, or completed — back to draft. Only ever write
    // "draft" when the order is actually still a draft (or brand new).
    const statusToSave: OrderStatus =
      status === "draft" && editMode && editStatus !== "draft" ? editStatus : status;
    try {
      setSaving(true);
      const saved = await saveOrder({
        userId: user.id,
        id: draftIdRef.current || undefined, // Ref ensures instant value availability over state cycles
        order_number: orderNumber,
        order_date: orderDate,
        party_id: partyId || null,
        party_name: party?.name ?? null,
        party_snapshot: party ?? null,
        billing_address: party?.billing_address ?? party?.address ?? null,
        shipping_address: party?.shipping_address ?? party?.address ?? null,
        salesman,
        warehouse_id: warehouseId,
        notes: narration,
        remarks: refNo ? `Ref: ${refNo}` : null,
        mode: party?.discount_type ?? null,
        status: statusToSave,
        items: valid,
      });

      // Instantly pin saved id to prevent dual inserts
      setDraftId(saved.id);
      draftIdRef.current = saved.id;
      if (saved.order_number) {
        setOrderNumber(saved.order_number);
      }
      setEditStatus(statusToSave);

      if (status === "pending") {
        toast.success("Invoice confirmed");
        navigate(`/orders?highlight=${saved.id}`);
      } else {
        toast.success(statusToSave === "draft" ? "Draft saved" : "Saved", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  useDocumentShortcuts(
    {
      onSaveDraft: () => handleSave("draft"),
      onSubmit: () => handleSave("pending"),
      onAddRow: addRow,
    },
    [items, partyId, user, orderNumber, orderDate, salesman, narration, refNo, party, saving],
  );

  // auto-save draft every 30s
  const lastSavedAt = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const valid = validRows();
      if (!user || !valid.length || saving) return;
      if (Date.now() - lastSavedAt.current < 25000) return;
      lastSavedAt.current = Date.now();
      handleSave("draft");
    }, 30000);
    return () => clearInterval(id);
  }, [items, partyId, user]);

  // duplicate detection
  const dupSet = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => {
      const k = r.part_number.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [items]);

  // RD discount breakdown (display only)
  const rdBreakdown = useMemo(() => {
    if (!party || party.discount_type !== "RD") return null;
    const sys = Number(party.default_discount || 0);
    const agreed = Number(party.agreed_discount || 0);
    const rdExtra = Math.max(agreed - sys, 0);
    return { sys, agreed, rdExtra, effective: agreed };
  }, [party]);

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: editMode && editStatus === "draft" ? "Update Draft" : "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: () => handleSave("draft"), disabled: saving },
    { key: "submit", label: "Confirm Invoice", icon: FileCheck2, shortcut: "Ctrl+✍", onClick: () => handleSave("pending"), disabled: saving, variant: "primary" },
    { key: "print", label: "Print", icon: Printer, shortcut: "Ctrl+P", onClick: () => window.print() },
    { key: "pdf", label: "PDF", icon: FileDown, onClick: () => window.print() },
  ];

  return (
    <DocumentRoot type="sales_order" printTitle="ORDER">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? (editStatus === "draft" ? "Editing Draft Invoice" : `Editing Invoice (${editStatus})`) : "New Invoice"}
            </span>
            {draftId && <Badge variant="outline" className="text-[10px]">#{orderNumber || draftId.slice(0, 8)}</Badge>}
            {editMode && editStatus === "draft" && <DocumentStatusBadge status="draft" />}
            {dupSet.size > 0 && <DocumentStatusBadge status="duplicate_items" tone="warning" label="Duplicate items" />}
          </>
        }
        actions={[
          { key: "upload", label: "Upload Excel", icon: Upload, onClick: () => setUploadOpen(true) },
          { key: "template", label: "Template", icon: FileSpreadsheet, onClick: downloadOrderTemplate, variant: "ghost" },
          ...toolbarActions,
        ]}
      />

      <OrderExcelUpload
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        userId={user?.id || ""}
        defaultDiscount={party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0}
        onImport={(imported) => {
          setItems((prev) => {
            const nonBlank = prev.filter((r) => r.part_number.trim());
            return [...nonBlank, ...imported.map((it) => ({ ...it, hsn: "", rack: "" } as Row))];
          });
        }}
      />

      <DocumentSheet>
        <DocumentSheetBanner left={voucherType} center="Viswanath Automobiles Pvt. Ltd. [TVS]" right={day} />

        <DocumentHeaderGrid>
          <DocumentHeaderInputField label="Voucher No" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          <DocumentHeaderInputField label="Date" labelAlign="right" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

          <DocumentHeaderInputField label="Order Received By" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="11299/vishal" />
          <DocumentHeaderInputField label="Salesman" labelAlign="right" value={salesman} onChange={(e) => setSalesman(e.target.value)} />

          {warehouses.length > 1 && (
            <>
              <DocumentHeaderLabel>Warehouse</DocumentHeaderLabel>
              <DocumentHeaderValue>
                <select
                  value={warehouseId ?? ""}
                  onChange={(e) => setWarehouseId(e.target.value || null)}
                  className="w-full h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                </select>
              </DocumentHeaderValue>
            </>
          )}

          <DocumentHeaderLabel span={2}>Party A/c Name</DocumentHeaderLabel>
          <DocumentHeaderValue span={10}>
            <DocumentEntitySearchField
              results={partResults}
              getKey={(p) => p.id}
              query={partyQuery}
              onQueryChange={(v) => {
                setPartyQuery(v);
                checkExactPartyMatch(v, parties);
              }}
              onSelect={(p, source) => {
                setPartyId(p.id);
                setPartyQuery(p.name);
                if (source === "keyboard") setTimeout(() => focusCell(0, "part"), 10);
              }}
              renderRow={(p, highlighted) => (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className={`text-[10px] ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {p.discount_type} · {Number(p.discount_type === "RD" ? p.agreed_discount : p.default_discount).toFixed(1)}%
                  </span>
                </div>
              )}
              placeholder="Type to search party…"
              inputRef={partyInputRef}
              inputClassName="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </DocumentHeaderValue>

          {party && (
            <>
              <DocumentHeaderLabel>Current Balance</DocumentHeaderLabel>
              <DocumentHeaderValue className="italic">
                ₹{fmt(Number(party.outstanding_balance) || 0)}{" "}
                <span className="text-muted-foreground not-italic">Dr</span>
              </DocumentHeaderValue>
              <DocumentHeaderLabel align="right">GSTIN</DocumentHeaderLabel>
              <DocumentHeaderValue>{party.gst || "—"}</DocumentHeaderValue>

              <DocumentHeaderLabel>Address</DocumentHeaderLabel>
              <DocumentHeaderValue span={10} className="truncate">{party.billing_address || party.address || "—"}</DocumentHeaderValue>

              <DocumentHeaderValue span={12} className="flex flex-wrap gap-1.5 pt-1 font-sans">
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-[10px] h-5">
                  {party.discount_type} Mode
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5">
                  Default {Number(party.default_discount).toFixed(1)}%
                </Badge>
                {party.discount_type === "RD" && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    Agreed {Number(party.agreed_discount).toFixed(1)}%
                  </Badge>
                )}
                {party.phone && (
                  <Badge variant="outline" className="text-[10px] h-5">📱 {party.phone}</Badge>
                )}
                {party.beat && (
                  <Badge variant="outline" className="text-[10px] h-5">Beat: {party.beat}</Badge>
                )}
              </DocumentHeaderValue>
            </>
          )}
        </DocumentHeaderGrid>

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
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
                    setSearchCol("part");
                    setSearchTerm(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onFocus={() => {
                    setSearchIdx(idx);
                    setSearchCol("part");
                    setSearchTerm(it.part_number);
                    setHighlightedIndex(0);
                  }}
                  onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx && searchCol === "part" ? null : s)), 150)}
                  onKeyDown={(e) => handleKey(e, idx, "part")}
                  className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary uppercase"
                />
                {searchIdx === idx && searchCol === "part" && searchResults.length > 0 && (
                  <div className="absolute z-50 left-0 mt-0.5 w-80 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto scroll-smooth">
                    {searchResults.map((p, i) => {
                      const isHighlighted = highlightedIndex === i;
                      return (
                        <button
                          key={p.id}
                          id={`prod-item-${i}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickProduct(idx, p);
                          }}
                          className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${
                            isHighlighted
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted bg-popover"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{p.part_number}</span>
                            <span className={`text-[10px] ${isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                              {Number(p.reserved_qty) > 0
                                ? `Avail ${Math.max(Number(p.stock) - Number(p.reserved_qty), 0)} (Stk ${p.stock})`
                                : `Stk ${p.stock}`}
                            </span>
                          </div>
                          <div className="text-[11px] truncate">{p.name}</div>
                          <div className={`text-[10px] ${isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            MRP ₹{fmt(Number(p.mrp))} · GST {p.gst_pct}%
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput data-row={idx} data-col="desc" value={it.description} onChange={(e) => updateRow(idx, { description: e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "desc")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput data-row={idx} data-col="hsn" value={it.hsn || ""} onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "hsn")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="gst" type="number" step="any" value={it.gst_pct || ""} onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "gst")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput data-row={idx} data-col="rack" value={it.rack || ""} onChange={(e) => updateRow(idx, { rack: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => handleKey(e, idx, "rack")} className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary uppercase" />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput
                  align="right"
                  data-row={idx}
                  data-col="qty"
                  type="number"
                  step="any"
                  value={it.qty || ""}
                  onChange={(e) => {
                    const qty = +e.target.value;
                    const pu = it.product_id ? unitsByProduct[it.product_id] : undefined;
                    updateRow(idx, {
                      qty,
                      stock_qty: pu ? toStockQty(qty, it.unit_id, pu) : null,
                    });
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
                      updateRow(idx, {
                        unit_id: e.target.value || null,
                        stock_qty: toStockQty(it.qty, e.target.value, pu),
                      });
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
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="mrp" type="number" step="any" value={it.mrp || ""} onChange={(e) => updateRow(idx, { mrp: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "mrp")} />
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">
                {fmt(it.mrp)}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="disc" type="number" step="any" value={it.discount_pct || ""} onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "disc")} />
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums">{fmt(it.net_rate)}</td>
              <td className="px-1 py-0.5 text-right tabular-nums font-semibold">
                {fmt(it.total)}
              </td>
              <td className="px-0.5 py-0.5 print:hidden">
                <button
                  onClick={() => delRow(idx)}
                  className="text-destructive/70 hover:text-destructive"
                  title="Delete row"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </>
          )}
          renderFooter={
            <>
              <td colSpan={6} className="px-1.5 py-1 print:hidden">
                <div className="flex items-center gap-3">
                  <button
                    onClick={addRow}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-sans"
                    title="Shortcut: Alt + N"
                  >
                    <Plus className="h-3 w-3" /> Add Row (Alt+N)
                  </button>
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-sans"
                  >
                    <Upload className="h-3 w-3" /> Upload Excel
                  </button>
                  <button
                    onClick={downloadOrderTemplate}
                    className="text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-1 font-sans"
                  >
                    <FileSpreadsheet className="h-3 w-3" /> Sample Template
                  </button>
                </div>
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totalQty)} Qty</td>
              <td colSpan={5}></td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable + totals.gst_total)}</td>
              <td className="print:hidden"></td>
            </>
          }
        />

        <DocumentGridPrintTable
          columns={PRINT_COLUMNS}
          rows={items}
          isEmptyRow={(it) => !it.part_number.trim() && !it.description.trim() && !Number(it.qty)}
          renderCells={(it, _idx, empty) => (
            <>
              <td className="px-1.5 py-0.5 font-mono whitespace-nowrap">{empty ? "" : it.part_number}</td>
              <td className="px-1.5 py-0.5 font-mono">{empty ? "" : it.description}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : it.qty}</td>
              <td className="px-1.5 py-0.5 font-mono">{empty ? "" : it.rack || ""}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : it.gst_pct}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : fmt(it.mrp)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : it.discount_pct}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : fmt(it.net_rate)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : fmt(it.total)}</td>
            </>
          )}
        />

        {/* Bottom section: narration + totals */}
        <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
          <div className="col-span-12 md:col-span-7 space-y-2 print:hidden">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Narration</div>
              <Input
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Discount- 18%"
                className="h-7 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
            {rdBreakdown && (
              <div className="text-[11px] grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                <div className="text-muted-foreground">System Discount</div>
                <div className="text-right tabular-nums">{rdBreakdown.sys.toFixed(2)}%</div>
                <div className="text-muted-foreground">RD (Extra)</div>
                <div className="text-right tabular-nums">{rdBreakdown.rdExtra.toFixed(2)}%</div>
                <div className="text-muted-foreground">Agreed (RD)</div>
                <div className="text-right tabular-nums">{rdBreakdown.agreed.toFixed(2)}%</div>
                <div className="font-semibold border-t border-border pt-0.5">Final Effective</div>
                <div className="text-right tabular-nums font-semibold border-t border-border pt-0.5">
                  {rdBreakdown.effective.toFixed(2)}%
                </div>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground pt-2">Provide e-Invoice details: No</div>
          </div>

          <div className="col-span-12 md:col-span-5 print:col-span-12">
            <DocumentTotals
              title="Invoice Totals"
              lines={[
                { label: "Subtotal (MRP)", value: fmt(totals.subtotal) },
                { label: "Discount", value: `− ${fmt(totals.discount_total)}` },
                { label: "Taxable Amount", value: fmt(totals.taxable), bold: true },
                { label: "CGST", value: fmt(cgst) },
                { label: "SGST", value: fmt(sgst) },
                { label: "Round Off", value: (roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff)) },
              ]}
              grandTotal={`₹${fmt(finalTotal)}`}
            />
          </div>
        </div>

        {/* Print footer */}
        <div className="hidden print:block px-3 py-4 text-[11px] border-t border-border">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="font-semibold mb-8">Terms & Conditions</div>
              <div className="text-muted-foreground">
                Goods once sold will not be taken back. E. & O.E.
              </div>
            </div>
            <div className="text-center">
              <div className="mt-12 border-t border-border pt-1">Receiver's Signature</div>
            </div>
            <div className="text-right">
              <div className="mt-12 border-t border-border pt-1">For Viswanath Automobiles Pvt. Ltd.</div>
            </div>
          </div>
        </div>
      </DocumentSheet>
    </DocumentRoot>
  );
};

export default CreateOrder;
