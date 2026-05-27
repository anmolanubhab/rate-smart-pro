import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

// ==========================================
// TYPES & INTERFACES
// ==========================================
interface OrderItem {
  id?: string;
  product_id?: string;
  part_number: string;
  description: string;
  qty: number;
  mrp: number;
  discount_pct: number;
  gst_pct: number;
  net_rate: number;
  total: number;
  stock?: number;
  vehicle_model?: string;
}

type Row = OrderItem & { hsn?: string; rack?: string };

interface Party {
  id: string;
  name: string;
  phone?: string;
  beat?: string;
  discount_type: 'RD' | 'NORMAL';
  agreed_discount: number;
  default_discount: number;
  outstanding_balance?: number;
  gst?: string;
  billing_address?: string;
  shipping_address?: string;
  address?: string;
}

// Dummy Mock Services
const useAuth = () => ({ user: { id: "user_123" } });
const fetchParties = async (userId: string): Promise<Party[]> => [];
const nextOrderNumber = async (userId: string): Promise<string> => "INV-2026-001";
const fetchOrder = async (id: string): Promise<any> => ({});
const fetchOrderItems = async (id: string): Promise<any[]> => [];
const saveOrder = async (data: any): Promise<any> => ({ id: data.id || "new_id" });

const computeItem = (item: Partial<Row>): Row => {
  const qty = Number(item.qty) || 0;
  const mrp = Number(item.mrp) || 0;
  const discount_pct = Number(item.discount_pct) || 0;
  const gst_pct = Number(item.gst_pct) || 18;
  const discountAmount = mrp * (discount_pct / 100);
  const net_rate = mrp - discountAmount;
  const total = net_rate * qty;
  return {
    part_number: item.part_number || "",
    description: item.description || "",
    qty, mrp, discount_pct, gst_pct, net_rate, total,
    hsn: item.hsn || "",
    rack: item.rack || "",
    stock: item.stock, product_id: item.product_id, vehicle_model: item.vehicle_model,
  };
};

const computeTotals = (items: Row[]) => {
  let subtotal = 0, discountTotal = 0, taxable = 0, gst_total = 0;
  items.forEach(item => {
    const itemSub = item.mrp * item.qty;
    subtotal += itemSub;
    discountTotal += itemSub * (item.discount_pct / 100);
    taxable += item.net_rate * item.qty;
    gst_total += (item.net_rate * item.qty) * (item.gst_pct / 100);
  });
  return { subtotal, discount_total: discountTotal, taxable, gst_total, grand_total: taxable + gst_total };
};

const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "", rack: "",
});

const Input = React.forwardRef(({ type = "text", ...props }: any, ref: any) => (
  <input ref={ref} type={type} className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 font-mono" {...props} />
));
Input.displayName = "Input";

const ProductSearchDialog = ({ open, onSelect }: any) => {
  if (!open) return null;
  return (
    <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-400 z-50 p-2 shadow-md rounded">
      <div className="text-xs text-gray-500 p-1">Search Results:</div>
      <button type="button" className="w-full text-left p-1 hover:bg-blue-100 text-sm" onClick={() => onSelect({ id: "p1", part_number: "PART-123", name: "Premium Brake Pad", mrp: 1200, gst_pct: 18, vehicle_model: "SUV" })} >
        PART-123 - Premium Brake Pad (₹1200)
      </button>
    </div>
  );
};

// ==========================================
// MEMOIZED PRODUCT GRID (SUPER LITE)
// ==========================================
const ProductGrid = React.memo(({ items, onUpdateRow, onDeleteRow, onAddRow, defaultDiscount }: any) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const focusCell = (row: number, col: string) => {
    inputRefs.current[`${row}-${col}`]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: string) => {
    const cols = ['part', 'description', 'hsn', 'gst', 'rack', 'qty', 'mrp', 'discount_pct'];
    const currentIdx = cols.indexOf(col);
    
    if (e.key === 'F2') {
      e.preventDefault();
      setSearchRow(row);
      setSearchOpen(true);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (currentIdx < cols.length - 1) focusCell(row, cols[currentIdx + 1]);
      else if (row === items.length - 1) {
        onAddRow();
        setTimeout(() => focusCell(row + 1, 'part'), 10);
      } else focusCell(row + 1, 'part');
    } else if (e.key === 'ArrowUp' && row > 0) { e.preventDefault(); focusCell(row - 1, col);
    } else if (e.key === 'ArrowDown' && row < items.length - 1) { e.preventDefault(); focusCell(row + 1, col); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300 font-semibold text-gray-700">
            <th className="p-2 w-8">#</th>
            <th className="p-2 min-w-[120px]">Part Number (F2)</th>
            <th className="p-2 min-w-[180px]">Description</th>
            <th className="p-2 w-20">HSN</th>
            <th className="p-2 w-16 text-right">GST%</th>
            <th className="p-2 w-16">Rack</th>
            <th className="p-2 w-16 text-right">Qty</th>
            <th className="p-2 w-20 text-right">MRP</th>
            <th className="p-2 w-16 text-right">Disc%</th>
            <th className="p-2 w-24 text-right">Net Rate</th>
            <th className="p-2 w-24 text-right">Amount</th>
            <th className="p-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: Row, idx: number) => (
            <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="p-2 text-gray-500 font-mono text-center">{idx + 1}</td>
              <td className="p-1 relative">
                <Input ref={(el: any) => { inputRefs.current[`${idx}-part`] = el; }} value={item.part_number}
                  onChange={(e: any) => onUpdateRow(idx, { part_number: e.target.value.toUpperCase() })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'part')} placeholder="F2 to search" />
                {searchOpen && searchRow === idx && (
                  <ProductSearchDialog open={searchOpen} onSelect={(product: any) => {
                    onUpdateRow(idx, { product_id: product.id, part_number: product.part_number, description: product.name, vehicle_model: product.vehicle_model, mrp: product.mrp, gst_pct: product.gst_pct, discount_pct: item.discount_pct || defaultDiscount, qty: item.qty || 1 });
                    setSearchOpen(false); setSearchRow(null);
                    setTimeout(() => focusCell(idx, 'qty'), 10);
                  }} />
                )}
              </td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-description`] = el; }} value={item.description} onChange={(e: any) => onUpdateRow(idx, { description: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'description')} /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-hsn`] = el; }} value={item.hsn || ''} onChange={(e: any) => onUpdateRow(idx, { hsn: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'hsn')} /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-gst`] = el; }} type="number" value={item.gst_pct || ''} onChange={(e: any) => onUpdateRow(idx, { gst_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'gst')} className="text-right" /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-rack`] = el; }} value={item.rack || ''} onChange={(e: any) => onUpdateRow(idx, { rack: e.target.value.toUpperCase() })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'rack')} /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-qty`] = el; }} type="number" value={item.qty || ''} onChange={(e: any) => onUpdateRow(idx, { qty: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'qty')} className="text-right" /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-mrp`] = el; }} type="number" value={item.mrp || ''} onChange={(e: any) => onUpdateRow(idx, { mrp: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'mrp')} className="text-right" /></td>
              <td className="p-1"><Input ref={(el: any) => { inputRefs.current[`${idx}-discount_pct`] = el; }} type="number" value={item.discount_pct || ''} onChange={(e: any) => onUpdateRow(idx, { discount_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'discount_pct')} className="text-right" /></td>
              <td className="p-2 text-right font-mono text-gray-600">₹{item.net_rate.toFixed(2)}</td>
              <td className="p-2 text-right font-mono font-semibold text-blue-600">₹{item.total.toFixed(2)}</td>
              <td className="p-1 text-center"><button type="button" onClick={() => onDeleteRow(idx)} className="text-red-500 font-bold hover:text-red-700">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs text-gray-600">
        <div>Items: {items.filter(i => i.qty > 0).length} • Total Qty: {items.reduce((s, i) => s + (i.qty || 0), 0)}</div>
        <button type="button" onClick={onAddRow} className="text-blue-600 hover:underline font-medium">+ Add Row (Ctrl+Shift+A)</button>
      </div>
    </div>
  );
});
ProductGrid.displayName = "ProductGrid";

// ==========================================
// MAIN CONTAINER
// ==========================================
export const CreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const editId = routeParams.id || params.get("id");
  
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [partyDropdown, setPartyDropdown] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  
  const [items, setItems] = useState<Row[]>(() => [blankRow(), blankRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id).then(setParties).catch(() => {});
    if (!editId) { nextOrderNumber(user.id).then(setOrderNumber).catch(() => {});
    } else { loadExistingOrder(); }
  }, [user, editId]);

  const loadExistingOrder = async () => {
    if (!editId) return;
    try {
      const o = await fetchOrder(editId);
      const its = await fetchOrderItems(editId);
      setOrderNumber(o.order_number);
      setPartyId(o.party_id || "");
      const rows: Row[] = its.length ? its.map((it: any) => ({ ...computeItem(it), hsn: "", rack: "" })) : [blankRow(), blankRow()];
      setItems(rows);
    } catch (e: any) { toast.error(e.message); }
  };

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const defaultDiscount = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;

  const filteredParties = useMemo(() => {
    if (!partySearch.trim()) return parties.slice(0, 5);
    return parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 5);
  }, [parties, partySearch]);

  const totals = useMemo(() => computeTotals(items), [items]);
  const finalTotal = Math.round(totals.grand_total);

  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setItems((rows) => {
      const updated = [...rows];
      updated[idx] = { ...computeItem({ ...updated[idx], ...patch }), hsn: patch.hsn !== undefined ? patch.hsn : updated[idx].hsn, rack: patch.rack !== undefined ? patch.rack : updated[idx].rack } as Row;
      return updated;
    });
  }, []);

  const delRow = useCallback((idx: number) => {
    setItems((r) => (r.length <= 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));
  }, []);

  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user) return;
    const valid = items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
    if (status === "pending" && (!partyId || !valid.length)) {
      toast.error("Select party and items");
      return;
    }
    try {
      setSaving(true);
      await saveOrder({ userId: user.id, order_number: orderNumber, order_date: orderDate, party_id: partyId || null, status, items: valid, notes: narration });
      toast.success(status === "pending" ? "Confirmed!" : "Draft Saved");
      if (status === "pending") navigate('/orders');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    const hk = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave("draft"); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave("pending"); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') { e.preventDefault(); setItems(r => [...r, blankRow()]); }
    };
    window.addEventListener('keydown', hk);
    return () => window.removeEventListener('keydown', hk);
  }, [items, partyId, orderNumber, narration]);

  return (
    <div className="w-full min-h-screen bg-gray-50 text-gray-900 font-sans p-4">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap justify-between items-center bg-white p-3 border border-gray-300 rounded mb-4 shadow-sm">
        <div>
          <span className="text-xs text-gray-500 font-bold">INVOICE</span>
          <h1 className="text-xl font-mono font-bold text-gray-800">#{orderNumber || 'Loading...'}</h1>
        </div>
        <div className="text-sm font-medium">Date: {orderDate}</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setItems(r => [...r, blankRow()])} className="bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-xs font-medium rounded">Add Row</button>
          <button type="button" onClick={() => handleSave("draft")} disabled={saving} className="bg-amber-500 text-white hover:bg-amber-600 px-4 py-1.5 text-xs font-medium rounded">Save Draft (Ctrl+S)</button>
          <button type="button" onClick={() => handleSave("pending")} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-1.5 text-xs font-medium rounded">Confirm (Ctrl+Enter)</button>
        </div>
      </div>

      {/* WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-gray-300 p-4 rounded shadow-sm">
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Select Party / Customer</label>
            <div className="relative">
              <input type="text" value={partySearch} 
                onChange={(e) => { setPartySearch(e.target.value); setPartyDropdown(true); }} 
                onFocus={() => setPartyDropdown(true)} 
                placeholder="Type to search party..." 
                className="w-full h-9 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
              {partyDropdown && filteredParties.length > 0 && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-400 mt-1 z-50 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filteredParties.map((p) => (
                    <button key={p.id} type="button" 
                      onClick={() => { setPartyId(p.id); setPartySearch(p.name); setPartyDropdown(false); }} 
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b border-gray-100 last:border-0 flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-xs bg-gray-200 px-1 rounded font-mono">₹{p.outstanding_balance || 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {party && (
              <div className="mt-2 text-xs grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                <div><b>GSTIN:</b> <span className="font-mono">{party.gst || 'N/A'}</span></div>
                <div><b>Phone:</b> {party.phone || 'N/A'}</div>
                <div className="col-span-2"><b>Address:</b> {party.billing_address || party.address || 'N/A'}</div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-300 font-semibold text-sm">Invoice Items</div>
            <ProductGrid items={items} onUpdateRow={updateRow} onDeleteRow={delRow} onAddRow={() => setItems((r) => [...r, blankRow()])} defaultDiscount={defaultDiscount} />
          </div>

          <div className="bg-white border border-gray-300 p-4 rounded shadow-sm">
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Narration / Remarks</label>
            <input type="text" value={narration} onChange={(e) => setNarration(e.target.value)} className="w-full h-9 px-2 text-sm border border-gray-300 rounded focus:outline-none" placeholder="Add invoice notes..." />
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-300 rounded shadow-sm p-4 sticky top-20">
            <h3 className="text-sm font-bold uppercase text-gray-700 border-b pb-2 mb-3">Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span>Subtotal (MRP):</span><span className="font-mono">₹{totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-green-600"><span>Discount:</span><span className="font-mono">-₹{totals.discount_total.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2 text-gray-800"><span>Taxable Value:</span><span className="font-mono">₹{totals.taxable.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-500"><span>GST Amount:</span><span className="font-mono">₹{totals.gst_total.toFixed(2)}</span></div>
            </div>
            <div className="border-t-2 border-dashed my-4"></div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-gray-800">Grand Total:</span>
              <span className="text-2xl font-bold font-mono text-blue-600">₹{finalTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrder;
