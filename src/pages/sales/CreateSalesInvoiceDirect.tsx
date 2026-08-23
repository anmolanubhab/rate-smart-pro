import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useInterstateFlag } from "@/hooks/useInterstateFlag";
import { splitGstAmount } from "@/lib/gstCalc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchParties, Party, fetchPartyOutstandingBalances, resolvePartyOutstanding } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { computeItem, computeTotals, OrderItem } from "@/lib/orders";
import { fetchProductUnits, fetchUnits, salesUnitOf, type ProductUnit, type Unit as MeasureUnit } from "@/lib/units";
import { createDirectSalesInvoice } from "@/lib/salesInvoices";
import { useRoundOffSettings, resolveRoundOff } from "@/lib/roundOffSettings";
import { fetchSalesConfig } from "@/lib/salesConfig";
import { isSalesModeAvailable } from "@/lib/workflowAccess";
import { canGranular } from "@/lib/permissions";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import { useOutputCenterShortcut } from "@/hooks/useOutputCenterShortcut";

// Direct Sales Invoice — Adaptive Workflow Phase 2. Party -> Invoice, no
// Quotation/Order/Picking/Dispatch. Deliberately a dedicated page (not a
// CreateOrder.tsx retrofit): the primary flow is Party -> Product -> Qty ->
// Rate -> Discount -> GST -> Round-off -> Total -> Save/Post, nothing else.
// Reuses the same DocumentEngine grid/header/totals components every other
// sales document (Quotation, Order) already uses, so it behaves and looks
// consistent, not like a second UI system.

type Row = OrderItem & { hsn?: string };

const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "",
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLS = ["part", "desc", "gst", "qty", "mrp", "disc"] as const;
type Col = (typeof COLS)[number];

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[120px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[180px]" },
  { key: "hsn", header: "HSN/SAC", widthClass: "w-20" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-14" },
  { key: "qty", header: "Quantity", align: "right", widthClass: "w-16" },
  { key: "unit", header: "Unit", widthClass: "w-14" },
  { key: "mrp", header: "MRP", align: "right", widthClass: "w-20" },
  { key: "rate", header: "Rate", align: "right", widthClass: "w-20" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-14" },
  { key: "net_rate", header: "Net Rate", align: "right", widthClass: "w-20" },
  { key: "amount", header: "Amount", align: "right", widthClass: "w-24" },
];

const CreateSalesInvoiceDirect = () => {
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const navigate = useNavigate();

  const [parties, setParties] = useState<Party[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Map<string, number>>(new Map());
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<Row[]>(Array.from({ length: 4 }, blankRow));
  const [saving, setSaving] = useState(false);

  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchCol, setSearchCol] = useState<Col>("part");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // One idempotency token per compose session. Deliberately NOT regenerated
  // on save failure/retry -- a retry after a transient error (network blip,
  // RLS hiccup) must reuse the same token so a duplicate that actually made
  // it through server-side gets detected, not silently re-created.
  const clientRequestId = useRef(crypto.randomUUID());

  const partyInputRef = useRef<HTMLInputElement>(null);
  const { focusCell, handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const day = useMemo(() => new Date(invoiceDate).toLocaleDateString("en-IN", { weekday: "long" }), [invoiceDate]);

  // Business-config + RBAC gate -- both must be satisfied, checked
  // independently (see src/lib/workflowAccess.ts). Not wired through
  // evaluateWorkflowAccess's route-guard shape yet (that's Phase 4); this
  // page checks directly since it IS the route in question.
  const [configChecked, setConfigChecked] = useState(false);
  const [directAvailable, setDirectAvailable] = useState(true);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  useEffect(() => {
    if (!business?.id) return;
    fetchSalesConfig(business.id).then((cfg) => {
      const available = isSalesModeAvailable(cfg, "direct");
      setDirectAvailable(available);
      if (!available) {
        setBlockedReason("Direct Sales Invoice isn't turned on for this business. Ask an owner/admin to enable it in Settings → Sales Configuration.");
      } else if (cfg.stock_reduction_point !== "invoice") {
        setBlockedReason("Direct Sales Invoice needs \"Stock Reduction Point\" set to \"On Invoice Posting\" in Settings → Sales Configuration -- there's no Dispatch step here for stock to reduce at otherwise.");
      } else {
        setBlockedReason(null);
      }
      setConfigChecked(true);
    }).catch((e) => { toast.error(e.message); setConfigChecked(true); });
  }, [business?.id]);
  const permitted = canGranular(role, "voucher.create", permissions);

  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    if (party && party.name.trim().toLowerCase() === q) return [];
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery, party]);

  const checkExactPartyMatch = (query: string, currentParties: Party[]) => {
    const cleanQuery = query.trim().toLowerCase();
    const exactMatch = currentParties.find((p) => p.name.trim().toLowerCase() === cleanQuery);
    if (exactMatch) setPartyId(exactMatch.id);
    else if (party && party.name.trim().toLowerCase() !== cleanQuery) setPartyId("");
  };

  useEffect(() => { setTimeout(() => partyInputRef.current?.focus(), 100); }, []);
  useEffect(() => { document.title = "New Sales Invoice — RD Pro"; }, []);

  useEffect(() => {
    if (searchIdx !== null && searchResults.length > 0) {
      document.getElementById(`prod-item-${highlightedIndex}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedIndex, searchIdx, searchResults]);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id, "customer")
      .then((data) => { setParties(data); if (partyQuery) checkExactPartyMatch(partyQuery, data); })
      .catch((e) => toast.error(e.message));
    fetchPartyOutstandingBalances(user.id).then(setLedgerBalances).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!party) return;
    const def = Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) => rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: def } : r)));
    setPartyQuery(party.name);
  }, [partyId]);

  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8).then((results) => { setSearchResults(results); setHighlightedIndex(0); }).catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [searchTerm, searchIdx, user]);

  const totals = useMemo(() => computeTotals(items, 0), [items]);
  const { isInterstate } = useInterstateFlag(business?.gst_number, party?.gst);
  const { cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst } = splitGstAmount(totals.gst_total, isInterstate);
  // Same applySalesInvoiceRoundOff() rule the server applies (src/lib/
  // salesInvoices.ts) -- preview must never disagree with what gets posted.
  const roundOffSettings = useRoundOffSettings();
  const { roundOffAmount: roundOff, finalTotal } = useMemo(
    () => resolveRoundOff(totals.grand_total, roundOffSettings, roundOffSettings.applySalesInvoice),
    [totals.grand_total, roundOffSettings]
  );
  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const computed = computeItem(merged);
      return { ...computed, hsn: merged.hsn } as Row;
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
    } catch { return []; }
  };

  const pickProduct = async (idx: number, p: Product) => {
    const def = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;
    const qty = items[idx].qty || 1;
    updateRow(idx, {
      product_id: p.id, part_number: p.part_number, description: p.name, vehicle_model: p.vehicle_model,
      mrp: Number(p.mrp), gst_pct: Number(p.gst_pct), hsn: p.hsn_code || "",
      discount_pct: items[idx].discount_pct || def, qty, unit_id: null,
    });
    setSearchIdx(null); setSearchTerm(""); setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);
    const pu = await loadProductUnits(p.id);
    if (pu.length) {
      const defaultUnit = salesUnitOf(pu);
      if (defaultUnit) updateRow(idx, { unit_id: defaultUnit.unit_id });
    }
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    if (searchIdx === idx && searchResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((p) => Math.min(p + 1, searchResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); const s = searchResults[highlightedIndex]; if (s) pickProduct(idx, s); return; }
      if (e.key === "Escape") { setSearchIdx(null); setSearchResults([]); return; }
    }
    handleGridKey(e, idx, col, { rowCount: items.length, onAddRow: addRow });
  };

  const validRows = () => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  const dupSet = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => { const k = r.part_number.trim().toLowerCase(); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [items]);

  const handleSave = async () => {
    if (!user || !business?.id || saving) return;
    if (!directAvailable || blockedReason) { toast.error(blockedReason ?? "Direct Sales Invoice isn't available."); return; }
    if (!permitted) { toast.error("You don't have permission to create Sales Invoices."); return; }
    const valid = validRows();
    if (!partyId) { toast.error("Select a party"); return; }
    if (!valid.length) { toast.error("Add at least one item"); return; }
    try {
      setSaving(true);
      const saved = await createDirectSalesInvoice({
        businessId: business.id,
        userId: user.id,
        partyId,
        invoiceDate,
        items: valid.map((it) => ({
          product_id: it.product_id, part_number: it.part_number, description: it.description,
          hsn: it.hsn || null, mrp: Number(it.mrp), net_rate: Number(it.net_rate), qty: Number(it.qty),
          discount_pct: Number(it.discount_pct), gst_pct: Number(it.gst_pct), unit_id: it.unit_id ?? null,
        })),
        remarks: narration || null,
        status: "posted",
        clientRequestId: clientRequestId.current,
      });
      toast.success(`Invoice ${saved.invoice_number} posted`);
      navigate(`/sales/invoices?highlight=${saved.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save invoice");
    } finally {
      setSaving(false);
    }
  };

  useOutputCenterShortcut(
    { onNewDocument: () => navigate("/sales/invoices/new"), onSubmit: handleSave, onAddRow: addRow },
    [items, partyId, user, invoiceDate, narration, party, saving],
  );

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "submit", label: saving ? "Posting…" : "Save & Post", icon: Save, shortcut: "Ctrl+Enter", onClick: handleSave, disabled: saving || !configChecked || !directAvailable || !permitted, variant: "primary" },
  ];

  if (configChecked && (!directAvailable || blockedReason) && business) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
        <h1 className="text-xl font-semibold">New Sales Invoice</h1>
        <p className="text-sm text-muted-foreground">{blockedReason}</p>
      </div>
    );
  }

  return (
    <DocumentRoot type="sales_invoice" printMode="multiCopy">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">New Sales Invoice</span>
            {dupSet.size > 0 && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">Duplicate items</Badge>}
          </>
        }
        actions={toolbarActions}
      />

      <DocumentSheet>
        <DocumentSheetBanner left="Sales Invoice" center={business?.business_name ?? business?.firm_name ?? ""} right={day} />

        <DocumentHeaderGrid>
          <DocumentHeaderInputField label="Invoice Date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          <DocumentHeaderValue span={6}>{null}</DocumentHeaderValue>

          <DocumentHeaderLabel span={2}>Party A/c Name</DocumentHeaderLabel>
          <DocumentHeaderValue span={10}>
            <DocumentEntitySearchField
              results={partResults}
              getKey={(p) => p.id}
              query={partyQuery}
              onQueryChange={(v) => { setPartyQuery(v); checkExactPartyMatch(v, parties); }}
              onSelect={(p, source) => {
                setPartyId(p.id); setPartyQuery(p.name);
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
                <span className="text-muted-foreground not-italic">{resolvePartyOutstanding(party, ledgerBalances) < 0 ? "Cr" : "Dr"}</span>
              </DocumentHeaderValue>
              <DocumentHeaderLabel align="right">GSTIN</DocumentHeaderLabel>
              <DocumentHeaderValue>{party.gst || "—"}</DocumentHeaderValue>
              <DocumentHeaderLabel>Address</DocumentHeaderLabel>
              <DocumentHeaderValue span={10} className="truncate">{party.billing_address || party.address || "—"}</DocumentHeaderValue>
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
                  data-row={idx} data-col="part" value={it.part_number}
                  onChange={(e) => { updateRow(idx, { part_number: e.target.value.toUpperCase() }); setSearchIdx(idx); setSearchCol("part"); setSearchTerm(e.target.value); setHighlightedIndex(0); }}
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
                        <button key={p.id} id={`prod-item-${i}`} type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickProduct(idx, p); }}
                          className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${isHighlighted ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{p.part_number}</span>
                            <span className={`text-[10px] ${isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Stk {p.stock}</span>
                          </div>
                          <div className="text-[11px] truncate">{p.name}</div>
                          <div className={`text-[10px] ${isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>MRP ₹{fmt(Number(p.mrp))} · GST {p.gst_pct}%</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput data-row={idx} data-col="desc" value={it.description} onChange={(e) => updateRow(idx, { description: e.target.value })} onKeyDown={(e) => handleKey(e, idx, "desc")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput
                  data-row={idx} data-col="hsn" value={it.hsn || ""} readOnly disabled
                  title={it.product_id && !it.hsn ? "This product has no HSN linked in Product Master" : "Auto-filled from the product's HSN"}
                  className={it.product_id && !it.hsn
                    ? "h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 cursor-default"
                    : "h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent text-muted-foreground cursor-default"}
                />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="gst" type="number" step="any" value={it.gst_pct || ""} onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })} onKeyDown={(e) => handleKey(e, idx, "gst")} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="qty" type="number" step="any" value={it.qty || ""} onChange={(e) => updateRow(idx, { qty: +e.target.value })} onKeyDown={(e) => handleKey(e, idx, "qty")} />
              </td>
              <td className="px-0.5 py-0.5">
                {it.product_id && unitsByProduct[it.product_id]?.length ? (
                  <select value={it.unit_id ?? ""} onChange={(e) => updateRow(idx, { unit_id: e.target.value || null })} className="h-6 text-[11px] font-mono px-0.5 rounded-none border-0 bg-transparent focus-visible:ring-0 w-full">
                    {unitsByProduct[it.product_id].map((u) => (<option key={u.unit_id} value={u.unit_id}>{unitLabel(u.unit_id)}</option>))}
                  </select>
                ) : (<span className="text-[10px] text-muted-foreground px-1">—</span>)}
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="mrp" type="number" step="any" value={it.mrp || ""} onChange={(e) => updateRow(idx, { mrp: +e.target.value })} onKeyDown={(e) => handleKey(e, idx, "mrp")} />
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.mrp)}</td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput align="right" data-row={idx} data-col="disc" type="number" step="any" value={it.discount_pct || ""} onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })} onKeyDown={(e) => handleKey(e, idx, "disc")} />
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums">{fmt(it.net_rate)}</td>
              <td className="px-1 py-0.5 text-right tabular-nums font-semibold">{fmt(it.total)}</td>
              <td className="px-0.5 py-0.5 print:hidden">
                <button onClick={() => delRow(idx)} className="text-destructive/70 hover:text-destructive" title="Delete row"><Trash2 className="h-3 w-3" /></button>
              </td>
            </>
          )}
          renderFooter={
            <>
              <td colSpan={5} className="px-1.5 py-1 print:hidden">
                <button onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-sans" title="Shortcut: Alt + N"><Plus className="h-3 w-3" /> Add Row (Alt+N)</button>
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totalQty)} Qty</td>
              <td colSpan={5}></td>
              <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable + totals.gst_total)}</td>
              <td className="print:hidden"></td>
            </>
          }
        />

        <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
          <div className="col-span-12 md:col-span-7 space-y-2 print:hidden">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Narration</div>
              <Input value={narration} onChange={(e) => setNarration(e.target.value)}
                className="h-7 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary" />
            </div>
          </div>
          <div className="col-span-12 md:col-span-5 print:col-span-12">
            <DocumentTotals
              title="Invoice Totals"
              lines={[
                { label: "Subtotal (MRP)", value: fmt(totals.subtotal) },
                { label: "Discount", value: `− ${fmt(totals.discount_total)}` },
                { label: "Taxable Amount", value: fmt(totals.taxable), bold: true },
                ...(isInterstate ? [{ label: "IGST", value: fmt(igst) }] : [{ label: "CGST", value: fmt(cgst) }, { label: "SGST", value: fmt(sgst) }]),
                ...(roundOff !== 0 ? [{ label: "Round Off", value: (roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff)) }] : []),
              ]}
              grandTotal={`₹${fmt(finalTotal)}`}
            />
          </div>
        </div>
      </DocumentSheet>
    </DocumentRoot>
  );
};

export default CreateSalesInvoiceDirect;
