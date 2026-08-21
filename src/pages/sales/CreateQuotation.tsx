import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2, Plus, Trash2, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchParties, Party, fetchPartyOutstandingBalances, resolvePartyOutstanding } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { computeItem, computeTotals, OrderItem } from "@/lib/orders";
import {
  fetchProductUnits, fetchUnits, salesUnitOf,
  type ProductUnit, type Unit as MeasureUnit,
} from "@/lib/units";
import {
  nextQuotationNumber, saveQuotation, fetchQuotationById, fetchQuotationItems,
  convertQuotationToOrder, type QuotationStatus,
} from "@/lib/quotations";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import { useOutputCenterShortcut } from "@/hooks/useOutputCenterShortcut";
import { DocumentOutputCenter, type DocumentOutputCenterHandle } from "@/components/documentEngine/DocumentOutputCenter";
import { buildQuotationUdm } from "@/lib/documentUdm/quotationUdm";

/** Extended row that also carries HSN/Rack for the Tally-style UI (not persisted — mirrors CreateOrder.tsx's Row). */
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

const CreateQuotation = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const editId = routeParams.id || params.get("id");
  const printOnLoad = params.get("print") === "1";
  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState<QuotationStatus>("draft");
  const baseTitle = printOnLoad ? "Quotation" : "Quotation Entry — RD Pro";

  const [parties, setParties] = useState<Party[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Map<string, number>>(new Map());
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");

  const [quotationNumber, setQuotationNumber] = useState("");
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [refNo, setRefNo] = useState("");
  const [salesman, setSalesman] = useState("");
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<Row[]>(Array.from({ length: 6 }, blankRow));
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(editId);
  const draftIdRef = useRef<string | null>(editId);

  // product autocomplete
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchCol, setSearchCol] = useState<Col>("part");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const partyInputRef = useRef<HTMLInputElement>(null);
  const outputCenterRef = useRef<DocumentOutputCenterHandle>(null);
  const { focusCell, handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const day = useMemo(
    () => new Date(quotationDate).toLocaleDateString("en-IN", { weekday: "long" }),
    [quotationDate],
  );

  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    // Once the typed text exactly matches the already-resolved party, show
    // no candidates — mirrors the original page's explicit
    // `setPartyOpen(false)` on an exact match (DocumentEntitySearchField
    // owns its own open state, so an empty result list is how this page
    // asks it to close instead).
    if (party && party.name.trim().toLowerCase() === q) return [];
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery, party]);

  const checkExactPartyMatch = (query: string, currentParties: Party[]) => {
    const cleanQuery = query.trim().toLowerCase();
    const exactMatch = currentParties.find((p) => p.name.trim().toLowerCase() === cleanQuery);
    if (exactMatch) {
      setPartyId(exactMatch.id);
    } else if (party && party.name.trim().toLowerCase() !== cleanQuery) {
      setPartyId("");
    }
  };

  useEffect(() => {
    if (!editId) {
      setTimeout(() => partyInputRef.current?.focus(), 100);
    }
  }, [editId]);

  useEffect(() => {
    if (searchIdx !== null && searchResults.length > 0) {
      const activeEl = document.getElementById(`prod-item-${highlightedIndex}`);
      activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedIndex, searchIdx, searchResults]);

  useEffect(() => { document.title = baseTitle; }, [baseTitle]);

  useEffect(() => {
    const onBefore = () => { document.title = "Quotation"; };
    const onAfter = () => { document.title = baseTitle; };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [baseTitle]);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id, "customer")
      .then((data) => {
        setParties(data);
        if (partyQuery) checkExactPartyMatch(partyQuery, data);
      })
      .catch((e) => toast.error(e.message));
    // Single source of truth for the "Current Balance" line — see
    // fetchPartyOutstandingBalances() / rdpro_party_outstanding_balance_ghost_data memory.
    fetchPartyOutstandingBalances(user.id).then(setLedgerBalances).catch(() => {});

    if (!editId) {
      const biz = business?.id ?? getActiveBusinessIdSync();
      if (biz) nextQuotationNumber(biz).then(setQuotationNumber).catch(() => {});
      setEditMode(false);
    } else {
      (async () => {
        try {
          const q = await fetchQuotationById(editId);
          const its = await fetchQuotationItems(editId);
          setQuotationNumber(q.quotation_number);
          setQuotationDate(q.quotation_date);
          setValidUntil(q.valid_until || "");
          setPartyId(q.party_id || "");
          setSalesman(q.salesman || "");
          setNarration(q.remarks || "");
          setRefNo(q.reference_no || "");
          setEditMode(true);
          setEditStatus(q.status);
          setDraftId(q.id);
          draftIdRef.current = q.id;
          const rows: Row[] = its.length
            ? its.map((it) => ({ ...computeItem(it), hsn: "", rack: "" }))
            : Array.from({ length: 6 }, blankRow);
          setItems(rows);
          if (printOnLoad) setTimeout(() => outputCenterRef.current?.directPrint(), 600);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    }
  }, [user, editId, business?.id]);

  useEffect(() => {
    if (!party) return;
    const def = Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) => rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: def } : r)));
    setPartyQuery(party.name);
  }, [partyId]);

  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8)
        .then((results) => { setSearchResults(results); setHighlightedIndex(0); })
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
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const computed = computeItem(merged);
      return { ...computed, hsn: merged.hsn, rack: merged.rack } as Row;
    }));
  };

  const addRow = () => setItems((r) => [...r, blankRow()]);
  const delRow = (idx: number) => setItems((r) => (r.length <= 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));

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
    const def = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;
    const qty = items[idx].qty || 1;
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      vehicle_model: p.vehicle_model,
      mrp: Number(p.mrp),
      gst_pct: Number(p.gst_pct),
      hsn: p.hsn_code || "",
      discount_pct: items[idx].discount_pct || def,
      qty,
      unit_id: null,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);

    const pu = await loadProductUnits(p.id);
    if (pu.length) {
      const defaultUnit = salesUnitOf(pu);
      if (defaultUnit) updateRow(idx, { unit_id: defaultUnit.unit_id });
    }
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    if (searchIdx === idx && searchResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((prev) => Math.max(prev - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const selected = searchResults[highlightedIndex];
        if (selected) pickProduct(idx, selected);
        return;
      }
      if (e.key === "Escape") { setSearchIdx(null); setSearchResults([]); return; }
    }
    handleGridKey(e, idx, col, { rowCount: items.length, onAddRow: addRow });
  };

  const validRows = () => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  const isConverted = editMode && editStatus === "converted";

  const handleSave = async (status: "draft" | "sent" = "draft") => {
    if (!user || saving || isConverted) return;
    const valid = validRows();
    if (status === "sent" && (!partyId || !valid.length)) {
      toast.error("Select party and add at least one item");
      return;
    }
    // A draft save (manual "Save Draft"/Ctrl+S, or the 30s autosave) must
    // never downgrade a quotation that's already moved past draft — mirrors
    // the same guard CreateOrder.tsx has for order status.
    const statusToSave: QuotationStatus =
      status === "draft" && editMode && editStatus !== "draft" ? editStatus : status;
    try {
      setSaving(true);
      const saved = await saveQuotation({
        userId: user.id,
        id: draftIdRef.current || undefined,
        quotation_date: quotationDate,
        valid_until: validUntil || null,
        party_id: partyId || "",
        party_name: party?.name ?? "",
        party_snapshot: party ?? null,
        billing_address: party?.billing_address ?? party?.address ?? null,
        shipping_address: party?.shipping_address ?? party?.address ?? null,
        reference_no: refNo || null,
        salesman,
        remarks: narration,
        status: statusToSave,
        items: valid,
      });

      setDraftId(saved.id);
      draftIdRef.current = saved.id;
      if (saved.quotation_number) setQuotationNumber(saved.quotation_number);
      setEditStatus(statusToSave);

      if (status === "sent") {
        toast.success("Quotation sent");
        navigate(`/sales/quotations?highlight=${saved.id}`);
      } else {
        toast.success(statusToSave === "draft" ? "Draft saved" : "Saved", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async () => {
    if (!draftIdRef.current || !user || converting) return;
    setConverting(true);
    try {
      const order = await convertQuotationToOrder(draftIdRef.current, user.id);
      toast.success(`Converted to Order ${order.order_number}`);
      navigate(`/orders/edit/${order.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to convert quotation");
    } finally {
      setConverting(false);
    }
  };

  useOutputCenterShortcut(
    {
      onNewDocument: () => navigate("/sales/quotations/new"),
      onSaveDraft: () => handleSave("draft"),
      onSubmit: () => handleSave("sent"),
      onAddRow: addRow,
      onPreview: () => outputCenterRef.current?.preview(),
      onDirectPrint: () => outputCenterRef.current?.directPrint(),
      onOpenMenu: () => outputCenterRef.current?.openMenu(),
    },
    [items, partyId, user, quotationNumber, quotationDate, salesman, narration, refNo, party, saving],
  );

  const lastSavedAt = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const valid = validRows();
      if (!user || !valid.length || saving || isConverted) return;
      if (Date.now() - lastSavedAt.current < 25000) return;
      lastSavedAt.current = Date.now();
      handleSave("draft");
    }, 30000);
    return () => clearInterval(id);
  }, [items, partyId, user, isConverted]);

  const dupSet = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => {
      const k = r.part_number.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [items]);

  const rdBreakdown = useMemo(() => {
    if (!party || party.discount_type !== "RD") return null;
    const sys = Number(party.default_discount || 0);
    const agreed = Number(party.agreed_discount || 0);
    const rdExtra = Math.max(agreed - sys, 0);
    return { sys, agreed, rdExtra, effective: agreed };
  }, [party]);

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: editMode && editStatus === "draft" ? "Update Draft" : "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: () => handleSave("draft"), disabled: saving || isConverted },
    { key: "submit", label: "Confirm Quotation", icon: FileCheck2, shortcut: "Ctrl+Enter", onClick: () => handleSave("sent"), disabled: saving || isConverted, variant: "primary" },
    { key: "convert", label: converting ? "Converting…" : "Convert to Order", icon: ArrowRightCircle, onClick: handleConvert, disabled: converting, hidden: !(editMode && !isConverted) },
  ];
  const businessIdForPrint = business?.id ?? getActiveBusinessIdSync();

  return (
    <DocumentRoot type="quotation" printMode="multiCopy">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? (editStatus === "draft" ? "Editing Draft Quotation" : `Editing Quotation (${editStatus})`) : "New Quotation"}
            </span>
            {draftId && <Badge variant="outline" className="text-[10px]">#{quotationNumber || draftId.slice(0, 8)}</Badge>}
            {editMode && editStatus === "draft" && <DocumentStatusBadge status="draft" />}
            {isConverted && <DocumentStatusBadge status="converted" label="Converted to Order" />}
            {dupSet.size > 0 && <DocumentStatusBadge status="duplicate_items" tone="warning" label="Duplicate items" />}
          </>
        }
        actions={toolbarActions}
      />
      <div className="print:hidden flex justify-end -mt-2 mb-2">
        <DocumentOutputCenter
          ref={outputCenterRef}
          documentTypeId="quotation"
          documentId={draftId ?? undefined}
          documentNumber={quotationNumber}
          disabled={!businessIdForPrint}
          getUdm={() => buildQuotationUdm({
            businessId: businessIdForPrint!,
            quotationNumber,
            quotationDate,
            validUntil,
            refNo,
            status: editStatus,
            party,
            items: validRows(),
            unitLabel: (id) => unitLabel(id ?? ""),
          })}
        />
      </div>

      <DocumentSheet>
        <DocumentSheetBanner left="Quotation" center={business?.business_name ?? business?.firm_name ?? ""} right={day} />

        <DocumentHeaderGrid>
          <DocumentHeaderInputField label="Quotation No" value={quotationNumber} onChange={(e) => setQuotationNumber(e.target.value)} />
          <DocumentHeaderInputField label="Date" labelAlign="right" type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />

          <DocumentHeaderInputField label="Ref No" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          <DocumentHeaderInputField label="Valid Until" labelAlign="right" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />

          <DocumentHeaderInputField label="Salesman" value={salesman} onChange={(e) => setSalesman(e.target.value)} />
          <DocumentHeaderValue span={6}>{null}</DocumentHeaderValue>

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
                ₹{fmt(Math.abs(resolvePartyOutstanding(party, ledgerBalances)))}{" "}
                <span className="text-muted-foreground not-italic">
                  {resolvePartyOutstanding(party, ledgerBalances) < 0 ? "Cr" : "Dr"}
                </span>
              </DocumentHeaderValue>
              <DocumentHeaderLabel align="right">GSTIN</DocumentHeaderLabel>
              <DocumentHeaderValue>{party.gst || "—"}</DocumentHeaderValue>

              <DocumentHeaderLabel>Address</DocumentHeaderLabel>
              <DocumentHeaderValue span={10} className="truncate">{party.billing_address || party.address || "—"}</DocumentHeaderValue>

              <DocumentHeaderValue span={12} className="flex flex-wrap gap-1.5 pt-1 font-sans">
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-[10px] h-5">{party.discount_type} Mode</Badge>
                <Badge variant="outline" className="text-[10px] h-5">Default {Number(party.default_discount).toFixed(1)}%</Badge>
                {party.discount_type === "RD" && (
                  <Badge variant="outline" className="text-[10px] h-5">Agreed {Number(party.agreed_discount).toFixed(1)}%</Badge>
                )}
                {party.phone && <Badge variant="outline" className="text-[10px] h-5">📱 {party.phone}</Badge>}
                {party.beat && <Badge variant="outline" className="text-[10px] h-5">Beat: {party.beat}</Badge>}
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
                    setSearchIdx(idx); setSearchCol("part"); setSearchTerm(e.target.value); setHighlightedIndex(0);
                  }}
                  onFocus={() => { setSearchIdx(idx); setSearchCol("part"); setSearchTerm(it.part_number); setHighlightedIndex(0); }}
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
                          key={p.id} id={`prod-item-${i}`} type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickProduct(idx, p); }}
                          className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${
                            isHighlighted ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{p.part_number}</span>
                            <span className={`text-[10px] ${isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Stk {p.stock}</span>
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
                <DocumentGridCellInput
                  data-row={idx} data-col="hsn" value={it.hsn || ""} readOnly disabled
                  title={it.product_id && !it.hsn ? "This product has no HSN linked in Product Master" : "Auto-filled from the product's HSN"}
                  className={
                    it.product_id && !it.hsn
                      ? "h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 cursor-default"
                      : "h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent text-muted-foreground cursor-default"
                  }
                />
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
                <DocumentGridCellInput align="right" data-row={idx} data-col="qty" type="number" step="any" value={it.qty || ""} onChange={(e) => updateRow(idx, { qty: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "qty")} />
              </td>
              <td className="px-0.5 py-0.5">
                {it.product_id && unitsByProduct[it.product_id]?.length ? (
                  <select
                    value={it.unit_id ?? ""}
                    onChange={(e) => updateRow(idx, { unit_id: e.target.value || null })}
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
              <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.mrp)}</td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="disc" type="number" step="any" value={it.discount_pct || ""} onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })}
                  onKeyDown={(e) => handleKey(e, idx, "disc")} />
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums">{fmt(it.net_rate)}</td>
              <td className="px-1 py-0.5 text-right tabular-nums font-semibold">{fmt(it.total)}</td>
              <td className="px-0.5 py-0.5 print:hidden">
                <button onClick={() => delRow(idx)} className="text-destructive/70 hover:text-destructive" title="Delete row">
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </>
          )}
          renderFooter={
            <>
              <td colSpan={6} className="px-1.5 py-1 print:hidden">
                <button onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-sans" title="Shortcut: Alt + N">
                  <Plus className="h-3 w-3" /> Add Row (Alt+N)
                </button>
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totalQty)} Qty</td>
              <td colSpan={5}></td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable + totals.gst_total)}</td>
              <td className="print:hidden"></td>
            </>
          }
        />

        {/* Bottom section: narration + totals */}
        <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
          <div className="col-span-12 md:col-span-7 space-y-2 print:hidden">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Narration</div>
              <Input value={narration} onChange={(e) => setNarration(e.target.value)}
                className="h-7 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary" />
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
                <div className="text-right tabular-nums font-semibold border-t border-border pt-0.5">{rdBreakdown.effective.toFixed(2)}%</div>
              </div>
            )}
          </div>

          <div className="col-span-12 md:col-span-5 print:col-span-12">
            <DocumentTotals
              title="Quotation Totals"
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
      </DocumentSheet>
    </DocumentRoot>
  );
};

export default CreateQuotation;
