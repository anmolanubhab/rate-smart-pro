import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchParties, type Party } from "@/lib/parties";
import { fetchBatchesForProduct, type ProductBatch } from "@/lib/productBatches";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import {
  fetchInvoicesForParty, fetchInvoiceReturnContext, fetchSalesReturnById, fetchSalesReturnItems,
  saveSalesReturnDraft, postSalesReturn, nextSalesReturnNumber,
  type ReturnableInvoice, type SalesReturnItem, type SalesReturnStatus,
} from "@/lib/salesReturns";
import { computeTotals } from "@/lib/orders";
import { useRoundOffSettings, resolveRoundOff } from "@/lib/roundOffSettings";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { useOutputCenterShortcut } from "@/hooks/useOutputCenterShortcut";
import { DocumentOutputCenter, type DocumentOutputCenterHandle } from "@/components/documentEngine/DocumentOutputCenter";
import { buildSalesReturnUdm } from "@/lib/documentUdm/salesReturnUdm";

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[100px]" },
  { key: "product", header: "Product", widthClass: "min-w-[160px]" },
  { key: "batch", header: "Batch", widthClass: "w-28" },
  { key: "hsn", header: "HSN", widthClass: "w-16" },
  { key: "inv_qty", header: "Inv. Qty", align: "right", widthClass: "w-16" },
  { key: "returned", header: "Returned", align: "right", widthClass: "w-16" },
  { key: "available", header: "Available", align: "right", widthClass: "w-16" },
  { key: "return_qty", header: "Return Qty", align: "right", widthClass: "w-20" },
  { key: "rate", header: "Rate", align: "right", widthClass: "w-20" },
  { key: "disc", header: "Disc %", align: "right", widthClass: "w-14" },
  { key: "gst", header: "GST %", align: "right", widthClass: "w-14" },
  { key: "value", header: "Return Value", align: "right", widthClass: "w-24" },
  { key: "reason", header: "Reason", widthClass: "min-w-[100px]" },
  { key: "remarks", header: "Remarks", widthClass: "min-w-[100px]" },
];

const CreateSalesReturn = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const editId = routeParams.id;
  const prefillInvoiceId = params.get("invoiceId");
  const printOnLoad = params.get("print") === "1";
  const fd = useFormatDate();
  const baseTitle = "Sales Return Entry — RD Pro";

  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState<SalesReturnStatus>("draft");
  const [draftId, setDraftId] = useState<string | null>(editId ?? null);
  const draftIdRef = useRef<string | null>(editId ?? null);

  const [returnNumber, setReturnNumber] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  // Party
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const partyInputRef = useRef<HTMLInputElement>(null);
  const outputCenterRef = useRef<DocumentOutputCenterHandle>(null);
  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    if (party && party.name.trim().toLowerCase() === q) return [];
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery, party]);

  // Invoice
  const [invoices, setInvoices] = useState<ReturnableInvoice[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const invoiceSelectRef = useRef<HTMLButtonElement>(null);
  const [warehouseName, setWarehouseName] = useState<string | null>(null);
  const [transportName, setTransportName] = useState<string | null>(null);
  const [lrNumber, setLrNumber] = useState<string | null>(null);
  const invoice = useMemo(() => invoices.find((i) => i.id === invoiceId) || null, [invoices, invoiceId]);
  const outstanding = invoice ? Number(invoice.grand_total) - Number(invoice.paid_amount) : 0;
  const paymentStatus = !invoice ? "" : Number(invoice.paid_amount) <= 0 ? "Unpaid" : outstanding <= 0.01 ? "Paid" : "Partial";

  const [items, setItems] = useState<SalesReturnItem[]>([]);
  const [batchesByProduct, setBatchesByProduct] = useState<Record<string, ProductBatch[]>>({});

  const isPosted = status === "posted";
  const isCancelled = status === "cancelled";
  const readOnly = editMode && status !== "draft";

  useEffect(() => { document.title = baseTitle; }, []);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id, "customer").then(setParties).catch((e) => toast.error(e.message));
  }, [user]);

  useEffect(() => {
    if (!editId) {
      setTimeout(() => partyInputRef.current?.focus(), 100);
    }
  }, [editId]);

  // Load existing return (edit mode) or generate a fresh return number
  useEffect(() => {
    if (!user) return;
    if (editId) {
      (async () => {
        try {
          const ret = await fetchSalesReturnById(editId);
          const its = await fetchSalesReturnItems(editId);
          setReturnNumber(ret.return_number);
          setReturnDate(ret.return_date);
          setReason(ret.reason ?? "");
          setNotes(ret.notes ?? "");
          setStatus(ret.status);
          setPartyId(ret.party_id);
          setInvoiceId(ret.sales_invoice_id);
          setEditMode(true);
          setDraftId(ret.id);
          draftIdRef.current = ret.id;
          // Merge saved return-item edits onto the invoice's full return-candidate context
          const ctx = await fetchInvoiceReturnContext(ret.sales_invoice_id);
          setWarehouseName(ctx.warehouse_name);
          setTransportName(ctx.transport_name);
          setLrNumber(ctx.lr_number);
          const byInvoiceItem = new Map(its.map((it) => [it.sales_invoice_item_id, it]));
          setItems(ctx.lines.map((line) => {
            const saved = byInvoiceItem.get(line.sales_invoice_item_id);
            return saved ? { ...line, qty: saved.qty, batch_id: saved.batch_id, reason: saved.reason, remarks: saved.remarks, total: saved.total } : line;
          }));
          if (printOnLoad) setTimeout(() => outputCenterRef.current?.directPrint(), 600);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    } else {
      const biz = business?.id ?? getActiveBusinessIdSync();
      if (biz) nextSalesReturnNumber(biz).then(setReturnNumber).catch(() => {});
    }
  }, [user, editId, business?.id]);

  // Party change → load that party's returnable invoices
  useEffect(() => {
    if (!partyId || !user) { setInvoices([]); return; }
    const biz = business?.id ?? getActiveBusinessIdSync();
    if (!biz) return;
    fetchInvoicesForParty(biz, partyId).then(setInvoices).catch((e) => toast.error(e.message));
  }, [partyId, user, business?.id]);

  // Keep the party search box's display text in sync with the resolved
  // party — separate from the invoice-loading effect above so it also
  // re-fires once `parties` finishes loading after edit-mode already set
  // partyId (avoids the party field showing blank while editing).
  useEffect(() => {
    if (party) setPartyQuery(party.name);
  }, [party]);

  // Invoice change → auto-load header context + item grid
  useEffect(() => {
    if (!invoiceId || editMode) return; // edit mode already hydrates items above
    fetchInvoiceReturnContext(invoiceId)
      .then((ctx) => {
        setWarehouseName(ctx.warehouse_name);
        setTransportName(ctx.transport_name);
        setLrNumber(ctx.lr_number);
        setItems(ctx.lines);
      })
      .catch((e) => toast.error(e.message));
  }, [invoiceId, editMode]);

  // Prefill from an Invoice's "Create Return" button — resolve the invoice's
  // party first, then set both once parties are loaded so the party search
  // box's display value resolves correctly.
  useEffect(() => {
    if (!prefillInvoiceId || editId || !user || !parties.length) return;
    supabase.from("sales_invoices").select("party_id").eq("id", prefillInvoiceId).maybeSingle()
      .then(({ data }) => {
        if (data?.party_id) {
          setPartyId(data.party_id);
          setInvoiceId(prefillInvoiceId);
        }
      });
  }, [prefillInvoiceId, editId, user, parties.length]);

  // Load batch options for batch-tracked lines once items are known
  useEffect(() => {
    const biz = business?.id ?? getActiveBusinessIdSync();
    if (!biz) return;
    const batchLines = items.filter((it) => it.tracking_type === "batch" && it.product_id && !batchesByProduct[it.product_id]);
    if (!batchLines.length) return;
    (async () => {
      const updates: Record<string, ProductBatch[]> = {};
      for (const it of batchLines) {
        try {
          updates[it.product_id!] = await fetchBatchesForProduct(biz, it.product_id!);
        } catch { /* ignore */ }
      }
      setBatchesByProduct((m) => ({ ...m, ...updates }));
    })();
  }, [items, business?.id]);

  // Auto-select the batch when a batch-tracked line has exactly one batch
  useEffect(() => {
    setItems((rows) => rows.map((r) => {
      if (r.tracking_type !== "batch" || !r.product_id || r.batch_id) return r;
      const options = batchesByProduct[r.product_id];
      if (options?.length === 1) return { ...r, batch_id: options[0].id };
      return r;
    }));
  }, [batchesByProduct]);

  const updateItem = (idx: number, patch: Partial<SalesReturnItem>) => {
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const qty = Math.max(0, Math.min(Number(merged.qty) || 0, merged.available_qty ?? Infinity));
      const taxable = qty * (Number(merged.net_rate) || 0);
      const total = +(taxable * (1 + (Number(merged.gst_pct) || 0) / 100)).toFixed(2);
      return { ...merged, qty, total };
    }));
  };

  const totals = useMemo(() => computeTotals(items.filter((it) => Number(it.qty) > 0), 0), [items]);
  const gstHalf = +(totals.gst_total / 2).toFixed(2);
  // create_sales_return()/post_sales_return() only round when Settings ->
  // Accounting -> Round Off is ON for Credit Note -- mirror that here so the
  // preview never shows an adjustment the backend won't actually post.
  const roundOffSettings = useRoundOffSettings();
  const { roundOffAmount: roundOff, finalTotal } = useMemo(
    () => resolveRoundOff(totals.grand_total, roundOffSettings, roundOffSettings.applyCreditNote),
    [totals.grand_total, roundOffSettings]
  );

  const validRows = () => items.filter((it) => Number(it.qty) > 0);

  const goToList = () => navigate("/sales/returns");

  const handleSaveDraft = async () => {
    if (!user || saving || readOnly) return;
    if (!partyId || !invoiceId) { toast.error("Select party and invoice"); return; }
    const valid = validRows();
    if (!valid.length) { toast.error("Enter a return quantity for at least one item"); return; }
    for (const it of valid) {
      if (it.tracking_type === "batch" && !it.batch_id) {
        toast.error(`Select a batch for ${it.part_number}`);
        return;
      }
    }
    try {
      setSaving(true);
      const saved = await saveSalesReturnDraft({
        userId: user.id,
        id: draftIdRef.current || undefined,
        return_date: returnDate,
        sales_invoice_id: invoiceId,
        party_id: partyId,
        warehouse_id: null,
        reason,
        notes,
        items: valid,
      });
      setDraftId(saved.id);
      draftIdRef.current = saved.id;
      setReturnNumber(saved.return_number);
      setEditMode(true);
      setStatus("draft");
      toast.success("Draft saved", { duration: 1500 });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async () => {
    if (!user || posting || isPosted || isCancelled) return;
    if (!draftIdRef.current) { toast.error("Save the draft first"); return; }
    try {
      setPosting(true);
      await postSalesReturn(draftIdRef.current);
      toast.success(`Return ${returnNumber} posted`);
      navigate(`/sales/returns?highlight=${draftIdRef.current}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPosting(false);
    }
  };

  useOutputCenterShortcut(
    {
      onSaveDraft: handleSaveDraft,
      onSubmit: handlePost,
      onEscape: goToList,
      onFocusSecondary: () => invoiceSelectRef.current?.focus(),
      onFocusPrimary: () => partyInputRef.current?.focus(),
      onPreview: () => outputCenterRef.current?.preview(),
      onDirectPrint: () => outputCenterRef.current?.directPrint(),
      onOpenMenu: () => outputCenterRef.current?.openMenu(),
    },
    [partyId, invoiceId, items, returnDate, reason, notes, saving, posting, readOnly],
  );

  // Two shortcuts here don't match the shared hook's key combinations
  // (plain Ctrl+N with no Alt, and Alt+P instead of Ctrl+P for print) —
  // kept as a small supplementary handler rather than widening the shared
  // hook's API for a one-off variant.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/sales/returns/new");
      }
      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        outputCenterRef.current?.directPrint();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: saving ? "Saving…" : "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: handleSaveDraft, disabled: saving || readOnly },
    { key: "post", label: posting ? "Posting…" : "Post Return", icon: FileCheck2, shortcut: "Ctrl+⏎", onClick: handlePost, disabled: posting || isPosted || isCancelled, variant: "primary" },
  ];

  const businessIdForPrint = business?.id ?? getActiveBusinessIdSync();

  return (
    <DocumentRoot type="sales_return" printMode="multiCopy">
      <DocumentToolbar
        statusSlot={
          <>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
              {editMode ? `Sales Return (${status})` : "New Sales Return"}
            </span>
            {draftId && <Badge variant="outline" className="text-[10px]">#{returnNumber || draftId.slice(0, 8)}</Badge>}
            {isPosted && <Badge className="text-[10px]">Posted</Badge>}
            {isCancelled && <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>}
          </>
        }
        actions={toolbarActions}
      />
      <div className="print:hidden flex justify-end -mt-2 mb-2">
        <DocumentOutputCenter
          ref={outputCenterRef}
          documentTypeId="sales_return"
          documentId={draftId ?? undefined}
          documentNumber={returnNumber}
          disabled={!businessIdForPrint}
          getUdm={() => buildSalesReturnUdm({
            businessId: businessIdForPrint!,
            returnNumber,
            returnDate,
            reason,
            status,
            party,
            items: validRows(),
            batchesByProduct,
          })}
        />
      </div>

      <DocumentSheet>
        <DocumentSheetBanner left="Sales Return" center={business?.business_name ?? business?.firm_name ?? ""} right={`Created by ${user?.email ?? "—"}`} />

        <DocumentHeaderGrid>
          <DocumentHeaderInputField label="Return No" value={returnNumber} readOnly />
          <DocumentHeaderInputField label="Return Date" labelAlign="right" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} disabled={readOnly} />

          <DocumentHeaderLabel span={2}>Party A/c Name</DocumentHeaderLabel>
          <DocumentHeaderValue span={4}>
            <DocumentEntitySearchField
              results={partResults}
              getKey={(p) => p.id}
              query={partyQuery}
              onQueryChange={setPartyQuery}
              onSelect={(p, source) => {
                setPartyId(p.id);
                setPartyQuery(p.name);
                // Mirrors the original's own inconsistency: a mouse click
                // resets the invoice selection, a keyboard Enter-select
                // does not (it jumps focus to the invoice picker instead,
                // trusting the user to pick a fresh one there).
                if (source === "mouse") setInvoiceId("");
                else setTimeout(() => invoiceSelectRef.current?.focus(), 10);
              }}
              renderRow={(p) => <span>{p.name}</span>}
              placeholder="Type to search party…"
              inputRef={partyInputRef}
              inputClassName="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </DocumentHeaderValue>
          <DocumentHeaderLabel align="right">Sales Invoice No</DocumentHeaderLabel>
          <DocumentHeaderValue>
            <Select value={invoiceId} onValueChange={(v) => setInvoiceId(v)} disabled={!partyId || readOnly}>
              <SelectTrigger ref={invoiceSelectRef as any} className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus:ring-0">
                <SelectValue placeholder={partyId ? "Select invoice…" : "Select party first"} />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>{inv.invoice_number} — {fd(inv.invoice_date)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DocumentHeaderValue>

          {invoice && (
            <>
              <DocumentHeaderLabel>Invoice Amount</DocumentHeaderLabel>
              <DocumentHeaderValue className="tabular-nums">₹{fmt(invoice.grand_total)}</DocumentHeaderValue>
              <DocumentHeaderLabel align="right">Payment Status</DocumentHeaderLabel>
              <DocumentHeaderValue>
                <Badge variant={paymentStatus === "Paid" ? "default" : paymentStatus === "Partial" ? "outline" : "secondary"} className="text-[10px]">{paymentStatus}</Badge>
                <span className="ml-2 text-muted-foreground">Outstanding ₹{fmt(outstanding)}</span>
              </DocumentHeaderValue>

              <DocumentHeaderLabel>Salesman</DocumentHeaderLabel>
              <DocumentHeaderValue>{invoice.salesman || "—"}</DocumentHeaderValue>
              <DocumentHeaderLabel align="right">Warehouse</DocumentHeaderLabel>
              <DocumentHeaderValue>{warehouseName || "—"}</DocumentHeaderValue>

              <DocumentHeaderLabel>Transport</DocumentHeaderLabel>
              <DocumentHeaderValue>{transportName || "—"}</DocumentHeaderValue>
              <DocumentHeaderLabel align="right">LR No.</DocumentHeaderLabel>
              <DocumentHeaderValue>{lrNumber || "—"}</DocumentHeaderValue>

              {invoice.remarks && (
                <>
                  <DocumentHeaderLabel>Invoice Remarks</DocumentHeaderLabel>
                  <DocumentHeaderValue span={10} className="truncate">{invoice.remarks}</DocumentHeaderValue>
                </>
              )}
            </>
          )}

          <DocumentHeaderInputField label="Return Reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={readOnly} />
          <DocumentHeaderLabel align="right">Created By</DocumentHeaderLabel>
          <DocumentHeaderValue>{user?.email ?? "—"}</DocumentHeaderValue>
        </DocumentHeaderGrid>

        <DocumentGridTable
          columns={GRID_COLUMNS}
          rows={items}
          showSpacerRows={false}
          hasRowActions={false}
          emptyMessage="Select a party and invoice to load returnable items."
          renderRow={(it, idx) => (
            <>
              <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
              <td className="px-1.5 py-0.5 font-mono">{it.part_number}</td>
              <td className="px-1.5 py-0.5">{it.description}</td>
              <td className="px-0.5 py-0.5">
                {it.tracking_type === "batch" ? (
                  <select
                    value={it.batch_id ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateItem(idx, { batch_id: e.target.value || null })}
                    className="h-6 text-[11px] font-mono px-0.5 rounded-none border-0 bg-transparent focus-visible:ring-0 w-full"
                  >
                    <option value="">Select…</option>
                    {(it.product_id ? batchesByProduct[it.product_id] : [])?.map((b) => (
                      <option key={b.id} value={b.id}>{b.batch_number}{b.expiry_date ? ` (exp ${b.expiry_date})` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] text-muted-foreground px-1">—</span>
                )}
              </td>
              <td className="px-1.5 py-0.5 font-mono">{it.hsn || "—"}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.invoiced_qty ?? 0)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">{fmt(it.already_returned_qty ?? 0)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.available_qty ?? 0)}</td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput
                  align="right" type="number" step="any" min={0} max={it.available_qty ?? 0}
                  value={it.qty || ""} disabled={readOnly}
                  onChange={(e) => updateItem(idx, { qty: Math.max(0, +e.target.value) })}
                  className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border focus-visible:border-primary"
                />
              </td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.net_rate)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.discount_pct)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.gst_pct)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums font-semibold">{fmt(it.total)}</td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput value={it.reason ?? ""} disabled={readOnly} onChange={(e) => updateItem(idx, { reason: e.target.value })} />
              </td>
              <td className="px-0.5 py-0.5">
                <DocumentGridCellInput value={it.remarks ?? ""} disabled={readOnly} onChange={(e) => updateItem(idx, { remarks: e.target.value })} />
              </td>
            </>
          )}
        />

        {/* Bottom section: notes + totals */}
        <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
          <div className="col-span-12 md:col-span-7 space-y-2 print:hidden">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Notes</div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={2}
                className="text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary resize-none" />
            </div>
          </div>

          <div className="col-span-12 md:col-span-5 print:col-span-12">
            <DocumentTotals
              title="Return Summary"
              lines={[
                { label: "Taxable Value", value: fmt(totals.taxable) },
                { label: "Discount", value: `− ${fmt(totals.discount_total)}` },
                { label: "CGST", value: fmt(gstHalf) },
                { label: "SGST", value: fmt(gstHalf) },
                ...(roundOff !== 0 ? [{ label: "Round Off", value: (roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff)) }] : []),
              ]}
              grandTotalLabel="Net Credit Note Amount"
              grandTotal={`₹${fmt(finalTotal)}`}
            />
          </div>
        </div>
      </DocumentSheet>
    </DocumentRoot>
  );
};

export default CreateSalesReturn;
