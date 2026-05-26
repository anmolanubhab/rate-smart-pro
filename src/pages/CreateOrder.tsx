import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { 
  Save, FileCheck2, Printer, FileDown, Plus, Trash2, 
  Upload, FileSpreadsheet, Building2, Calendar, Hash, 
  User, ShieldCheck, AlertTriangle, Layers, Info 
} from "lucide-react";
import OrderExcelUpload from "@/components/OrderExcelUpload";
import { downloadOrderTemplate } from "@/lib/excelTemplates";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchParties, Party } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { cn } from "@/lib/utils";
import {
  computeItem,
  computeTotals,
  nextOrderNumber,
  saveOrder,
  OrderItem,
  fetchOrder,
  fetchOrderItems,
} from "@/lib/orders";

/** Extended row that carries local variables for the automated ERP UI. */
type Row = OrderItem & { hsn?: string; rack?: string };

interface TotalsRowProps {
  label: string;
  value: string;
  bold?: boolean;
}

const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "",
  rack: "",
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLS = ["part", "desc", "hsn", "gst", "rack", "qty", "mrp", "disc"] as const;
type Col = (typeof COLS)[number];

const CreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  
  const editId = routeParams.id || params.get("id");
  const printOnLoad = params.get("print") === "1";
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("draft");

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);

  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState("");
  const [voucherType] = useState("TVS Tax Invoice");
  const [salesman, setSalesman] = useState("");
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<Row[]>(Array.from({ length: 6 }, blankRow));
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(editId);

  // Autocomplete Index tracking
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchCol, setSearchCol] = useState<Col>("part");

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const day = useMemo(
    () => new Date(orderDate).toLocaleDateString("en-IN", { weekday: "long" }),
    [orderDate],
  );

  useEffect(() => {
    document.title = "Invoice Entry Platform — Spare Parts OMS";
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id).then(setParties).catch((e) => toast.error(e.message));
    
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
          setNarration(o.notes || "");
          setRefNo((o.remarks || "").replace(/^Ref:\s*/i, ""));
          setEditMode(true);
          setEditStatus(o.status);
          setDraftId(o.id);
          
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

  // Handle party contextual defaults
  useEffect(() => {
    if (!party) return;
    const def = Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) =>
      rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: def } : r)),
    );
    setPartyQuery(party.name);
  }, [partyId, party]);

  // Product pipeline telemetry search
  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8).then(setSearchResults).catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [searchTerm, searchIdx, user]);

  const totals = useMemo(() => computeTotals(items, 0), [items]);
  const cgst = +(totals.gst_total / 2).toFixed(2);
  const sgst = +(totals.gst_total / 2).toFixed(2);
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2);
  const finalTotal = Math.round(totals.grand_total);
  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery]);

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

  const pickProduct = (idx: number, p: Product) => {
    const def = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      vehicle_model: p.vehicle_model,
      mrp: Number(p.mrp),
      gst_pct: Number(p.gst_pct),
      discount_pct: items[idx].discount_pct || def,
      qty: items[idx].qty || 1,
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 10);
  };

  const focusCell = (row: number, col: Col) => {
    const el = document.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
    el?.select();
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    const ci = COLS.indexOf(col);
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (ci < COLS.length - 1) {
        focusCell(idx, COLS[ci + 1]);
      } else {
        if (idx === items.length - 1) addRow();
        setTimeout(() => focusCell(idx + 1, "part"), 10);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(Math.min(items.length - 1, idx + 1), col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(0, idx - 1), col);
    }
  };

  const validRows = () => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user) return;
    const valid = validRows();
    if (status === "pending" && (!partyId || !valid.length)) {
      toast.error("Select party and append at least one system telemetry item");
      return;
    }
    try {
      setSaving(true);
      const saved = await saveOrder({
        userId: user.id,
        id: draftId || undefined,
        order_number: orderNumber,
        order_date: orderDate,
        party_id: partyId || null,
        party_name: party?.name ?? null,
        party_snapshot: party ?? null,
        billing_address: party?.billing_address ?? party?.address ?? null,
        shipping_address: party?.shipping_address ?? party?.address ?? null,
        salesman,
        notes: narration,
        remarks: refNo ? `Ref: ${refNo}` : null,
        mode: party?.discount_type ?? null,
        status,
        items: valid,
      });
      setDraftId(saved.id);
      if (status === "pending") {
        toast.success("Invoice fully confirmed to Ledger");
        navigate(`/orders?highlight=${saved.id}`);
      } else {
        toast.success("Draft saved successfully", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Automated cloud safe synchronization pipeline (Every 30s)
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
  }, [items, partyId, user, saving]);

  // Reactive Multi-Duplicate detection engine
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
    const sys = Number(party.default_discount) || 0;
    const agreed = Number(party.agreed_discount) || 0;
    const rdExtra = Math.max(agreed - sys, 0);
    return { sys, agreed, rdExtra, effective: agreed };
  }, [party]);

  return (
    <div className="invoice-entry max-w-[1440px] mx-auto text-[13px] font-mono space-y-4 p-2 sm:p-4 transition-all duration-300">
      {/* HUD Controller Action Control Center */}
      <div className="print:hidden glass blur-bg rounded-2xl border border-white/10 p-4 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-elegant bg-background/60 sticky top-2 z-40 backdrop-blur-md">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
            <ShieldCheck className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-sans font-bold">
                {editMode ? (editStatus === "draft" ? "System Draft Invoice" : `Ledger Locked (${editStatus})`) : "Core Invoice Engine"}
              </span>
              {dupSet.size > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px] animate-bounce">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Duplicate Items Found
                </Badge>
              )}
            </div>
            <h2 className="text-base font-sans font-bold text-foreground flex items-center gap-1.5 mt-0.5">
              {voucherType} {draftId && <span className="text-xs font-mono font-normal text-muted-foreground">/ id_#{orderNumber || draftId.slice(0, 8)}</span>}
            </h2>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto justify-end">
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)} className="h-8 border-border/60 hover:bg-muted rounded-xl">
            <Upload className="h-3.5 w-3.5 mr-1" /> Upload Dataset
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadOrderTemplate} className="h-8 hover:bg-muted text-muted-foreground rounded-xl">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Template
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleSave("draft")} disabled={saving} className="h-8 rounded-xl font-sans font-semibold">
            <Save className="h-3.5 w-3.5 mr-1" /> {editMode && editStatus === "draft" ? "Update Workspace" : "Keep Draft"}
          </Button>
          <Button size="sm" onClick={() => handleSave("pending")} disabled={saving} className="h-8 gradient-primary text-white border-0 rounded-xl font-sans font-semibold shadow-elegant hover:opacity-95">
            <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Commit to Ledger
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8 rounded-xl border-border/60">
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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

      {/* Main Neo-Brutalist Futuristic Core Workspace */}
      <div className="rounded-3xl border border-border/60 bg-card overflow-hidden shadow-soft print:shadow-none print:border-0 print:rounded-none">
        
        {/* Dynamic Telemetry Banner */}
        <div className="gradient-primary text-white px-4 py-2.5 flex items-center justify-between text-xs tracking-wide">
          <div className="flex items-center gap-2 font-sans font-bold uppercase tracking-widest">
            <Layers className="h-4 w-4" /> {voucherType} System
          </div>
          <div className="font-sans font-semibold hidden sm:block opacity-90">Viswanath Automobiles Pvt. Ltd. [TVS]</div>
          <div className="font-mono bg-white/10 px-2 py-0.5 rounded-md border border-white/10 text-[11px] font-bold">{day.toUpperCase()}</div>
        </div>

        {/* Modular Profile Header Metadata Blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 border-b border-border/50 bg-muted/20 text-[12px]">
          
          {/* System Control Inputs Block */}
          <div className="lg:col-span-5 grid grid-cols-12 gap-3 bg-background/50 border border-border/40 p-4 rounded-2xl">
            <div className="col-span-12 font-sans font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
              <Hash className="h-3 w-3" /> Core Transaction Anchors
            </div>
            
            <div className="col-span-4 flex items-center text-muted-foreground font-medium">Voucher #</div>
            <div className="col-span-8">
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="h-7 text-[12px] font-mono px-2 rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="col-span-4 flex items-center text-muted-foreground font-medium">System Date</div>
            <div className="col-span-8">
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-7 text-[12px] font-mono px-2 rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="col-span-4 flex items-center text-muted-foreground font-medium">Reference Key</div>
            <div className="col-span-8">
              <Input
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="Chalan Number and Bill by"
                className="h-7 text-[12px] font-mono px-2 rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="col-span-4 flex items-center text-muted-foreground font-medium">Operator Agent</div>
            <div className="col-span-8">
              <Input
                value={salesman}
                onChange={(e) => setSalesman(e.target.value)}
                placeholder="Sales executive name"
                className="h-7 text-[12px] font-mono px-2 rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
          </div>

          {/* Account Identity Block */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-background/50 border border-border/40 p-4 rounded-2xl relative">
            <div className="space-y-3">
              <div className="font-sans font-bold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Ledger Account Designation
              </div>
              
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                </div>
                <Input
                  value={partyQuery}
                  onChange={(e) => {
                    setPartyQuery(e.target.value);
                    setPartyOpen(true);
                  }}
                  onFocus={() => setPartyOpen(true)}
                  onBlur={() => setTimeout(() => setPartyOpen(false), 150)}
                  placeholder="Query terminal account identification stack..."
                  className="h-8 pl-8 text-[12px] font-mono font-bold rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
                />
                
                {partyOpen && partResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border/80 rounded-xl shadow-elegant max-h-64 overflow-auto backdrop-blur-lg">
                    {partResults.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPartyId(p.id);
                          setPartyQuery(p.name);
                          setPartyOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[12px] hover:bg-muted border-b border-border/40 last:border-0 flex items-center justify-between gap-2 transition-all"
                      >
                        <span className="font-bold text-foreground">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {p.discount_type} · {Number(p.discount_type === "RD" ? p.agreed_discount : p.default_discount).toFixed(1)}%
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {party && (
                <div className="grid grid-cols-12 gap-x-3 gap-y-1 text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/30">
                  <div className="col-span-3 font-semibold">Ledger Bal:</div>
                  <div className="col-span-9 text-foreground font-mono font-bold flex items-center gap-1">
                    ₹{fmt(Number(party.outstanding_balance) || 0)} <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1 rounded">DEBIT DR</span>
                  </div>
                  <div className="col-span-3 font-semibold">GSTIN Key:</div>
                  <div className="col-span-9 text-foreground font-mono uppercase">{party.gst || "NOT IN LEDGER"}</div>
                  <div className="col-span-3 font-semibold">Address:</div>
                  <div className="col-span-9 text-foreground truncate">{party.billing_address || party.address || "—"}</div>
                </div>
              )}
            </div>

            {party && (
              <div className="flex flex-wrap gap-1 mt-3 font-sans">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 text-[10px] font-bold px-2 rounded-md">
                  {party.discount_type} Computation Node
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono px-2 rounded-md">
                  Base Rule: {Number(party.default_discount).toFixed(1)}%
                </Badge>
                {party.discount_type === "RD" && (
                  <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5 text-[10px] font-mono px-2 rounded-md">
                    Agreed: {Number(party.agreed_discount).toFixed(1)}%
                  </Badge>
                )}
                {party.beat && <Badge variant="outline" className="text-[10px] px-2 rounded-md">Sector: {party.beat}</Badge>}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Tactical Matrix Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border font-sans font-bold">
                <th className="text-center py-2 w-8">#</th>
                <th className="text-left px-2 py-2 min-w-[140px]">Part Number Identifier</th>
                <th className="text-left px-2 py-2 min-w-[200px]">Description Metrics</th>
                <th className="text-left px-2 py-2 w-24">HSN Static</th>
                <th className="text-right px-2 py-2 w-16">GST %</th>
                <th className="text-left px-2 py-2 w-16">Rack Loc</th>
                <th className="text-right px-2 py-2 w-20">Volume</th>
                <th className="text-right px-2 py-2 w-24">MRP Vector</th>
                <th className="text-right px-2 py-2 w-24">Rate Space</th>
                <th className="text-right px-2 py-2 w-16">Disc %</th>
                <th className="text-right px-2 py-2 w-24">Net Margin</th>
                <th className="text-right px-2 py-2 w-28">Net Amount</th>
                <th className="w-8 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((it, idx) => {
                const isDup = it.part_number.trim() && dupSet.has(it.part_number.trim().toLowerCase());
                return (
                  <tr
                    key={idx}
                    className={cn(
                      "hover:bg-muted/30 group transition-all duration-150 relative",
                      isDup ? "bg-destructive/5 dark:bg-destructive/10" : ""
                    )}
                  >
                    <td className="text-center text-muted-foreground text-[10px] font-sans font-bold select-none">{idx + 1}</td>
                    
                    {/* Autocomplete Dynamic input */}
                    <td className="p-0.5 relative">
                      <Input
                        data-row={idx}
                        data-col="part"
                        value={it.part_number}
                        onChange={(e) => {
                          updateRow(idx, { part_number: e.target.value.toUpperCase() });
                          setSearchIdx(idx);
                          setSearchCol("part");
                          setSearchTerm(e.target.value);
                        }}
                        onFocus={() => {
                          setSearchIdx(idx);
                          setSearchCol("part");
                          setSearchTerm(it.part_number);
                        }}
                        onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx && searchCol === "part" ? null : s)), 150)}
                        onKeyDown={(e) => handleKey(e, idx, "part")}
                        className="h-7 text-[12px] font-mono px-2 rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background uppercase font-bold"
                      />
                      {searchIdx === idx && searchCol === "part" && searchResults.length > 0 && (
                        <div className="absolute z-50 left-1 mt-1 w-88 bg-popover border border-border rounded-xl shadow-elegant max-h-60 overflow-auto backdrop-blur-lg">
                          {searchResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickProduct(idx, p);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-muted text-[12px] border-b border-border/40 last:border-0 block group/btn transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-primary group-hover/btn:text-primary-glow">{p.part_number}</span>
                                <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded font-sans font-semibold text-muted-foreground">Vol: {p.stock}</span>
                              </div>
                              <div className="text-[11px] truncate text-foreground/80 mt-0.5">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-sans mt-0.5">
                                MRP ₹{fmt(Number(p.mrp))} · GST {p.gst_pct}%
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="desc"
                        value={it.description}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "desc")}
                        className="h-7 text-[12px] font-mono px-2 rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background truncate"
                      />
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="hsn"
                        value={it.hsn || ""}
                        onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "hsn")}
                        className="h-7 text-[12px] font-mono px-2 rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background"
                      />
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="gst"
                        type="number"
                        step="any"
                        value={it.gst_pct || ""}
                        onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "gst")}
                        className="h-7 text-[12px] font-mono px-2 text-right rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background"
                      />
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="rack"
                        value={it.rack || ""}
                        onChange={(e) => updateRow(idx, { rack: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => handleKey(e, idx, "rack")}
                        className="h-7 text-[12px] font-mono px-2 rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background uppercase"
                      />
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="qty"
                        type="number"
                        step="any"
                        value={it.qty || ""}
                        onChange={(e) => updateRow(idx, { qty: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "qty")}
                        className="h-7 text-[12px] font-mono px-2 text-right rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background font-bold text-foreground"
                      />
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="mrp"
                        type="number"
                        step="any"
                        value={it.mrp || ""}
                        onChange={(e) => updateRow(idx, { mrp: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "mrp")}
                        className="h-7 text-[12px] font-mono px-2 text-right rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background"
                      />
                    </td>

                    <td className="px-2 py-0.5 text-right tabular-nums text-muted-foreground align-middle">
                      {fmt(it.mrp)}
                    </td>

                    <td className="p-0.5">
                      <Input
                        data-row={idx}
                        data-col="disc"
                        type="number"
                        step="any"
                        value={it.discount_pct || ""}
                        onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "disc")}
                        className="h-7 text-[12px] font-mono px-2 text-right rounded-md border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background text-primary font-semibold"
                      />
                    </td>

                    <td className="px-2 py-0.5 text-right tabular-nums align-middle text-foreground/90">{fmt(it.net_rate)}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums font-bold text-foreground align-middle">{fmt(it.total)}</td>
                    
                    <td className="text-center print:hidden align-middle">
                      <button
                        onClick={() => delRow(idx)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors duration-150"
                        title="Evict row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {/* Native System Padding Spacer Blocks */}
              {Array.from({ length: Math.max(0, 4 - (items.length % 4)) }).map((_, i) => (
                <tr key={`sp-${i}`} className="border-b border-border/20 h-7 opacity-20 select-none pointer-events-none">
                  <td colSpan={13}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-sans font-bold text-foreground">
                <td colSpan={6} className="px-3 py-2.5 print:hidden">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={addRow}
                      className="text-[11px] text-primary hover:text-primary-glow inline-flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Append Row (Enter)
                    </button>
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="text-[11px] text-primary/80 hover:text-primary inline-flex items-center gap-1 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" /> Inject Spreadsheet
                    </button>
                    <button
                      onClick={downloadOrderTemplate}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Template
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-foreground border-t border-border font-mono">{fmt(totalQty)} Units</td>
                <td colSpan={4} className="border-t border-border"></td>
                <td className="px-2 py-2.5 text-right tabular-nums text-primary font-mono text-[13px] border-t border-border font-bold">
                  {fmt(totals.taxable + totals.gst_total)}
                </td>
                <td className="print:hidden border-t border-border"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Metrics Module Stack */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 border-t border-border/50 bg-muted/10">
          <div className="lg:col-span-7 space-y-3">
            <div className="bg-background/40 border border-border/40 p-3 rounded-2xl">
              <div className="text-[10px] text-muted-foreground uppercase font-sans font-bold tracking-widest mb-1 flex items-center gap-1">
                <Info className="h-3 w-3" /> System Narration & Log
              </div>
              <Input
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Append permanent notes/narration string onto this node transaction block..."
                className="h-8 text-[12px] font-mono px-2 rounded-lg border border-border/60 bg-card focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
            
            {rdBreakdown && (
              <div className="bg-background/40 border border-border/40 p-3 rounded-2xl text-[11px] grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
                <div className="text-muted-foreground">System Matrix Rule Discount</div>
                <div className="text-right tabular-nums text-foreground">{rdBreakdown.sys.toFixed(2)}%</div>
                <div className="text-muted-foreground">Contextual Rate Diff (Extra Allocation)</div>
                <div className="text-right tabular-nums text-accent font-bold">+{rdBreakdown.rdExtra.toFixed(2)}%</div>
                <div className="text-muted-foreground">Agreed Target Ledger Margin</div>
                <div className="text-right tabular-nums text-foreground">{rdBreakdown.agreed.toFixed(2)}%</div>
                <div className="font-bold border-t border-border/50 pt-1 text-primary">Calculated Final Margin Node</div>
                <div className="text-right tabular-nums font-bold border-t border-border/50 pt-1 text-primary">
                  {rdBreakdown.effective.toFixed(2)}%
                </div>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground/70 font-sans flex items-center gap-1 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-border inline-block"></span> Cryptographic e-Invoice Gateway Mapping: Disabled
            </div>
          </div>

          {/* Core Analytics Totals Box */}
          <div className="lg:col-span-5">
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-background/60 shadow-soft">
              <div className="px-3 py-1.5 text-[10px] uppercase font-sans font-bold tracking-widest text-muted-foreground bg-muted/50 border-b border-border/40">
                Ledger Balancing Diagnostics
              </div>
              <div className="p-3 text-[12px] space-y-1 font-mono">
                <TotalsRow label="Gross Aggregate Base (MRP)" value={fmt(totals.subtotal)} />
                <TotalsRow label="Aggregated Yield Discount" value={`− ${fmt(totals.discount_total)}`} />
                <div className="border-t border-border/30 my-1"></div>
                <TotalsRow label="Net Taxable Pool" value={fmt(totals.taxable)} bold />
                <TotalsRow label="Central CGST Pool" value={fmt(cgst)} />
                <TotalsRow label="State SGST Pool" value={fmt(sgst)} />
                <TotalsRow label="Fractional Round Off" value={(roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff))} />
                
                <div className="border-t-2 border-dashed border-border/60 mt-2 pt-2 flex items-center justify-between">
                  <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-primary">
                    Final Grand Value
                  </span>
                  <span className="font-mono font-bold text-xl text-primary tracking-tighter tabular-nums bg-primary/5 px-2.5 py-0.5 rounded-xl border border-primary/10 shadow-elegant-glow">
                    ₹{fmt(finalTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic A4 Standardized Print Template Footer */}
        <div className="hidden print:block p-4 text-[11px] border-t border-border/80 mt-12 bg-white text-black font-sans">
          <div className="grid grid-cols-3 gap-6 pt-4">
            <div>
              <div className="font-bold uppercase tracking-wider text-[10px] text-black mb-1">Standard Terms & Directives</div>
              <div className="text-neutral-500 text-[10px] leading-relaxed">
                Goods once evaluated and registered under this ledger allocation will not be rescinded. E. & O.E.
              </div>
            </div>
            <div className="text-center flex flex-col justify-end">
              <div className="border-t border-neutral-300 pt-1 text-[10px] font-medium text-neutral-600 uppercase">Authorized Consignee Signature</div>
            </div>
            <div className="text-right flex flex-col justify-end">
              <div className="border-t border-neutral-300 pt-1 text-[10px] font-bold text-neutral-900 uppercase">For Viswanath Automobiles Pvt. Ltd.</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { background: white !important; color: black !important; }
          .invoice-entry { font-size: 11px; padding: 0 !important; max-w-full !important; }
          input { border: none !important; background: transparent !important; padding: 0 !important; }
          .glass { backdrop-filter: none !important; background: transparent !important; }
        }
        :root { --invoice-bg: 60 30% 96%; }
        .dark { --invoice-bg: 240 8% 12%; }
      `}</style>
    </div>
  );
};

// Internal Scoped Sub-Component
const TotalsRow = ({ label, value, bold }: TotalsRowProps) => (
  <div className="flex items-baseline justify-between py-0.5">
    <span className="text-muted-foreground/90 font-sans">{label}</span>
    <span className={cn("tabular-nums font-mono text-foreground", bold ? "font-bold text-primary" : "")}>{value}</span>
  </div>
);

export default CreateOrder;
