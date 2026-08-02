import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2, Printer, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useFormatDate } from "@/lib/dateFormat";

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyHighlightedIndex, setPartyHighlightedIndex] = useState(0);
  const partyInputRef = useRef<HTMLInputElement>(null);
  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery]);

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
          if (printOnLoad) setTimeout(() => window.print(), 600);
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

  const partyKeyDown = (e: React.KeyboardEvent) => {
    if (partyOpen && partResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPartyHighlightedIndex((p) => Math.min(p + 1, partResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPartyHighlightedIndex((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const sel = partResults[partyHighlightedIndex];
        if (sel) { setPartyId(sel.id); setPartyQuery(sel.name); setPartyOpen(false); setTimeout(() => invoiceSelectRef.current?.focus(), 10); }
        return;
      }
      if (e.key === "Escape") { setPartyOpen(false); return; }
    }
  };

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
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2);
  const finalTotal = Math.round(totals.grand_total);

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

  // Keyboard shortcuts — same mechanism as CreateOrder.tsx / CreateQuotation.tsx
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/sales/returns/new");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveDraft();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlePost();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        goToList();
      }
      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
      if (e.key === "F4") {
        e.preventDefault();
        invoiceSelectRef.current?.focus();
      }
      if (e.key === "F6") {
        e.preventDefault();
        partyInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [partyId, invoiceId, items, returnDate, reason, notes, saving, posting, readOnly]);

  return (
    <div className="theme-return invoice-entry max-w-[1400px] mx-auto text-[13px] font-mono">
      <div className="hidden print:block text-center font-sans font-bold text-[16px] mb-2">CREDIT NOTE / SALES RETURN</div>

      <div className="print:hidden flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
            {editMode ? `Sales Return (${status})` : "New Sales Return"}
          </span>
          {draftId && <Badge variant="outline" className="text-[10px]">#{returnNumber || draftId.slice(0, 8)}</Badge>}
          {isPosted && <Badge className="text-[10px]">Posted</Badge>}
          {isCancelled && <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving || readOnly} className="h-8" title="Shortcut: Ctrl + S">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Draft (Ctrl+S)"}
          </Button>
          <Button size="sm" onClick={handlePost} disabled={posting || isPosted || isCancelled} className="h-8 gradient-primary text-white border-0" title="Shortcut: Ctrl + Enter">
            <FileCheck2 className="h-3.5 w-3.5" /> {posting ? "Posting…" : "Post Return (Ctrl+⏎)"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8" title="Shortcut: Alt + P">
            <Printer className="h-3.5 w-3.5" /> Print (Alt+P)
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8">
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="border border-border bg-[hsl(var(--invoice-bg,60_30%_96%))] shadow-soft print:shadow-none print:border-0">
        <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center justify-between text-xs">
          <div className="font-sans font-semibold tracking-wide">Sales Return</div>
          <div className="font-sans">{business?.business_name ?? business?.firm_name ?? ""}</div>
          <div className="opacity-80">Created by {user?.email ?? "—"}</div>
        </div>

        {/* Header grid */}
        <div className="grid grid-cols-12 gap-x-3 gap-y-1 px-3 py-2 border-b border-border text-[12px]">
          <div className="col-span-2 text-muted-foreground">Return No</div>
          <div className="col-span-4">
            <Input value={returnNumber} readOnly className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0" />
          </div>
          <div className="col-span-2 text-muted-foreground text-right">Return Date</div>
          <div className="col-span-4">
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} disabled={readOnly}
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary" />
          </div>

          <div className="col-span-2 text-muted-foreground">Party A/c Name</div>
          <div className="col-span-4 relative">
            <Input
              ref={partyInputRef}
              value={partyQuery}
              disabled={readOnly}
              onChange={(e) => { setPartyQuery(e.target.value); setPartyOpen(true); setPartyHighlightedIndex(0); }}
              onFocus={() => setPartyOpen(true)}
              onBlur={() => setTimeout(() => setPartyOpen(false), 150)}
              onKeyDown={partyKeyDown}
              placeholder="Type to search party…"
              className="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
            {partyOpen && partResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-elegant max-h-64 overflow-auto">
                {partResults.map((p, i) => (
                  <button type="button" key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); setPartyId(p.id); setPartyQuery(p.name); setPartyOpen(false); setInvoiceId(""); }}
                    className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${partyHighlightedIndex === i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-2 text-muted-foreground text-right">Sales Invoice No</div>
          <div className="col-span-4">
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
          </div>

          {invoice && (
            <>
              <div className="col-span-2 text-muted-foreground">Invoice Amount</div>
              <div className="col-span-4 tabular-nums">₹{fmt(invoice.grand_total)}</div>
              <div className="col-span-2 text-muted-foreground text-right">Payment Status</div>
              <div className="col-span-4">
                <Badge variant={paymentStatus === "Paid" ? "default" : paymentStatus === "Partial" ? "outline" : "secondary"} className="text-[10px]">{paymentStatus}</Badge>
                <span className="ml-2 text-muted-foreground">Outstanding ₹{fmt(outstanding)}</span>
              </div>

              <div className="col-span-2 text-muted-foreground">Salesman</div>
              <div className="col-span-4">{invoice.salesman || "—"}</div>
              <div className="col-span-2 text-muted-foreground text-right">Warehouse</div>
              <div className="col-span-4">{warehouseName || "—"}</div>

              <div className="col-span-2 text-muted-foreground">Transport</div>
              <div className="col-span-4">{transportName || "—"}</div>
              <div className="col-span-2 text-muted-foreground text-right">LR No.</div>
              <div className="col-span-4">{lrNumber || "—"}</div>

              {invoice.remarks && (
                <>
                  <div className="col-span-2 text-muted-foreground">Invoice Remarks</div>
                  <div className="col-span-10 truncate">{invoice.remarks}</div>
                </>
              )}
            </>
          )}

          <div className="col-span-2 text-muted-foreground">Return Reason</div>
          <div className="col-span-4">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} disabled={readOnly}
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary" />
          </div>
          <div className="col-span-2 text-muted-foreground text-right">Created By</div>
          <div className="col-span-4">{user?.email ?? "—"}</div>
        </div>

        {/* Line-item grid */}
        <div className="overflow-x-auto print:hidden">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="text-left px-1.5 py-1 w-6">#</th>
                <th className="text-left px-1.5 py-1 min-w-[100px]">Part No.</th>
                <th className="text-left px-1.5 py-1 min-w-[160px]">Product</th>
                <th className="text-left px-1.5 py-1 w-28">Batch</th>
                <th className="text-left px-1.5 py-1 w-16">HSN</th>
                <th className="text-right px-1.5 py-1 w-16">Inv. Qty</th>
                <th className="text-right px-1.5 py-1 w-16">Returned</th>
                <th className="text-right px-1.5 py-1 w-16">Available</th>
                <th className="text-right px-1.5 py-1 w-20">Return Qty</th>
                <th className="text-right px-1.5 py-1 w-20">Rate</th>
                <th className="text-right px-1.5 py-1 w-14">Disc %</th>
                <th className="text-right px-1.5 py-1 w-14">GST %</th>
                <th className="text-right px-1.5 py-1 w-24">Return Value</th>
                <th className="text-left px-1.5 py-1 min-w-[100px]">Reason</th>
                <th className="text-left px-1.5 py-1 min-w-[100px]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">Select a party and invoice to load returnable items.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={it.sales_invoice_item_id} className="border-b border-border/60 hover:bg-muted/30">
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
                    <Input
                      data-row={idx} type="number" step="any" min={0} max={it.available_qty ?? 0}
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
                    <Input value={it.reason ?? ""} disabled={readOnly} onChange={(e) => updateItem(idx, { reason: e.target.value })}
                      className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary" />
                  </td>
                  <td className="px-0.5 py-0.5">
                    <Input value={it.remarks ?? ""} disabled={readOnly} onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                      className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hidden print:block">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="text-left px-1.5 py-1 w-6">#</th>
                <th className="text-left px-1.5 py-1 w-32">Part No.</th>
                <th className="text-left px-1.5 py-1 w-[30%]">Product</th>
                <th className="text-left px-1.5 py-1 w-20">Batch</th>
                <th className="text-right px-1.5 py-1 w-16">Return Qty</th>
                <th className="text-right px-1.5 py-1 w-20">Rate</th>
                <th className="text-right px-1.5 py-1 w-14">GST %</th>
                <th className="text-right px-1.5 py-1 w-24">Return Value</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let sr = 0;
                return items.filter((it) => Number(it.qty) > 0).map((it) => {
                  const n = String(++sr);
                  const batchLabel = it.batch_id ? (it.product_id ? batchesByProduct[it.product_id]?.find((b) => b.id === it.batch_id)?.batch_number : "") : "";
                  return (
                    <tr key={it.sales_invoice_item_id} className="border-b border-border/60">
                      <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{n}</td>
                      <td className="px-1.5 py-0.5 font-mono">{it.part_number}</td>
                      <td className="px-1.5 py-0.5 font-mono">{it.description}</td>
                      <td className="px-1.5 py-0.5 font-mono">{batchLabel || "—"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.qty)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.net_rate)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.gst_pct)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{fmt(it.total)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

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
            <div className="border border-border bg-card/60">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border font-sans">Return Summary</div>
              <div className="px-2 py-1.5 text-[12px] space-y-0.5">
                <Row label="Taxable Value" value={fmt(totals.taxable)} />
                <Row label="Discount" value={`− ${fmt(totals.discount_total)}`} />
                <Row label="CGST" value={fmt(gstHalf)} />
                <Row label="SGST" value={fmt(gstHalf)} />
                <Row label="Round Off" value={(roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff))} />
                <div className="border-t border-border mt-1 pt-2 flex items-baseline justify-between bg-primary/10 px-2 py-1 rounded">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-foreground font-sans">Net Credit Note Amount</span>
                  <span className="font-extrabold text-lg text-primary tabular-nums">₹{fmt(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white; }
          .invoice-entry { font-size: 11px; }
        }
        :root { --invoice-bg: 60 30% 96%; }
        .dark { --invoice-bg: 240 8% 12%; }
      `}</style>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export default CreateSalesReturn;
