import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, FileCheck2, Printer, FileDown, Plus, Trash2, Upload, FileSpreadsheet, Keyboard } from "lucide-react";
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

type Row = OrderItem & { hsn?: string; rack?: string };

const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "",
  rack: "",
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLS = ["part", "qty", "mrp", "disc"] as const;
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
  const [voucherType] = useState("Sales / Tax Invoice");
  const [salesman, setSalesman] = useState("");
  const [narration, setNarration] = useState("");
  const [items, setItems] = useState<Row[]>(Array.from({ length: 5 }, blankRow));
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(editId);

  // Auto-complete States
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  
  const day = useMemo(() => {
    return new Date(orderDate).toLocaleDateString("en-IN", { weekday: "long" });
  }, [orderDate]);

  useEffect(() => {
    document.title = "Accounting Voucher Creation — Tally ERP Mode";
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
            : Array.from({ length: 5 }, blankRow);
          setItems(rows);
          if (printOnLoad) setTimeout(() => window.print(), 600);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    }
  }, [user, editId]);

  useEffect(() => {
    if (!party) return;
    const def = Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) =>
      rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: def } : r)),
    );
    setPartyQuery(party.name);
  }, [partyId]);

  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8).then(setSearchResults).catch(() => setSearchResults([]));
    }, 120);
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
    if (!q) return parties.slice(0, 15);
    return parties.filter((p) => p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q))).slice(0, 15);
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
      hsn: "8708", // Mocking standard auto parts HSN for Tally feel
    });
    setSearchIdx(null);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => focusCell(idx, "qty"), 30);
  };

  const focusCell = (row: number, col: Col) => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
    el?.select();
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    const ci = COLS.indexOf(col);
    if (e.key === "Enter") {
      e.preventDefault();
      if (ci < COLS.length - 1) {
        focusCell(idx, COLS[ci + 1]);
      } else {
        if (idx === items.length - 1) {
          addRow();
          setTimeout(() => focusCell(idx + 1, "part"), 30);
        } else {
          focusCell(idx + 1, "part");
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(Math.min(items.length - 1, idx + 1), col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx === 0 && e.currentTarget.id === "part-0") return;
      focusCell(Math.max(0, idx - 1), col);
    }
  };

  const validRows = () => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user) return;
    const valid = validRows();
    if (status === "pending" && (!partyId || !valid.length)) {
      toast.error("Select party and add at least one item");
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
        toast.success("Voucher Acced / Accepted Successfully");
        navigate(`/orders?highlight=${saved.id}`);
      } else {
        toast.success("Voucher Draft Saved (Ctrl+S)", { duration: 1500 });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Keyboard Event Listener for Pure Tally Shortcuts
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
      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
      if (e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setUploadOpen(true);
      }
    };
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [items, partyId, user, draftId]);

  return (
    <div className="tally-erp-container w-full max-w-[1440px] mx-auto p-1 bg-[#1a2b23] text-[#000000] font-mono text-[13px] select-none antialiased">
      
      {/* Tally Classic Top Shortcut Ribbon Bar */}
      <div className="print:hidden w-full bg-[#244235] text-[#d1ebd7] text-[11px] px-2 py-1 flex items-center justify-between border-b border-[#14231c]">
        <div className="flex gap-4 items-center">
          <span className="font-sans text-yellow-400 font-bold flex items-center gap-1">
            <Keyboard className="w-3.5 h-3.5" /> TallyPrime v4.0 Grade Gateway
          </span>
          <span><u>P</u>: Print (Alt+P)</span>
          <span><u>E</u>: Export Template (Alt+E)</span>
          <span><u>I</u>: Import Excel (Alt+I)</span>
        </div>
        <div className="flex gap-2">
          {editMode && <span className="bg-amber-600 text-white px-1 text-[10px] font-sans">ALTERATION MODE</span>}
          <span className="bg-emerald-700 text-white px-1 text-[10px] font-sans">Productivity Matrix Active</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-12 gap-1 mt-1">
        
        {/* Main Voucher Body (Left 11 Columns) */}
        <div className="col-span-11 bg-[#eef6f0] border-2 border-[#376950] flex flex-col justify-between min-h-[820px] shadow-inner">
          
          <div>
            {/* Voucher Title Header */}
            <div className="bg-[#2a5941] text-white px-3 py-1 flex justify-between items-center text-xs font-bold shadow-md">
              <div>Accounting Voucher Creation</div>
              <div className="text-yellow-300 font-sans tracking-wide uppercase">{voucherType}</div>
              <div>Viswanath Automobiles Pvt. Ltd.</div>
            </div>

            {/* Voucher Master Metadata Input Blocks */}
            <div className="grid grid-cols-12 gap-x-6 gap-y-1.5 px-4 py-3 bg-[#e4efe7] border-b border-[#bddec8]">
              
              <div className="col-span-6 flex items-center gap-2">
                <span className="w-28 text-[#213f2f] font-bold">No.</span>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-40 h-5 px-1 bg-white border border-[#81a892] focus:bg-[#fefff0] focus:border-[#2a5941] outline-none font-bold text-[#111]"
                />
              </div>

              <div className="col-span-6 flex items-center justify-end gap-2">
                <span className="text-[#213f2f] font-bold">{day},</span>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-36 h-5 px-1 bg-white border border-[#81a892] focus:bg-[#fefff0] focus:border-[#2a5941] outline-none font-bold"
                />
              </div>

              <div className="col-span-6 flex items-center gap-2">
                <span className="w-28 text-muted-foreground">Ref. / Supplier No:</span>
                <input
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  placeholder="e.g. 40881X"
                  className="w-48 h-5 px-1 bg-white border border-[#96bca7] focus:bg-[#fefff0] outline-none"
                />
              </div>

              <div className="col-span-6 flex items-center justify-end gap-2">
                <span className="text-muted-foreground">Salesman Pointer:</span>
                <input
                  value={salesman}
                  onChange={(e) => setSalesman(e.target.value)}
                  className="w-48 h-5 px-1 bg-white border border-[#96bca7] focus:bg-[#fefff0] outline-none"
                />
              </div>

              {/* Party A/C Name Box Area */}
              <div className="col-span-12 flex items-start gap-2 pt-1 relative">
                <span className="w-28 text-[#2a5941] font-bold pt-0.5">Party A/c Name :</span>
                <div className="flex-1">
                  <input
                    value={partyQuery}
                    onChange={(e) => {
                      setPartyQuery(e.target.value);
                      setPartyOpen(true);
                    }}
                    onFocus={() => setPartyOpen(true)}
                    onBlur={() => setTimeout(() => setPartyOpen(false), 200)}
                    placeholder="Select Party Ledger from Ledger List..."
                    className="w-full h-5 px-1 bg-white border-b-2 border-[#2a5941] focus:bg-[#d8eddcf0] outline-none font-bold text-[14px] text-emerald-950 uppercase"
                  />
                  
                  {/* Tally Style Floating List of Ledgers Side Panel Popover */}
                  {partyOpen && partResults.length > 0 && (
                    <div className="absolute z-50 left-28 right-0 mt-0.5 bg-[#f4faf6] border-2 border-[#2a5941] shadow-2xl max-h-60 overflow-y-auto">
                      <div className="bg-[#2a5941] text-white text-[11px] px-2 py-0.5 font-bold tracking-wider uppercase">List of Ledger Accounts</div>
                      {partResults.map((p) => (
                        <div
                          key={p.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPartyId(p.id);
                            setPartyQuery(p.name);
                            setPartyOpen(false);
                          }}
                          className="px-3 py-1 cursor-pointer text-xs font-bold border-b border-[#daede1] hover:bg-[#2a5941] hover:text-white flex justify-between"
                        >
                          <span>{p.name.toUpperCase()}</span>
                          <span className="text-[11px] font-normal opacity-80">{p.discount_type} (Bal: ₹{fmt(Number(p.outstanding_balance))})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-Ledger Snapshot Details View */}
                  {party && (
                    <div className="mt-1.5 flex gap-4 text-[11px] text-[#334e3f] bg-[#dbece0] px-2 py-1 rounded-sm border border-[#bdd0c3]">
                      <span><b>GSTIN:</b> {party.gst || "UNREGISTERED"}</span>
                      <span>|</span>
                      <span><b>Current Balance:</b> ₹{fmt(Number(party.outstanding_balance))} Dr</span>
                      <span>|</span>
                      <span><b>Default Discount:</b> {Number(party.default_discount).toFixed(1)}%</span>
                      {party.beat && <><span>|</span> <span><b>Beat Field:</b> {party.beat}</span></>}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Tally Double Grid Structural Ledger Sheet */}
          <div className="flex-1 overflow-y-auto min-h-[400px] bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#32624a] text-white text-[11px] uppercase border-b border-[#1b3b2b]">
                  <th className="border-r border-[#1b3b2b] px-2 py-1 text-left w-8">Sl</th>
                  <th className="border-r border-[#1b3b2b] px-2 py-1 text-left">Particulars (Stock Item Description)</th>
                  <th className="border-r border-[#1b3b2b] px-2 py-1 text-right w-24">Quantity</th>
                  <th className="border-r border-[#1b3b2b] px-2 py-1 text-right w-28">Rate (MRP)</th>
                  <th className="border-r border-[#1b3b2b] px-2 py-1 text-right w-16">Disc %</th>
                  <th className="px-2 py-1 text-right w-32">Amount</th>
                  <th className="w-8 print:hidden bg-[#244235]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1ebd3]/40">
                {items.map((it, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-[#f6faf3] text-sm group">
                      
                      <td className="border-r border-[#c2d6ca] px-2 py-1 text-center text-[#5c7a69] text-xs font-bold">{idx + 1}</td>
                      
                      {/* Name of Item / Particulars Column */}
                      <td className="border-r border-[#c2d6ca] px-1 py-0.5 relative">
                        <input
                          id={`part-${idx}`}
                          data-row={idx}
                          data-col="part"
                          value={it.part_number}
                          onChange={(e) => {
                            updateRow(idx, { part_number: e.target.value.toUpperCase() });
                            setSearchIdx(idx);
                            setSearchTerm(e.target.value);
                          }}
                          onFocus={() => {
                            setSearchIdx(idx);
                            setSearch
