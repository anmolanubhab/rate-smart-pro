import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2, Printer, FileDown, Plus, Trash2, Upload, FileSpreadsheet } from "lucide-react";
import OrderExcelUpload from "@/components/OrderExcelUpload";
import { downloadOrderTemplate } from "@/lib/excelTemplates";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchParties, Party } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import {
  computeItem,
  computeTotals,
  nextOrderNumber,
  saveOrder,
  OrderItem,
  fetchOrder,
  fetchOrderItems,
} from "@/lib/orders";

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
  const [partyHighlightedIndex, setPartyHighlightedIndex] = useState(0);

  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState("");
  const [voucherType] = useState("TVS Tax Invoice");
  const [salesman, setSalesman] = useState("");
  const [narration, setNarration] = useState("");
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

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const day = useMemo(
    () => new Date(orderDate).toLocaleDateString("en-IN", { weekday: "long" }),
    [orderDate],
  );

  // Filtered party list based on input query
  const partResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 12);
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery]);

  // Exact Match Verification Logic
  const checkExactPartyMatch = (query: string, currentParties: Party[]) => {
    const cleanQuery = query.trim().toLowerCase();
    const exactMatch = currentParties.find((p) => p.name.trim().toLowerCase() === cleanQuery);
    if (exactMatch) {
      setPartyId(exactMatch.id);
      setPartyOpen(false);
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

  // Global Keydown Listeners for Shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave("draft");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave("pending");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        addRow();
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [items, partyId, user, orderNumber, orderDate, salesman, narration, refNo, party, saving]);

  useEffect(() => {
    document.title = "Invoice Entry — Spare Parts OMS";
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id)
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

  const pickProduct = (idx: number, p: Product) => {
    const def = party
      ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0
      : 0;
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
    const el = document.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
    el?.select();
  };

  // Keyboard navigation logic for Party A/c Name field
  const handlePartyKeyDown = (e: React.KeyboardEvent) => {
    if (partyOpen && partResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPartyHighlightedIndex((prev) => Math.min(prev + 1, partResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPartyHighlightedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selectedParty = partResults[partyHighlightedIndex];
        if (selectedParty) {
          setPartyId(selectedParty.id);
          setPartyQuery(selectedParty.name);
          setPartyOpen(false);
          setTimeout(() => focusCell(0, "part"), 10);
        }
        return;
      }
      if (e.key === "Escape") {
        setPartyOpen(false);
        return;
      }
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      focusCell(0, "part");
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

    // NORMAL GRID NAVIGATION
    const ci = COLS.indexOf(col);

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      
      if (col === "part") {
        const hasValidPart = items[idx].part_number.trim().length > 0;
        if (hasValidPart) {
          focusCell(idx, "desc");
        } else {
          if (idx === items.length - 1) addRow();
          setTimeout(() => focusCell(idx + 1, "part"), 10);
        }
        return;
      }

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
        notes: narration,
        remarks: refNo ? `Ref: ${refNo}` : null,
        mode: party?.discount_type ?? null,
        status,
        items: valid,
      });
      
      // Instantly pin saved id to prevent dual inserts
      setDraftId(saved.id);
      draftIdRef.current = saved.id;
      if (saved.order_number) {
        setOrderNumber(saved.order_number);
      }

      if (status === "pending") {
        toast.success("Invoice confirmed");
        navigate(`/orders?highlight=${saved.id}`);
      } else {
        toast.success("Draft saved", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="invoice-entry max-w-[1400px] mx-auto text-[13px] font-mono">
      {/* Top action bar */}
      <div className="print:hidden flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">
            {editMode ? (editStatus === "draft" ? "Editing Draft Invoice" : `Editing Invoice (${editStatus})`) : "New Invoice"}
          </span>
          {draftId && <Badge variant="outline" className="text-[10px]">#{orderNumber || draftId.slice(0, 8)}</Badge>}
          {editMode && editStatus === "draft" && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]">Draft</Badge>
          )}
          {dupSet.size > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]">
              Duplicate items
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)} className="h-8">
            <Upload className="h-3.5 w-3.5" /> Upload Excel
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadOrderTemplate} className="h-8">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSave("draft")} disabled={saving} className="h-8" title="Shortcut: Ctrl + S">
            <Save className="h-3.5 w-3.5" /> {editMode && editStatus === "draft" ? "Update Draft (Ctrl+S)" : "Save Draft (Ctrl+S)"}
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave("pending")}
            disabled={saving}
            className="h-8 gradient-primary text-white border-0"
            title="Shortcut: Ctrl + Enter"
          >
            <FileCheck2 className="h-3.5 w-3.5" /> Confirm Invoice (Ctrl+✍)
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8" title="Shortcut: Ctrl + P">
            <Printer className="h-3.5 w-3.5" /> Print (Ctrl+P)
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8">
            <FileDown className="h-3.5 w-3.5" /> PDF
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

      {/* Invoice sheet */}
      <div className="border border-border bg-[hsl(var(--invoice-bg,60_30%_96%))] shadow-soft print:shadow-none print:border-0">
        <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center justify-between text-xs">
          <div className="font-sans font-semibold tracking-wide">{voucherType}</div>
          <div className="font-sans">Viswanath Automobiles Pvt. Ltd. [TVS]</div>
          <div className="opacity-80">{day}</div>
        </div>

        {/* Header grid */}
        <div className="grid grid-cols-12 gap-x-3 gap-y-1 px-3 py-2 border-b border-border text-[12px]">
          <div className="col-span-2 text-muted-foreground">Voucher No</div>
          <div className="col-span-4">
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>
          <div className="col-span-2 text-muted-foreground text-right">Date</div>
          <div className="col-span-4">
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>

          <div className="col-span-2 text-muted-foreground">Reference No</div>
          <div className="col-span-4">
            <Input
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="11299/vishal"
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>
          <div className="col-span-2 text-muted-foreground text-right">Salesman</div>
          <div className="col-span-4">
            <Input
              value={salesman}
              onChange={(e) => setSalesman(e.target.value)}
              className="h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>

          <div className="col-span-2 text-muted-foreground">Party A/c Name</div>
          <div className="col-span-10 relative">
            <Input
              ref={partyInputRef}
              value={partyQuery}
              onChange={(e) => {
                setPartyQuery(e.target.value);
                setPartyOpen(true);
                setPartyHighlightedIndex(0);
                checkExactPartyMatch(e.target.value, parties);
              }}
              onFocus={() => {
                setPartyOpen(true);
                setPartyHighlightedIndex(0);
              }}
              onBlur={() => setTimeout(() => setPartyOpen(false), 150)}
              onKeyDown={handlePartyKeyDown}
              placeholder="Type to search party…"
              className="h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
            />
            {partyOpen && partResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-elegant max-h-64 overflow-auto">
                {partResults.map((p, i) => {
                  const isPartyHighlighted = partyHighlightedIndex === i;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setPartyId(p.id);
                        setPartyQuery(p.name);
                        setPartyOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 flex items-center justify-between gap-2 ${
                        isPartyHighlighted ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className={`text-[10px] ${isPartyHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {p.discount_type} · {Number(p.discount_type === "RD" ? p.agreed_discount : p.default_discount).toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {party && (
            <>
              <div className="col-span-2 text-muted-foreground">Current Balance</div>
              <div className="col-span-4 italic">
                ₹{fmt(Number(party.outstanding_balance) || 0)}{" "}
                <span className="text-muted-foreground not-italic">Dr</span>
              </div>
              <div className="col-span-2 text-muted-foreground text-right">GSTIN</div>
              <div className="col-span-4">{party.gst || "—"}</div>

              <div className="col-span-2 text-muted-foreground">Address</div>
              <div className="col-span-10 truncate">{party.billing_address || party.address || "—"}</div>

              <div className="col-span-12 flex flex-wrap gap-1.5 pt-1 font-sans">
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
              </div>
            </>
          )}
        </div>

        {/* Billing grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="text-left px-1.5 py-1 w-6">#</th>
                <th className="text-left px-1.5 py-1 min-w-[120px]">Name of Item</th>
                <th className="text-left px-1.5 py-1 min-w-[180px]">Description</th>
                <th className="text-left px-1.5 py-1 w-20">HSN/SAC</th>
                <th className="text-right px-1.5 py-1 w-14">GST %</th>
                <th className="text-left px-1.5 py-1 w-14">Rack</th>
                <th className="text-right px-1.5 py-1 w-16">Quantity</th>
                <th className="text-right px-1.5 py-1 w-20">MRP</th>
                <th className="text-right px-1.5 py-1 w-20">Rate</th>
                <th className="text-right px-1.5 py-1 w-14">Disc %</th>
                <th className="text-right px-1.5 py-1 w-20">Net Rate</th>
                <th className="text-right px-1.5 py-1 w-24">Amount</th>
                <th className="w-6 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const isDup = it.part_number.trim() && dupSet.has(it.part_number.trim().toLowerCase());
                return (
                  <tr
                    key={idx}
                    className={`border-b border-border/60 hover:bg-muted/30 ${
                      isDup ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
                    <td className="px-0.5 py-0.5 relative">
                      <Input
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
                                    Stk {p.stock}
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
                      <Input
                        data-row={idx}
                        data-col="desc"
                        value={it.description}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "desc")}
                        className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="hsn"
                        value={it.hsn || ""}
                        onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "hsn")}
                        className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="gst"
                        type="number"
                        step="any"
                        value={it.gst_pct || ""}
                        onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "gst")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="rack"
                        value={it.rack || ""}
                        onChange={(e) => updateRow(idx, { rack: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => handleKey(e, idx, "rack")}
                        className="h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary uppercase"
                      />
                    </td>
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
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="mrp"
                        type="number"
                        step="any"
                        value={it.mrp || ""}
                        onChange={(e) => updateRow(idx, { mrp: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "mrp")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
                    </td>
                    <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">
                      {fmt(it.mrp)}
                    </td>
                    <td className="px-0.5 py-0.5">
                      <Input
                        data-row={idx}
                        data-col="disc"
                        type="number"
                        step="any"
                        value={it.discount_pct || ""}
                        onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })}
                        onKeyDown={(e) => handleKey(e, idx, "disc")}
                        className="h-6 text-[12px] font-mono px-1 text-right rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary"
                      />
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
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, 4 - (items.length % 4)) }).map((_, i) => (
                <tr key={`sp-${i}`} className="border-b border-border/30 h-6">
                  <td colSpan={13}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
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
                <td colSpan={4}></td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmt(totals.taxable + totals.gst_total)}</td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Bottom section: narration + totals */}
        <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
          <div className="col-span-12 md:col-span-7 space-y-2">
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

          <div className="col-span-12 md:col-span-5">
            <div className="border border-border bg-card/60">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border font-sans">
                Invoice Totals
              </div>
              <div className="px-2 py-1.5 text-[12px] space-y-0.5">
                <Row label="Subtotal (MRP)" value={fmt(totals.subtotal)} />
                <Row label="Discount" value={`− ${fmt(totals.discount_total)}`} />
                <Row label="Taxable Amount" value={fmt(totals.taxable)} bold />
                <Row label="CGST" value={fmt(cgst)} />
                <Row label="SGST" value={fmt(sgst)} />
                <Row label="Round Off" value={(roundOff >= 0 ? "+ " : "− ") + fmt(Math.abs(roundOff))} />
                <div className="border-t border-border mt-1 pt-2 flex items-baseline justify-between bg-primary/10 px-2 py-1 rounded">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-foreground font-sans">
                    Grand Total
                  </span>
                  <span className="font-extrabold text-lg text-primary tabular-nums">
                    ₹{fmt(finalTotal)}
                  </span>
                </div>
              </div>
            </div>
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
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }

          html,
          body {
            background: white !important;
            overflow: visible !important;
            height: auto !important;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .print\\:hidden {
            display: none !important;
          }

          .invoice-entry {
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
            font-size: 11px;
            color: black !important;
            background: white !important;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
            position: relative;
          }

          tbody tr {
            position: relative;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-footer-group;
          }
        }

        :root {
          --invoice-bg: 60 30% 96%;
        }

        .dark {
          --invoice-bg: 240 8% 12%;
        }
      `}</style>
    </div>
  );
};

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
  </div>
);

export default CreateOrder;
