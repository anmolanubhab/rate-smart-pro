import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Save, CheckCircle, Printer, Download, Upload, Plus, Clock, AlertCircle,
  Building2, Phone, MapPin, Hash, TrendingUp, BadgePercent, Star, History,
  Trash2, Package, Percent, Banknote, ChevronDown, ChevronUp 
} from 'lucide-react';

// ==========================================
// TYPES & INTERFACES [cite: 4]
// ==========================================
interface OrderItem {
  id?: string;
  product_id?: string;
  part_number: string;
  description: string;
  qty: number;
  mrp: number; [cite: 5]
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
  phone?: string; [cite: 7]
  beat?: string;
  discount_type: 'RD' | 'NORMAL';
  agreed_discount: number;
  default_discount: number;
  outstanding_balance?: number;
  gst?: string;
  billing_address?: string;
  shipping_address?: string; [cite: 8]
  address?: string;
}

// Dummy mock dependencies [cite: 8]
const useAuth = () => ({ user: { id: "user_123" } }); [cite: 8]
const fetchParties = async (userId: string): Promise<Party[]> => []; [cite: 9]
const nextOrderNumber = async (userId: string): Promise<string> => "INV-2026-001"; [cite: 9]
const fetchOrder = async (id: string): Promise<any> => ({}); [cite: 10]
const fetchOrderItems = async (id: string): Promise<any[]> => []; [cite: 10]
const saveOrder = async (data: any): Promise<any> => ({ id: data.id || "new_id" }); [cite: 11]

const computeItem = (item: Partial<Row>): Row => { [cite: 12]
  const qty = Number(item.qty) || 0; [cite: 12]
  const mrp = Number(item.mrp) || 0; [cite: 12, 13]
  const discount_pct = Number(item.discount_pct) || 0; [cite: 13]
  const gst_pct = Number(item.gst_pct) || 18; [cite: 13]
  const discountAmount = mrp * (discount_pct / 100); [cite: 14]
  const net_rate = mrp - discountAmount; [cite: 14]
  const total = net_rate * qty; [cite: 14]
  return { [cite: 15]
    part_number: item.part_number || "", [cite: 15]
    description: item.description || "", [cite: 15, 16]
    qty,
    mrp,
    discount_pct,
    gst_pct,
    net_rate,
    total,
    hsn: item.hsn || "", [cite: 16, 17]
    rack: item.rack || "", [cite: 17]
    stock: item.stock,
    product_id: item.product_id,
    vehicle_model: item.vehicle_model,
  }; [cite: 17]
};

const computeTotals = (items: Row[]) => { [cite: 18]
  let subtotal = 0;
  let discountTotal = 0;
  let taxable = 0; [cite: 19]
  let gst_total = 0;

  items.forEach(item => { [cite: 19]
    const itemSub = item.mrp * item.qty; [cite: 19]
    subtotal += itemSub; [cite: 19]
    discountTotal += itemSub * (item.discount_pct / 100); [cite: 19]
    taxable += item.net_rate * item.qty; [cite: 19]
    gst_total += (item.net_rate * item.qty) * (item.gst_pct / 100); [cite: 19]
  }); [cite: 19]
  return { [cite: 20]
    subtotal,
    discount_total: discountTotal,
    taxable,
    gst_total,
    grand_total: taxable + gst_total
  }; [cite: 20]
};

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '); [cite: 21]
const blankRow = (): Row => ({ [cite: 22]
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }), [cite: 22]
  hsn: "", [cite: 22]
  rack: "", [cite: 22]
});

const Badge = ({ children, className }: any) => ( [cite: 23]
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", className)}>{children}</span> [cite: 23]
);

const Button = React.forwardRef(({ children, className, ...props }: any, ref: any) => ( [cite: 24]
  <button ref={ref} className={cn("px-3 py-1.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center", className)} {...props}>{children}</button> [cite: 24]
));
Button.displayName = "Button";

const Input = React.forwardRef(({ className, type = "text", ...props }: any, ref: any) => ( [cite: 25]
  <input ref={ref} type={type} className={cn("flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20", className)} {...props} /> [cite: 25]
));
Input.displayName = "Input";

const Avatar = ({ children, className }: any) => <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>{children}</div>; [cite: 26]
const AvatarFallback = ({ children, className }: any) => <div className={cn("flex h-full w-full items-center justify-center rounded-full bg-gray-100 text-sm font-medium", className)}>{children}</div>; [cite: 27]

const ProductSearchDialog = ({ open, onSelect }: any) => { [cite: 28]
  if (!open) return null; [cite: 28]
  return ( [cite: 29]
    <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-sm border border-gray-200 z-50 p-2">
      <div className="text-xs text-gray-400 p-2">Press enter on search result mock...</div> [cite: 29]
      <button 
        className="w-full text-left p-2 hover:bg-blue-50 rounded text-sm"
        onClick={() => onSelect({ id: "p1", part_number: "PART-123", name: "Premium Brake Pad", mrp: 1200, gst_pct: 18, vehicle_model: "SUV" })} [cite: 29]
      >
        PART-123 - Premium Brake Pad (₹1200)
      </button> [cite: 30]
    </div>
  );
};
const OrderExcelUpload = ({ open, onOpenChange, onImport }: any) => null; [cite: 30]

const useInvoiceKeyboard = ({ onSaveDraft, onConfirm, onPrint, onAddRow }: { onSaveDraft: () => void, onConfirm: () => void, onPrint: () => void, onAddRow: () => void }) => { [cite: 35]
  useEffect(() => { [cite: 35]
    const handleKeyDown = (e: KeyboardEvent) => { [cite: 35]
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSaveDraft(); } [cite: 35]
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); onPrint(); } [cite: 35]
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onConfirm(); } [cite: 35]
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') { e.preventDefault(); onAddRow(); } [cite: 36]
    };
    window.addEventListener('keydown', handleKeyDown); [cite: 36]
    return () => window.removeEventListener('keydown', handleKeyDown); [cite: 36]
  }, [onSaveDraft, onConfirm, onPrint, onAddRow]); [cite: 36]
};

// ==========================================
// SUB-COMPONENTS
// ==========================================
const InvoiceHeader = ({
  orderNumber, orderDate, status, isSaving, lastSaved,
  onSaveDraft, onConfirm, onPrint, onDownloadPDF, onUpload, onAddRow
}: any) => {
  const [showShortcuts, setShowShortcuts] = useState(false); [cite: 37]
  return ( [cite: 38]
    <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm text-gray-500 font-medium">INVOICE</div> [cite: 38]
            <div className="text-2xl font-bold text-gray-900 tracking-tight">#{orderNumber}</div> [cite: 38]
          </div>
          <div className="h-8 w-px bg-gray-200" [cite: 38] /> [cite: 39]
          <div>
            <div className="text-sm text-gray-500">Date</div> [cite: 39]
            <div className="text-base font-semibold">{orderDate}</div> [cite: 39]
          </div>

          <Badge className={cn("px-3 py-1 text-sm font-medium", status === 'draft' && "border-amber-500 text-amber-700 bg-amber-50", status === 'pending' && "bg-blue-500 text-white", status === 'confirmed' && "bg-green-500 text-white")}> [cite: 39]
            {status === 'draft' && <AlertCircle className="w-3 h-3 mr-1" />} [cite: 40]
            {status === 'pending' && <Clock className="w-3 h-3 mr-1" />} [cite: 40]
            {status === 'confirmed' && <CheckCircle className="w-3 h-3 mr-1" />} [cite: 40]
            {status.toUpperCase()} [cite: 40]
          </Badge>

          {isSaving && ( [cite: 40]
            <div className="flex items-center gap-2 text-sm text-gray-500"> [cite: 40]
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /> [cite: 41]
              Saving...
            </div>
          )}
          {lastSaved && !isSaving && ( [cite: 41]
            <div className="text-xs text-gray-400"> [cite: 41]
              Saved {new Date().getTime() - lastSaved.getTime() < 1000 ? 'just now' : `at ${lastSaved.toLocaleTimeString()}`} [cite: 42]
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(!showShortcuts)} className="text-gray-500">⌨️</Button> [cite: 42]
          <Button variant="outline" size="sm" onClick={onAddRow} className="gap-2"><Plus className="w-4 h-4" />Add Row</Button> [cite: 42]
          <Button variant="outline" size="sm" onClick={onUpload} className="gap-2"><Upload className="w-4 h-4" />Upload</Button> [cite: 43]
          <Button variant="outline" size="sm" onClick={onPrint} className="gap-2"><Printer className="w-4 h-4" />Print</Button> [cite: 43]
          <Button variant="outline" size="sm" onClick={onDownloadPDF} className="gap-2"><Download className="w-4 h-4" />PDF</Button> [cite: 43]
          <Button variant="outline" size="sm" onClick={onSaveDraft} className="gap-2"><Save className="w-4 h-4" />Save Draft</Button> [cite: 43]
          <Button size="sm" onClick={onConfirm} className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-sm transition-all"><CheckCircle className="w-4 h-4" />Confirm Invoice</Button> [cite: 43, 44]
        </div>

        {showShortcuts && ( [cite: 44]
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-sm border border-gray-200 p-4 z-50"> [cite: 44]
            <div className="text-sm font-semibold mb-3">Keyboard Shortcuts</div> [cite: 44]
            <div className="space-y-2 text-sm"> [cite: 44]
              <div className="flex justify-between"><span>Save Draft</span><span>Ctrl + S</span></div> [cite: 44, 45]
              <div className="flex justify-between"><span>Print Invoice</span><span>Ctrl + P</span></div> [cite: 45]
              <div className="flex justify-between"><span>Confirm Invoice</span><span>Ctrl + Enter</span></div> [cite: 45]
              <div className="flex justify-between"><span>Add New Row</span><span>Ctrl + Shift + A</span></div> [cite: 45]
            </div> [cite: 46]
          </div>
        )}
      </div>
    </div>
  );
};

const PartyCard = ({ party, parties, onSelect }: { party: Party | null, parties: Party[], partyQuery: string, onSelect: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false); [cite: 47]
  const [searchTerm, setSearchTerm] = useState(party?.name || ''); [cite: 48]

  const filteredParties = useMemo(() => { [cite: 48]
    if (!searchTerm.trim()) return parties.slice(0, 8); [cite: 48]
    return parties.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 8); [cite: 48]
  }, [parties, searchTerm]); [cite: 48]

  const getInitials = (name: string) => name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2); [cite: 49]
  const getBalanceColor = (balance: number) => balance > 50000 ? 'text-red-600' : balance > 10000 ? 'text-orange-500' : 'text-yellow-600'; [cite: 50]

  return ( [cite: 51]
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm p-6"> [cite: 51]
      <div className="flex items-start justify-between mb-4"> [cite: 51]
        <div className="flex items-center gap-3"> [cite: 51]
          <Avatar className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold"> [cite: 51]
            <AvatarFallback>{party ? getInitials(party.name) : '?'}</AvatarFallback> [cite: 51]
          </Avatar> [cite: 51]
          <div> [cite: 51]
            <div className="relative"> [cite: 52]
              <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} onBlur={() => setTimeout(() => setIsOpen(false), 200)} placeholder="Search or select party..." className="text-xl font-bold bg-transparent border-0 focus:ring-0 p-0 placeholder:text-gray-300 outline-none w-full" /> [cite: 52]
              {isOpen && filteredParties.length > 0 && ( [cite: 52]
                <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-sm border border-gray-200 z-50 max-h-96 overflow-auto"> [cite: 52]
                  {filteredParties.map((p) => ( [cite: 53]
                    <button key={p.id} onClick={() => { onSelect(p.id); setSearchTerm(p.name); setIsOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex justify-between items-center"> [cite: 53, 54]
                      <div> [cite: 54]
                        <div className="font-semibold text-gray-900">{p.name}</div> [cite: 54]
                        <div className="text-xs text-gray-500 mt-1">{p.phone && <span className="mr-3">📱 {p.phone}</span>}{p.beat && <span>📍 {p.beat}</span>}</div> [cite: 54]
                      </div> [cite: 55]
                      <Badge className="text-xs">{p.discount_type} {p.discount_type === 'RD' ? p.agreed_discount : p.default_discount}%</Badge> [cite: 55, 56]
                    </button> [cite: 56]
                  ))}
                </div> [cite: 56]
              )}
            </div> [cite: 56]
            {party && ( [cite: 56]
              <div className="flex items-center gap-2 mt-1"> [cite: 57]
                <Badge className="text-xs gap-1 bg-gray-100"><Building2 className="w-3 h-3" />{party.discount_type} Mode</Badge> [cite: 57]
                <Badge className="text-xs gap-1 bg-gray-100"><BadgePercent className="w-3 h-3" />Default {Number(party.default_discount).toFixed(1)}%</Badge> [cite: 57]
                {party.discount_type === 'RD' && <Badge className="text-xs gap-1 bg-amber-50"><Star className="w-3 h-3 text-amber-500" />Agreed {Number(party.agreed_discount).toFixed(1)}%</Badge>} [cite: 57]
              </div> [cite: 58]
            )}
          </div> [cite: 58]
        </div> [cite: 58]
        {party && ( [cite: 58]
          <div className="text-right"> [cite: 58]
            <div className="text-sm text-gray-500">Outstanding</div> [cite: 58]
            <div className={cn("text-2xl font-bold", getBalanceColor(party.outstanding_balance || 0))}>₹{(party.outstanding_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div> [cite: 58, 59]
            <div className="text-xs text-gray-400 mt-1">Due</div> [cite: 59]
          </div> [cite: 59]
        )}
      </div> [cite: 59]

      {party && ( [cite: 59]
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200"> [cite: 59]
          <div className="flex items-start gap-2"><Phone className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Contact</div><div className="text-sm font-medium">{party.phone || '—'}</div></div></div> [cite: 59]
          <div className="flex items-start gap-2"><Hash className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">GSTIN</div><div className="text-sm font-mono">{party.gst || '—'}</div></div></div> [cite: 60]
          <div className="flex items-start gap-2 col-span-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Address</div><div className="text-sm">{party.billing_address || party.address || '—'}</div></div></div> [cite: 60, 61]
          {party.beat && <div className="flex items-start gap-2"><TrendingUp className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Beat</div><div className="text-sm">{party.beat}</div></div></div>} [cite: 61]
        </div> [cite: 61]
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2"> [cite: 61]
        <button className="flex-1 text-center py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><History className="w-4 h-4 mx-auto mb-1" />Recent Invoices</button> [cite: 61]
        <button className="flex-1 text-center py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><TrendingUp className="w-4 h-4 mx-auto mb-1" />Pending Orders</button> [cite: 61]
      </div> [cite: 61]
    </div> [cite: 62]
  );
};

// ==========================================
// MEMOIZED PRODUCT GRID [cite: 91]
// ==========================================
const ProductGrid = React.memo(({ items, dupSet, onUpdateRow, onDeleteRow, onAddRow, defaultDiscount }: any) => {
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null); [cite: 62, 63]
  const [searchOpen, setSearchOpen] = useState(false); [cite: 63]
  const [searchRow, setSearchRow] = useState<number | null>(null); [cite: 63]
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({}); [cite: 64]

  const focusCell = (row: number, col: string) => { [cite: 65]
    const key = `${row}-${col}`; [cite: 65]
    inputRefs.current[key]?.focus(); [cite: 65]
    inputRefs.current[key]?.select(); [cite: 65]
  }; [cite: 65]

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: string) => { [cite: 66]
    const cols = ['part', 'description', 'hsn', 'gst', 'rack', 'qty', 'mrp', 'discount_pct']; [cite: 66]
    const currentIdx = cols.indexOf(col); [cite: 67]
    
    // Press F2 to Toggle Product Search
    if (e.key === 'F2') {
      e.preventDefault();
      setSearchRow(row);
      setSearchOpen(true);
      return;
    }

    if (e.key === 'Enter') { [cite: 67]
      e.preventDefault(); [cite: 67]
      if (currentIdx < cols.length - 1) focusCell(row, cols[currentIdx + 1]); [cite: 68]
      else if (row === items.length - 1) { onAddRow(); [cite: 68]
        setTimeout(() => focusCell(row + 1, 'part'), 50); } [cite: 69]
      else focusCell(row + 1, 'part'); [cite: 69]
    } else if (e.key === 'Tab') { [cite: 70]
      e.preventDefault(); [cite: 70]
      if (currentIdx < cols.length - 1) focusCell(row, cols[currentIdx + 1]); [cite: 71]
      else focusCell(row + 1, 'part'); [cite: 71]
    } else if (e.key === 'ArrowUp' && row > 0) { e.preventDefault(); focusCell(row - 1, col); [cite: 72]
    } else if (e.key === 'ArrowDown' && row < items.length - 1) { e.preventDefault(); [cite: 73]
      focusCell(row + 1, col); } [cite: 74]
  };

  return ( [cite: 74]
    <div className="overflow-x-auto"> [cite: 74]
      <table className="w-full text-sm border-collapse"> [cite: 74]
        <thead> [cite: 74]
          <tr className="bg-gray-50 border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"> [cite: 74]
            <th className="px-3 py-3 w-12">#</th> [cite: 74]
            <th className="px-3 py-3 min-w-[140px]">Part Number (F2)</th> [cite: 74]
            <th className="px-3 py-3 min-w-[200px]">Description</th> [cite: 74]
            <th className="px-3 py-3 w-24">HSN</th> [cite: 75]
            <th className="px-3 py-3 w-20 text-right">GST%</th> [cite: 75]
            <th className="px-3 py-3 w-24">Rack</th> [cite: 75]
            <th className="px-3 py-3 w-24 text-right">Qty</th> [cite: 75]
            <th className="px-3 py-3 w-28 text-right">MRP</th> [cite: 75]
            <th className="px-3 py-3 w-20 text-right">Disc%</th> [cite: 75]
            <th className="px-3 py-3 w-28 text-right">Net Rate</th> [cite: 76]
            <th className="px-3 py-3 w-32 text-right">Amount</th> [cite: 76]
            <th className="w-12"></th> [cite: 76]
          </tr> [cite: 76]
        </thead> [cite: 76]
        <tbody> [cite: 76]
          {items.map((item: Row, idx: number) => { [cite: 76]
            const isDup = item.part_number && dupSet.has(item.part_number.toLowerCase()); [cite: 76]
            const isLowStock = item.stock !== undefined && item.stock < 5 && item.stock > 0; [cite: 77]
            return ( [cite: 78]
              <tr key={idx} className={cn("border-b border-gray-100 transition-colors", focusedCell?.row === idx && "bg-blue-50/30", isDup && "bg-amber-50", isLowStock && "bg-orange-50/30")}> [cite: 78]
                <td className="px-3 py-2 text-gray-500 text-xs font-mono">{idx + 1}</td> [cite: 78]
                <td className="px-1 py-2 relative"> [cite: 78]
                  <Input ref={(el: any) => { inputRefs.current[`${idx}-part`] = el; }} value={item.part_number}  [cite: 78]
                    onChange={(e: any) => onUpdateRow(idx, { part_number: e.target.value.toUpperCase() })} onFocus={() => setFocusedCell({ row: idx, col: 'part' })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'part')} placeholder="Type or F2..." className="h-9 font-mono" /> [cite: 79]
                  {searchOpen && searchRow === idx && ( [cite: 79]
                    <ProductSearchDialog open={searchOpen} onSelect={(product: any) => { onUpdateRow(idx, { product_id: product.id, part_number: product.part_number, description: product.name, vehicle_model: product.vehicle_model, mrp: product.mrp, gst_pct: product.gst_pct, discount_pct: item.discount_pct || defaultDiscount, qty: item.qty || 1 }); setSearchOpen(false); setSearchRow(null); setTimeout(() => focusCell(idx, 'qty'), 100); [cite: 79, 80]
                    }} /> [cite: 81]
                  )} [cite: 81]
                </td> [cite: 81]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-description`] = el; [cite: 81]
                }} value={item.description} onChange={(e: any) => onUpdateRow(idx, { description: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'description')} className="h-9" placeholder="Description" /></td> [cite: 82]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-hsn`] = el; [cite: 82]
                }} value={item.hsn || ''} onChange={(e: any) => onUpdateRow(idx, { hsn: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'hsn')} className="h-9 font-mono" placeholder="HSN" /></td> [cite: 83]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-gst`] = el; [cite: 83]
                }} type="number" value={item.gst_pct || ''} onChange={(e: any) => onUpdateRow(idx, { gst_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'gst')} className="h-9 text-right" /></td> [cite: 84]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-rack`] = el; [cite: 84]
                }} value={item.rack || ''} onChange={(e: any) => onUpdateRow(idx, { rack: e.target.value.toUpperCase() })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'rack')} className="h-9 font-mono uppercase" placeholder="Rack" /></td> [cite: 85]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-qty`] = el; [cite: 85]
                }} type="number" value={item.qty || ''} onChange={(e: any) => onUpdateRow(idx, { qty: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'qty')} className="h-9 text-right" /></td> [cite: 86]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-mrp`] = el; [cite: 86]
                }} type="number" value={item.mrp || ''} onChange={(e: any) => onUpdateRow(idx, { mrp: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'mrp')} className="h-9 text-right" /></td> [cite: 87]
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-discount_pct`] = el; [cite: 87]
                }} type="number" value={item.discount_pct || ''} onChange={(e: any) => onUpdateRow(idx, { discount_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'discount_pct')} className="h-9 text-right" /></td> [cite: 88]
                <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">₹{item.net_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td> [cite: 88]
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td> [cite: 88]
                <td className="px-2 py-2 text-center"><button onClick={() => onDeleteRow(idx)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td> [cite: 88, 89]
              </tr> [cite: 89]
            ); [cite: 89]
          })} [cite: 90]
          {items.length < 2 && Array.from({ length: 2 - items.length }).map((_, i) => ( [cite: 90]
            <tr key={`empty-${i}`} className="h-12"><td colSpan={12} className="border-b border-gray-100"></td></tr> [cite: 90]
          ))} [cite: 90]
        </tbody> [cite: 90]
      </table> [cite: 90]
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm text-gray-600"> [cite: 90]
        <div><Package className="w-4 h-4 inline mr-1" />{items.filter(i => i.qty > 0).length} items • Total Qty: {items.reduce((s, i) => s + (i.qty || 0), 0)}</div> [cite: 90, 91]
        <button onClick={onAddRow} className="text-blue-600 hover:text-blue-700 font-medium">+ Add Row</button> [cite: 91]
      </div> [cite: 91]
    </div> [cite: 91]
  );
});
ProductGrid.displayName = "ProductGrid";

// ==========================================
// LITE SUMMARY WITH NO ANIMATION STRINGS
// ==========================================
const TotalsSidebar = ({ subtotal, discountTotal, taxable, cgst, sgst, roundOff, grandTotal, totalQty }: any) => {
  const [isExpanded, setIsExpanded] = useState(true); [cite: 92]

  return ( [cite: 95]
    <div className="sticky top-24"> [cite: 95]
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm overflow-hidden"> [cite: 95]
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold"> [cite: 95]
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /><span>Invoice Summary</span></div> [cite: 95]
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />} [cite: 95]
        </button> [cite: 95]

        {isExpanded && ( [cite: 95]
          <div className="p-6 space-y-4"> [cite: 96]
            <div className="bg-blue-50 rounded-xl p-4 text-center"> [cite: 96]
              <div className="text-2xl font-bold text-blue-600">{totalQty}</div> [cite: 96]
              <div className="text-xs text-blue-600 uppercase tracking-wide">Total Quantity</div> [cite: 96]
            </div> [cite: 96]
            <div className="space-y-3 text-sm text-gray-600"> [cite: 96]
              <div className="flex justify-between items-center py-2 border-b border-gray-100"><span>Subtotal (MRP)</span><span className="font-mono font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div> [cite: 97]
              <div className="flex justify-between items-center py-2 border-b border-gray-100"> [cite: 97]
                <span className="flex items-center gap-1"><Percent className="w-3 h-3" />Discount</span> [cite: 97]
                <span className="font-mono text-green-600">-₹{discountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> [cite: 97]
              </div> [cite: 97]
              <div className="flex justify-between items-center py-2 border-b border-gray-200 font-semibold text-gray-900 text-base"><span>Taxable Amount</span><span className="font-mono">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div> [cite: 98]
              <div className="flex justify-between items-center py-1 pl-4"><span>CGST (2.5%)</span><span className="font-mono">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div> [cite: 98]
              <div className="flex justify-between items-center py-1 pl-4"><span>SGST (2.5%)</span><span className="font-mono">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div> [cite: 98]
              {roundOff !== 0 && ( [cite: 98]
                <div className="flex justify-between items-center py-2 border-b border-gray-100"><span>Round Off</span><span className="font-mono text-amber-600">{roundOff > 0 ? '+' : '-'}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div> [cite: 99, 100]
              )} [cite: 100]
            </div> [cite: 100]
            <div className="mt-4 pt-4 border-t-2 border-gray-200 flex justify-between items-start"> [cite: 100]
              <div><div className="text-sm text-gray-500 uppercase tracking-wide">Grand Total</div><div className="text-xs text-gray-400">Including GST</div></div> [cite: 100]
              <div className="text-right"> [cite: 100]
                <div className="text-3xl font-bold text-blue-600 font-mono">₹{Math.round(grandTotal).toLocaleString('en-IN')}</div> [cite: 101]
                <div className="text-xs text-gray-400 mt-1">{Math.round(grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })} INR</div> [cite: 101]
              </div> [cite: 101]
            </div> [cite: 101]
            <div className="mt-4 space-y-2"> [cite: 101]
              <button className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-sm"><Banknote className="w-4 h-4 inline mr-2" />Collect Payment</button> [cite: 101, 102]
            </div> [cite: 102]
          </div> [cite: 102]
        )} [cite: 102]
      </div> [cite: 102]
    </div> [cite: 102]
  );
};

// ==========================================
// MAIN REFACTORED CONTAINER
// ==========================================
export const CreateOrder = () => {
  const { user } = useAuth(); [cite: 103]
  const navigate = useNavigate(); [cite: 104]
  const [params] = useSearchParams(); [cite: 104]
  const routeParams = useParams<{ id?: string }>(); [cite: 104]
  const editId = routeParams.id || params.get("id"); [cite: 104, 105]
  const printOnLoad = params.get("print") === "1"; [cite: 105]
  
  const [uploadOpen, setUploadOpen] = useState(false); [cite: 105]
  const [, setEditMode] = useState(false); [cite: 105]
  const [editStatus] = useState<string>("draft"); [cite: 106]
  const [parties, setParties] = useState<Party[]>([]); [cite: 106]
  const [partyId, setPartyId] = useState(""); [cite: 106]
  const [partyQuery, setPartyQuery] = useState(""); [cite: 106]
  const [orderNumber, setOrderNumber] = useState(""); [cite: 107]
  const [orderDate] = useState(new Date().toISOString().slice(0, 10)); [cite: 107]
  const [refNo] = useState(""); [cite: 107]
  const [salesman] = useState(""); [cite: 108]
  const [narration, setNarration] = useState(""); [cite: 108]
  
  // Initial rows reduced to 2 for light DOM footsteps
  const [items, setItems] = useState<Row[]>(Array.from({ length: 2 }, blankRow)); [cite: 108]
  const [saving, setSaving] = useState(false); [cite: 109]
  const [draftId, setDraftId] = useState<string | null>(editId); [cite: 109]
  const [lastManualSave, setLastManualSave] = useState<Date | null>(null); [cite: 109]

  // Completely disabled real-time auto-saving modules to eliminate intervals completely
  const autoSaveTime = null;
  const isAutoSaving = false;

  useEffect(() => {
    if (!user) return; [cite: 110]
    fetchParties(user.id).then(setParties).catch((e) => toast.error(e.message)); [cite: 110]
    if (!editId) { [cite: 110]
      nextOrderNumber(user.id).then(setOrderNumber).catch(() => {}); [cite: 110]
    } else { [cite: 110]
      loadExistingOrder(); [cite: 110]
    }
  }, [user, editId]); [cite: 110]

  const loadExistingOrder = async () => {
    if (!editId) return; [cite: 111]
    try { [cite: 112]
      const o = await fetchOrder(editId); [cite: 112]
      const its = await fetchOrderItems(editId); [cite: 112]
      setOrderNumber(o.order_number); [cite: 112]
      setPartyId(o.party_id || ""); [cite: 113]
      setEditMode(true); [cite: 113]
      setDraftId(o.id); [cite: 113]
      const rows: Row[] = its.length ? its.map((it: any) => ({ ...computeItem(it), hsn: "", rack: "" })) : Array.from({ length: 2 }, blankRow); [cite: 114]
      setItems(rows); [cite: 115]
      if (printOnLoad) setTimeout(() => window.print(), 600); [cite: 115]
    } catch (e: any) { [cite: 115]
      toast.error(e.message); [cite: 115]
    } [cite: 116]
  };

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]); [cite: 116]
  const defaultDiscount = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0; [cite: 117]

  useEffect(() => {
    if (!party) return; [cite: 118]
    setItems((rows) => rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: defaultDiscount } : r))); [cite: 118]
    setPartyQuery(party.name); [cite: 118]
  }, [partyId, defaultDiscount, party]); [cite: 118]

  const totals = useMemo(() => computeTotals(items), [items]); [cite: 119]
  const cgst = +(totals.gst_total / 2).toFixed(2); [cite: 119]
  const sgst = +(totals.gst_total / 2).toFixed(2); [cite: 119]
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2); [cite: 120]
  const finalTotal = Math.round(totals.grand_total); [cite: 120]
  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0); [cite: 121]

  const dupSet = useMemo(() => { [cite: 122]
    const counts = new Map<string, number>(); [cite: 122]
    items.forEach((r) => { [cite: 122]
      const k = r.part_number.trim().toLowerCase(); [cite: 122]
      if (k) counts.set(k, (counts.get(k) || 0) + 1); [cite: 122]
    }); [cite: 122]
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k)); [cite: 122]
  }, [items]); [cite: 122]

  const validRows = useCallback(() => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0), [items]); [cite: 123]

  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user) return; [cite: 124]
    const valid = validRows(); [cite: 125]
    if (status === "pending" && (!partyId || !valid.length)) { [cite: 125]
      toast.error("Select party and add at least one item"); [cite: 125]
      return; [cite: 126]
    }
    try { [cite: 126]
      setSaving(true); [cite: 126]
      const saved = await saveOrder({ [cite: 127]
        userId: user.id, id: draftId || undefined, order_number: orderNumber, order_date: orderDate, [cite: 127]
        party_id: partyId || null, party_name: party?.name ?? null, party_snapshot: party ?? null, [cite: 127]
        billing_address: party?.billing_address ?? party?.address ?? null, shipping_address: party?.shipping_address ?? party?.address ?? null, [cite: 127]
        salesman, notes: narration, remarks: refNo ? `Ref: ${refNo}` : null, mode: party?.discount_type ?? null, status, items: valid, [cite: 127]
      });
      setDraftId(saved.id); [cite: 128]
      setLastManualSave(new Date()); [cite: 128]
      if (status === "pending") { toast.success("Invoice confirmed!"); navigate(`/orders?highlight=${saved.id}`); [cite: 128]
      } else { toast.success("Draft saved", { duration: 1500 }); [cite: 129]
      }
    } catch (e: any) { toast.error(e.message); }  [cite: 130]
    finally { setSaving(false); } [cite: 130, 131]
  };

  useInvoiceKeyboard({
    onSaveDraft: () => handleSave("draft"), onConfirm: () => handleSave("pending"), onPrint: () => window.print(), onAddRow: () => setItems((r) => [...r, blankRow()]), [cite: 132]
  });

  // TARGETED INDEXED ROW REFACTORING - Updates only the targeted row natively [cite: 133]
  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setItems((rows) => {
      const updated = [...rows];
      const merged = { ...updated[idx], ...patch };
      const computed = computeItem(merged);
      updated[idx] = {
        ...computed,
        hsn: merged.hsn,
        rack: merged.rack
      } as Row;
      return updated;
    });
  }, []);

  const delRow = useCallback((idx: number) => {
    setItems((r) => (r.length <= 1 ? [blankRow()] : r.filter((_, i) => i !== idx))); [cite: 134]
  }, []);

  // Temporarily disabling HTML2Canvas processes
  const handleDownloadPDF = async () => {
    toast.success("PDF temporarily disabled");
  };

  return ( [cite: 142]
    <div className="min-h-screen bg-gray-50 antialiased selection:bg-blue-500/10">
      <div className="relative"> [cite: 142]
        <InvoiceHeader orderNumber={orderNumber} orderDate={orderDate} status={editStatus} isSaving={saving || isAutoSaving} lastSaved={autoSaveTime || lastManualSave} onSaveDraft={() => handleSave("draft")} onConfirm={() => handleSave("pending")} onPrint={() => window.print()} onDownloadPDF={handleDownloadPDF} onUpload={() => setUploadOpen(true)} onAddRow={() => setItems((r) => [...r, blankRow()])} /> [cite: 143]
        
        <div className="max-w-[1600px] mx-auto px-6 py-6"> [cite: 143]
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"> [cite: 143]
            <div className="lg:col-span-2 space-y-6"> [cite: 143]
              <PartyCard party={party} parties={parties} partyQuery={partyQuery} onSelect={(id) => setPartyId(id)} /> [cite: 143]

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"> [cite: 144]
                <div className="px-6 py-4 border-b border-gray-200"> [cite: 144]
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Items</h3> [cite: 144]
                  <p className="text-sm text-gray-500 mt-1">Add products with keyboard navigation</p> [cite: 144]
                </div> [cite: 145]
                <ProductGrid items={items} dupSet={dupSet} onUpdateRow={updateRow} onDeleteRow={delRow} onAddRow={() => setItems((r) => [...r, blankRow()])} defaultDiscount={defaultDiscount} /> [cite: 145, 146]
              </div> [cite: 146]

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"> [cite: 146]
                <label className="block text-sm font-medium text-gray-700 mb-2">Narration / Notes</label> [cite: 146]
                <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" placeholder="Additional notes..." /> [cite: 146]
              </div> [cite: 147]
            </div> [cite: 147]

            <div className="lg:col-span-1"> [cite: 147]
              <TotalsSidebar subtotal={totals.subtotal} discountTotal={totals.discount_total} taxable={totals.taxable} cgst={cgst} sgst={sgst} roundOff={roundOff} grandTotal={finalTotal} totalQty={totalQty} /> [cite: 147]
            </div> [cite: 147]
          </div> [cite: 147]
        </div> [cite: 147]
      </div> [cite: 147]

      <OrderExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} userId={user?.id || ""} defaultDiscount={defaultDiscount} onImport={(imported: any[]) => { [cite: 147, 148]
        setItems((prev) => { [cite: 148]
          const nonBlank = prev.filter((r) => r.part_number.trim()); [cite: 148]
          return [...nonBlank, ...imported.map((it) => ({ ...it, hsn: "", rack: "" } as Row))]; [cite: 148]
        }); [cite: 149]
      }} /> [cite: 149]
    </div> [cite: 149]
  );
};

export default CreateOrder; [cite: 149]
