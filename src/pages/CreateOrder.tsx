import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { 
  Save, CheckCircle, Printer, Download, Upload, Plus, Clock, AlertCircle,
  Building2, Phone, MapPin, Hash, TrendingUp, BadgePercent, Star, History,
  Trash2, Package, Percent, Banknote, ChevronDown, ChevronUp 
} from 'lucide-react';

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

// Dummy mock dependencies
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
    qty,
    mrp,
    discount_pct,
    gst_pct,
    net_rate,
    total,
    hsn: item.hsn || "",
    rack: item.rack || "",
    stock: item.stock,
    product_id: item.product_id,
    vehicle_model: item.vehicle_model,
  };
};

const computeTotals = (items: Row[]) => {
  let subtotal = 0;
  let discountTotal = 0;
  let taxable = 0;
  let gst_total = 0;

  items.forEach(item => {
    const itemSub = item.mrp * item.qty;
    subtotal += itemSub;
    discountTotal += itemSub * (item.discount_pct / 100);
    taxable += item.net_rate * item.qty;
    gst_total += (item.net_rate * item.qty) * (item.gst_pct / 100);
  });
  return { subtotal, discount_total: discountTotal, taxable, gst_total, grand_total: taxable + gst_total };
};

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');
const blankRow = (): Row => ({
  ...computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 }),
  hsn: "",
  rack: "",
});

const Badge = ({ children, className }: any) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", className)}>{children}</span>
);

const Button = React.forwardRef(({ children, className, ...props }: any, ref: any) => (
  <button ref={ref} className={cn("px-3 py-1.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center", className)} {...props}>{children}</button>
));

const Input = React.forwardRef(({ className, type = "text", ...props }: any, ref: any) => (
  <input ref={ref} type={type} className={cn("flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20", className)} {...props} />
));

const Avatar = ({ children, className }: any) => <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>{children}</div>;
const AvatarFallback = ({ children, className }: any) => <div className={cn("flex h-full w-full items-center justify-center rounded-full bg-gray-100 text-sm font-medium", className)}>{children}</div>;

const ProductSearchDialog = ({ open, onSelect }: any) => {
  if (!open) return null;
  return (
    <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 p-2">
      <div className="text-xs text-gray-400 p-2">Press enter on search result mock...</div>
      <button 
        className="w-full text-left p-2 hover:bg-blue-50 rounded text-sm"
        onClick={() => onSelect({ id: "p1", part_number: "PART-123", name: "Premium Brake Pad", mrp: 1200, gst_pct: 18, vehicle_model: "SUV" })}
      >
        PART-123 - Premium Brake Pad (₹1200)
      </button>
    </div>
  );
};
const OrderExcelUpload = ({ open, onOpenChange, onImport }: any) => null;
const InvoicePrint = (props: any) => null;

// ==========================================
// LIGHTWEIGHT AUTO SAVE HOOK (FIXED)
// ==========================================
const useAutoSave = ({ enabled, onSave, interval = 30000 }: { enabled: boolean, onSave: () => Promise<void>, interval?: number }) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const triggerSave = useCallback(() => {
    if (!enabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      await onSave();
      setLastSaved(new Date());
      setIsSaving(false);
    }, interval);
  }, [enabled, onSave, interval]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { lastSaved, isSaving, triggerSave };
};

const useInvoiceKeyboard = ({ onSaveDraft, onConfirm, onPrint, onAddRow }: { onSaveDraft: () => void, onConfirm: () => void, onPrint: () => void, onAddRow: () => void }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSaveDraft(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); onPrint(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onConfirm(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') { e.preventDefault(); onAddRow(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSaveDraft, onConfirm, onPrint, onAddRow]);
};

// ==========================================
// SUB-COMPONENTS
// ==========================================
const InvoiceHeader = ({
  orderNumber, orderDate, status, isSaving, lastSaved,
  onSaveDraft, onConfirm, onPrint, onDownloadPDF, onUpload, onAddRow
}: any) => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm text-gray-500 font-medium">INVOICE</div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">#{orderNumber}</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="text-sm text-gray-500">Date</div>
            <div className="text-base font-semibold">{orderDate}</div>
          </div>

          <Badge className={cn("px-3 py-1 text-sm font-medium", status === 'draft' && "border-amber-500 text-amber-700 bg-amber-50", status === 'pending' && "bg-blue-500 text-white", status === 'confirmed' && "bg-green-500 text-white")}>
            {status === 'draft' && <AlertCircle className="w-3 h-3 mr-1" />}
            {status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
            {status === 'confirmed' && <CheckCircle className="w-3 h-3 mr-1" />}
            {status.toUpperCase()}
          </Badge>

          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Saving...
            </div>
          )}
          {lastSaved && !isSaving && (
            <div className="text-xs text-gray-400">
              Saved {new Date().getTime() - lastSaved.getTime() < 1000 ? 'just now' : `at ${lastSaved.toLocaleTimeString()}`}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(!showShortcuts)} className="text-gray-500">⌨️</Button>
          <Button variant="outline" size="sm" onClick={onAddRow} className="gap-2"><Plus className="w-4 h-4" />Add Row <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 rounded">Ctrl+Shift+A</kbd></Button>
          <Button variant="outline" size="sm" onClick={onUpload} className="gap-2"><Upload className="w-4 h-4" />Upload</Button>
          <Button variant="outline" size="sm" onClick={onPrint} className="gap-2"><Printer className="w-4 h-4" />Print <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 rounded">Ctrl+P</kbd></Button>
          <Button variant="outline" size="sm" onClick={onDownloadPDF} className="gap-2"><Download className="w-4 h-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={onSaveDraft} className="gap-2"><Save className="w-4 h-4" />Save Draft <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 rounded">Ctrl+S</kbd></Button>
          <Button size="sm" onClick={onConfirm} className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg transition-all"><CheckCircle className="w-4 h-4" />Confirm Invoice <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-blue-500/20 rounded">Ctrl+Enter</kbd></Button>
        </div>

        {showShortcuts && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
            <div className="text-sm font-semibold mb-3">Keyboard Shortcuts</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Save Draft</span><kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl + S</kbd></div>
              <div className="flex justify-between"><span>Print Invoice</span><kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl + P</kbd></div>
              <div className="flex justify-between"><span>Confirm Invoice</span><kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl + Enter</kbd></div>
              <div className="flex justify-between"><span>Add New Row</span><kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Ctrl + Shift + A</kbd></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PartyCard = ({ party, parties, onSelect }: { party: Party | null, parties: Party[], partyQuery: string, onSelect: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(party?.name || '');

  const filteredParties = useMemo(() => {
    if (!searchTerm.trim()) return parties.slice(0, 8);
    return parties.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 8);
  }, [parties, searchTerm]);

  const getInitials = (name: string) => name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  const getBalanceColor = (balance: number) => balance > 50000 ? 'text-red-600' : balance > 10000 ? 'text-orange-500' : 'text-yellow-600';

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold">
            <AvatarFallback>{party ? getInitials(party.name) : '?'}</AvatarFallback>
          </Avatar>
          <div>
            <div className="relative">
              <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} onBlur={() => setTimeout(() => setIsOpen(false), 200)} placeholder="Search or select party..." className="text-xl font-bold bg-transparent border-0 focus:ring-0 p-0 placeholder:text-gray-300 outline-none w-full" />
              {isOpen && filteredParties.length > 0 && (
                <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-auto">
                  {filteredParties.map((p) => (
                    <button key={p.id} onClick={() => { onSelect(p.id); setSearchTerm(p.name); setIsOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{p.phone && <span className="mr-3">📱 {p.phone}</span>}{p.beat && <span>📍 {p.beat}</span>}</div>
                      </div>
                      <Badge className="text-xs">{p.discount_type} {p.discount_type === 'RD' ? p.agreed_discount : p.default_discount}%</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {party && (
              <div className="flex items-center gap-2 mt-1">
                <Badge className="text-xs gap-1 bg-gray-100"><Building2 className="w-3 h-3" />{party.discount_type} Mode</Badge>
                <Badge className="text-xs gap-1 bg-gray-100"><BadgePercent className="w-3 h-3" />Default {Number(party.default_discount).toFixed(1)}%</Badge>
                {party.discount_type === 'RD' && <Badge className="text-xs gap-1 bg-amber-50"><Star className="w-3 h-3 text-amber-500" />Agreed {Number(party.agreed_discount).toFixed(1)}%</Badge>}
              </div>
            )}
          </div>
        </div>
        {party && (
          <div className="text-right">
            <div className="text-sm text-gray-500">Outstanding</div>
            <div className={cn("text-2xl font-bold", getBalanceColor(party.outstanding_balance || 0))}>₹{(party.outstanding_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-gray-400 mt-1">Due</div>
          </div>
        )}
      </div>

      {party && (
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-start gap-2"><Phone className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Contact</div><div className="text-sm font-medium">{party.phone || '—'}</div></div></div>
          <div className="flex items-start gap-2"><Hash className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">GSTIN</div><div className="text-sm font-mono">{party.gst || '—'}</div></div></div>
          <div className="flex items-start gap-2 col-span-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Address</div><div className="text-sm">{party.billing_address || party.address || '—'}</div></div></div>
          {party.beat && <div className="flex items-start gap-2"><TrendingUp className="w-4 h-4 text-gray-400 mt-0.5" /><div><div className="text-xs text-gray-500">Beat</div><div className="text-sm">{party.beat}</div></div></div>}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
        <button className="flex-1 text-center py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><History className="w-4 h-4 mx-auto mb-1" />Recent Invoices</button>
        <button className="flex-1 text-center py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><TrendingUp className="w-4 h-4 mx-auto mb-1" />Pending Orders</button>
      </div>
    </div>
  );
};

// ==========================================
// HIGHLY OPTIMIZED MEMOIZED PRODUCT GRID
// ==========================================
const ProductGrid = React.memo(({ items, dupSet, onUpdateRow, onDeleteRow, onAddRow, defaultDiscount }: any) => {
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const focusCell = (row: number, col: string) => {
    const key = `${row}-${col}`;
    inputRefs.current[key]?.focus();
    inputRefs.current[key]?.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: string) => {
    const cols = ['part', 'description', 'hsn', 'gst', 'rack', 'qty', 'mrp', 'discount_pct'];
    const currentIdx = cols.indexOf(col);
    
    // F2 to trigger custom Search Modal instead of generic dynamic overlay spamming
    if (e.key === 'F2') {
      e.preventDefault();
      setSearchRow(row);
      setSearchOpen(true);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIdx < cols.length - 1) focusCell(row, cols[currentIdx + 1]);
      else if (row === items.length - 1) { 
        onAddRow();
        setTimeout(() => focusCell(row + 1, 'part'), 50); 
      }
      else focusCell(row + 1, 'part');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (currentIdx < cols.length - 1) focusCell(row, cols[currentIdx + 1]);
      else focusCell(row + 1, 'part');
    } else if (e.key === 'ArrowUp' && row > 0) { 
      e.preventDefault(); 
      focusCell(row - 1, col);
    } else if (e.key === 'ArrowDown' && row < items.length - 1) { 
      e.preventDefault();
      focusCell(row + 1, col); 
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th className="px-3 py-3 w-12">#</th>
            <th className="px-3 py-3 min-w-[140px]">Part Number (F2 to Search)</th>
            <th className="px-3 py-3 min-w-[200px]">Description</th>
            <th className="px-3 py-3 w-24">HSN</th>
            <th className="px-3 py-3 w-20 text-right">GST%</th>
            <th className="px-3 py-3 w-24">Rack</th>
            <th className="px-3 py-3 w-24 text-right">Qty</th>
            <th className="px-3 py-3 w-28 text-right">MRP</th>
            <th className="px-3 py-3 w-20 text-right">Disc%</th>
            <th className="px-3 py-3 w-28 text-right">Net Rate</th>
            <th className="px-3 py-3 w-32 text-right">Amount</th>
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: Row, idx: number) => {
            const isDup = item.part_number && dupSet.has(item.part_number.toLowerCase());
            const isLowStock = item.stock !== undefined && item.stock < 5 && item.stock > 0;
            return (
              <tr key={idx} className={cn("border-b border-gray-100 transition-colors", focusedCell?.row === idx && "bg-blue-50/30", isDup && "bg-amber-50", isLowStock && "bg-orange-50/30")}>
                <td className="px-3 py-2 text-gray-500 text-xs font-mono">{idx + 1}</td>
                <td className="px-1 py-2 relative">
                  <Input ref={(el: any) => { inputRefs.current[`${idx}-part`] = el; }} value={item.part_number} 
                    onChange={(e: any) => onUpdateRow(idx, { part_number: e.target.value.toUpperCase() })} 
                    onFocus={() => setFocusedCell({ row: idx, col: 'part' })} 
                    onKeyDown={(e: any) => handleKeyDown(e, idx, 'part')} 
                    placeholder="Type or F2..." className="h-9 font-mono" />
                  {searchOpen && searchRow === idx && (
                    <ProductSearchDialog open={searchOpen} onSelect={(product: any) => { 
                      onUpdateRow(idx, { product_id: product.id, part_number: product.part_number, description: product.name, vehicle_model: product.vehicle_model, mrp: product.mrp, gst_pct: product.gst_pct, discount_pct: item.discount_pct || defaultDiscount, qty: item.qty || 1 }); 
                      setSearchOpen(false); 
                      setSearchRow(null); 
                      setTimeout(() => focusCell(idx, 'qty'), 100);
                    }} />
                  )}
                </td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-description`] = el; }} value={item.description} onChange={(e: any) => onUpdateRow(idx, { description: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'description')} className="h-9" placeholder="Description" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-hsn`] = el; }} value={item.hsn || ''} onChange={(e: any) => onUpdateRow(idx, { hsn: e.target.value })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'hsn')} className="h-9 font-mono" placeholder="HSN" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-gst`] = el; }} type="number" value={item.gst_pct || ''} onChange={(e: any) => onUpdateRow(idx, { gst_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'gst')} className="h-9 text-right" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-rack`] = el; }} value={item.rack || ''} onChange={(e: any) => onUpdateRow(idx, { rack: e.target.value.toUpperCase() })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'rack')} className="h-9 font-mono uppercase" placeholder="Rack" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-qty`] = el; }} type="number" value={item.qty || ''} onChange={(e: any) => onUpdateRow(idx, { qty: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'qty')} className="h-9 text-right" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-mrp`] = el; }} type="number" value={item.mrp || ''} onChange={(e: any) => onUpdateRow(idx, { mrp: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'mrp')} className="h-9 text-right" /></td>
                <td className="px-1 py-2"><Input ref={(el: any) => { inputRefs.current[`${idx}-discount_pct`] = el; }} type="number" value={item.discount_pct || ''} onChange={(e: any) => onUpdateRow(idx, { discount_pct: parseFloat(e.target.value) })} onKeyDown={(e: any) => handleKeyDown(e, idx, 'discount_pct')} className="h-9 text-right" /></td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">₹{item.net_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-2 text-center"><button onClick={() => onDeleteRow(idx)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            );
          })}
          {items.length < 2 && Array.from({ length: 2 - items.length }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-12"><td colSpan={12} className="border-b border-gray-100"></td></tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm text-gray-600">
        <div><Package className="w-4 h-4 inline mr-1" />{items.filter(i => i.qty > 0).length} items • Total Qty: {items.reduce((s, i) => s + (i.qty || 0), 0)}</div>
        <button onClick={onAddRow} className="text-blue-600 hover:text-blue-700 font-medium">+ Add Row</button>
      </div>
    </div>
  );
});
ProductGrid.displayName = "ProductGrid";

// ==========================================
// REMOVED CPU-INTENSIVE ANIMATIONS (FIXED)
// ==========================================
const TotalsSidebar = ({ subtotal, discountTotal, taxable, cgst, sgst, roundOff, grandTotal, totalQty }: any) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="sticky top-24">
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold">
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /><span>Invoice Summary</span></div>
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {isExpanded && (
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{totalQty}</div>
              <div className="text-xs text-blue-600 uppercase tracking-wide">Total Quantity</div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between items-center py-2 border-b border-gray-100"><span>Subtotal (MRP)</span><span className="font-mono font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="flex items-center gap-1"><Percent className="w-3 h-3" />Discount</span>
                <span className="font-mono text-green-600">-₹{discountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200 font-semibold text-gray-900 text-base"><span>Taxable Amount</span><span className="font-mono">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center py-1 pl-4"><span>CGST (2.5%)</span><span className="font-mono">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center py-1 pl-4"><span>SGST (2.5%)</span><span className="font-mono">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              {roundOff !== 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100"><span>Round Off</span><span className="font-mono text-amber-600">{roundOff > 0 ? '+' : '-'}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t-2 border-gray-200 flex justify-between items-start">
              <div><div className="text-sm text-gray-500 uppercase tracking-wide">Grand Total</div><div className="text-xs text-gray-400">Including GST</div></div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600 font-mono">₹{Math.round(grandTotal).toLocaleString('en-IN')}</div>
                <div className="text-xs text-gray-400 mt-1">{Math.round(grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })} INR</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-md"><Banknote className="w-4 h-4 inline mr-2" />Collect Payment</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// MAIN REFACTORED CONTAINER
// ==========================================
export const CreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routeParams = useParams<{ id?: string }>();
  const editId = routeParams.id || params.get("id");
  const printOnLoad = params.get("print") === "1";
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [, setEditMode] = useState(false);
  const [editStatus] = useState<string>("draft");
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate] = useState(new Date().toISOString().slice(0, 10));
  const [refNo] = useState("");
  const [salesman] = useState("");
  const [narration, setNarration] = useState("");
  
  // Initial rows set to 2 for light DOM footprints
  const [items, setItems] = useState<Row[]>(Array.from({ length: 2 }, blankRow));
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(editId);
  const [lastManualSave, setLastManualSave] = useState<Date | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id).then(setParties).catch((e) => toast.error(e.message));
    if (!editId) {
      nextOrderNumber(user.id).then(setOrderNumber).catch(() => {});
    } else {
      loadExistingOrder();
    }
  }, [user, editId]);

  const loadExistingOrder = async () => {
    if (!editId) return;
    try {
      const o = await fetchOrder(editId);
      const its = await fetchOrderItems(editId);
      setOrderNumber(o.order_number);
      setPartyId(o.party_id || "");
      setEditMode(true);
      setDraftId(o.id);
      const rows: Row[] = its.length ? its.map((it: any) => ({ ...computeItem(it), hsn: "", rack: "" })) : Array.from({ length: 2 }, blankRow);
      setItems(rows);
      if (printOnLoad) setTimeout(() => window.print(), 600);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const defaultDiscount = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;

  useEffect(() => {
    if (!party) return;
    setItems((rows) => rows.map((r) => (r.discount_pct === 0 && !r.part_number ? { ...r, discount_pct: defaultDiscount } : r)));
    setPartyQuery(party.name);
  }, [partyId, defaultDiscount, party]);

  const totals = useMemo(() => computeTotals(items), [items]);
  const cgst = +(totals.gst_total / 2).toFixed(2);
  const sgst = +(totals.gst_total / 2).toFixed(2);
  const roundOff = +(Math.round(totals.grand_total) - totals.grand_total).toFixed(2);
  const finalTotal = Math.round(totals.grand_total);
  const totalQty = items.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const dupSet = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => {
      const k = r.part_number.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [items]);

  const validRows = useCallback(() => items.filter((it) => it.part_number.trim() && Number(it.qty) > 0), [items]);

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
        userId: user.id, id: draftId || undefined, order_number: orderNumber, order_date: orderDate,
        party_id: partyId || null, party_name: party?.name ?? null, party_snapshot: party ?? null,
        billing_address: party?.billing_address ?? party?.address ?? null, shipping_address: party?.shipping_address ?? party?.address ?? null,
        salesman, notes: narration, remarks: refNo ? `Ref: ${refNo}` : null, mode: party?.discount_type ?? null, status, items: valid,
      });
      setDraftId(saved.id);
      setLastManualSave(new Date());
      if (status === "pending") { 
        toast.success("Invoice confirmed!"); 
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

  // Safe manual triggering mapping inside hooks updates
  const { lastSaved: autoSaveTime, isSaving: isAutoSaving, triggerSave } = useAutoSave({
    enabled: !!user && !saving, onSave: () => handleSave("draft"), interval: 30000,
  });

  useInvoiceKeyboard({
    onSaveDraft: () => handleSave("draft"), onConfirm: () => handleSave("pending"), onPrint: () => window.print(), onAddRow: () => setItems((r) => [...r, blankRow()]),
  });

  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const computed = computeItem(merged);
      return { ...computed, hsn: merged.hsn, rack: merged.rack } as Row;
    }));
    triggerSave();
  }, [triggerSave]);

  const delRow = useCallback((idx: number) => {
    setItems((r) => (r.length <= 1 ? [blankRow()] : r.filter((_, i) => i !== idx)));
    triggerSave();
  }, [triggerSave]);

  const handleDownloadPDF = async () => {
    try {
      toast.loading("Generating PDF...");
      const el = document.getElementById("invoice-print");
      if (!el) throw new Error("Invoice not ready");
      // Scale reduced to 1 for aggressive compression and performance fix
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 1, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`Invoice_${orderNumber || "invoice"}.pdf`);
      toast.dismiss();
      toast.success("PDF downloaded!");
    } catch (e: any) { 
      toast.dismiss(); 
      toast.error(e?.message || "Failed to generate PDF"); 
    }
  };

  const printableItems = useMemo(() => validRows().map((it) => ({
    partNumber: it.part_number, productName: it.description, qty: Number(it.qty) || 0, rate: Number(it.net_rate) || 0, gstPct: Number(it.gst_pct) || 0, amount: Number(it.total) || 0,
  })), [validRows]);

  return (
    <div className="min-h-screen bg-gray-50 antialiased selection:bg-blue-500/10">
      <div className="hidden">
        <InvoicePrint company={{ name: "Viswanath Automobiles Pvt. Ltd.", addressLines: [], gstin: null, logoUrl: null }} party={{ name: party?.name || "", mobile: party?.phone || null, address: party?.billing_address || party?.address || null, gstNo: party?.gst || null }} info={{ invoiceNumber: orderNumber, date: orderDate, time: new Date().toLocaleTimeString(), paymentMode: "—" }} items={printableItems} totals={{ subtotal: totals.subtotal, discount: totals.discount_total, tax: totals.gst_total, grandTotal: finalTotal }} />
      </div>

      <div className="relative">
        <InvoiceHeader orderNumber={orderNumber} orderDate={orderDate} status={editStatus} isSaving={saving || isAutoSaving} lastSaved={autoSaveTime || lastManualSave} onSaveDraft={() => handleSave("draft")} onConfirm={() => handleSave("pending")} onPrint={() => window.print()} onDownloadPDF={handleDownloadPDF} onUpload={() => setUploadOpen(true)} onAddRow={() => setItems((r) => [...r, blankRow()])} />
        
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <PartyCard party={party} parties={parties} partyQuery={partyQuery} onSelect={(id) => setPartyId(id)} />

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Items</h3>
                  <p className="text-sm text-gray-500 mt-1">Add products with keyboard navigation</p>
                </div>
                <ProductGrid items={items} dupSet={dupSet} onUpdateRow={updateRow} onDeleteRow={delRow} onAddRow={() => setItems((r) => [...r, blankRow()])} userId={user?.id || ""} defaultDiscount={defaultDiscount} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Narration / Notes</label>
                <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" placeholder="Additional notes..." />
              </div>
            </div>

            <div className="lg:col-span-1">
              <TotalsSidebar subtotal={totals.subtotal} discountTotal={totals.discount_total} taxable={totals.taxable} cgst={cgst} sgst={sgst} roundOff={roundOff} grandTotal={finalTotal} totalQty={totalQty} />
            </div>
          </div>
        </div>
      </div>

      <OrderExcelUpload open={uploadOpen} onOpenChange={setUploadOpen} userId={user?.id || ""} defaultDiscount={defaultDiscount} onImport={(imported: any[]) => {
        setItems((prev) => {
          const nonBlank = prev.filter((r) => r.part_number.trim());
          return [...nonBlank, ...imported.map((it) => ({ ...it, hsn: "", rack: "" } as Row))];
        });
      }} />
    </div>
  );
};

export default CreateOrder;
