import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Users, Search, Upload,
  ArrowUpDown, ArrowUp, ArrowDown, Download, RefreshCw,
  Building2, MapPin, BookOpen, Tag, Globe, FileText, History,
  ChevronRight, CreditCard, AlertCircle, CheckCircle2, Ban,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PartyActivityTimeline from "@/components/parties/PartyActivityTimeline";
import { ProductsPagination } from "@/components/ProductsPagination";
import { useDebounce } from "@/hooks/useDebounce";
import PartyExcelUpload from "@/components/PartyExcelUpload";
import { fetchParties, Party, DiscountType } from "@/lib/parties";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortColumn = "name" | "credit_limit" | "outstanding_balance" | "created_at";
type SortDir = "asc" | "desc";
interface SortState { column: SortColumn; direction: SortDir; }

type TabKey = "general" | "address" | "accounting" | "pricing" | "commerce" | "documents" | "history";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "general",   label: "General",        icon: Building2 },
  { key: "address",   label: "Address",        icon: MapPin },
  { key: "accounting",label: "Accounting",     icon: BookOpen },
  { key: "pricing",   label: "Pricing",        icon: Tag },
  { key: "commerce",  label: "Online Commerce",icon: Globe },
  { key: "documents", label: "Documents",      icon: FileText },
  { key: "history",   label: "History",        icon: History },
];

const DEFAULT_PAGE_SIZE = 25;
const PARTY_COLS = `
  id, name, phone, gst, address, billing_address, shipping_address,
  beat, credit_limit, outstanding_balance, agreed_discount,
  default_discount, discount_type, notes, created_at,
  party_group_id, use_group_defaults, credit_days
`.trim();

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = {
  // General
  name: "", firm_name: "", contact_person: "", phone: "", alt_phone: "",
  email: "", website: "", business_type: "Retailer", industry_segment: "Automobile Parts",
  gst: "", pan: "", msme: "", status: "active",
  // Address
  billing_address: "", shipping_address: "",
  state: "", district: "", city: "", pincode: "", country: "India", maps_link: "",
  // Accounting
  ledger_name: "", opening_balance: "0", balance_type: "CR",
  credit_enabled: false, credit_limit: "0", credit_days: "30",
  interest_pct: "0", last_payment_date: "", last_invoice_date: "",
  outstanding_balance: "0",
  // Pricing
  default_discount: "0", discount_type: "RD" as DiscountType, agreed_discount: "0",
  rate_category: "Retail Price", special_discount: "0", pricing_notes: "",
  // Commerce
  dealer_network: false, online_ordering: false, allow_credit_orders: false,
  auto_approve: false, network_visibility: false,
  preferred_supplier: false, preferred_customer: false,
  // Legacy
  address: "", beat: "", notes: "",
  // Group / inheritance
  party_group_id: "" as string, use_group_defaults: true,
};

// ─── Server fetch ─────────────────────────────────────────────────────────────

async function fetchPartiesPage(
  userId: string, businessId: string | null, page: number, pageSize: number,
  search: string, sort: SortState
): Promise<{ items: Party[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from("parties")
    .select(PARTY_COLS, { count: "exact" })
    .eq("user_id", userId)
    .order(sort.column, { ascending: sort.direction === "asc" })
    .range(from, to);

  if (businessId) q = q.eq("business_id", businessId);

  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},phone.ilike.${s},gst.ilike.${s},address.ilike.${s}`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: ((data ?? []) as unknown as Party[]), total: count ?? 0 };
}

async function fetchSummaryCounts(userId: string, businessId: string | null) {
  let q = supabase
    .from("parties")
    .select("outstanding_balance, credit_limit")
    .eq("user_id", userId);
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (error) throw error;
  const all = data ?? [];
  return {
    total: all.length,
    active: all.length,
    blocked: 0,
    totalCredit: all.reduce((s, p) => s + Number(p.credit_limit ?? 0), 0),
    totalOutstanding: all.reduce((s, p) => s + Number(p.outstanding_balance ?? 0), 0),
  };
}

// ─── Toggle component ─────────────────────────────────────────────────────────

const Toggle = ({ value, onChange, label, disabled = false }: {
  value: boolean; onChange: (v: boolean) => void;
  label: string; disabled?: boolean;
}) => (
  <div className={`flex items-center justify-between py-2 ${disabled ? "opacity-40" : ""}`}>
    <span className="text-sm">{label}</span>
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${value ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
        ${value ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  </div>
);

// ─── Sort header ──────────────────────────────────────────────────────────────

const SortHeader = ({ label, column, sort, onSort, className = "" }: {
  label: string; column: SortColumn; sort: SortState;
  onSort: (c: SortColumn) => void; className?: string;
}) => {
  const active = sort.column === column;
  return (
    <th className={`px-4 py-3 cursor-pointer select-none group hover:bg-muted/80 transition-colors ${className}`}
      onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active
          ? sort.direction === "asc"
            ? <ArrowUp className="h-3 w-3 text-primary" />
            : <ArrowDown className="h-3 w-3 text-primary" />
          : <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />}
      </div>
    </th>
  );
};

const SkeletonRow = ({ index }: { index: number }) => (
  <tr className="border-t border-border animate-pulse" style={{ opacity: 1 - index * 0.07 }}>
    {[100, 90, 80, 90, 90, 100, 80, 70, 60].map((w, i) => (
      <td key={i} className="px-4 py-3"><div className="h-3.5 rounded bg-muted" style={{ width: w }} /></td>
    ))}
  </tr>
);

// ─── Main component ───────────────────────────────────────────────────────────

const Parties = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const businessId = business?.id ?? null;
  const [parties, setParties]   = useState<Party[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [summary, setSummary]   = useState({ total: 0, active: 0, blocked: 0, totalCredit: 0, totalOutstanding: 0 });
  const [exporting, setExporting] = useState(false);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch]     = useState("");
  const debouncedSearch         = useDebounce(search, 500);
  const [sort, setSort]         = useState<SortState>({ column: "name", direction: "asc" });

  const [open, setOpen]         = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing]   = useState<Party | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);

  // Party Groups (inheritance)
  type PartyGroupLite = {
    id: string; parent_id: string | null; name: string;
    default_rd_pct: number | null; default_cd_pct: number | null;
    default_credit_days: number | null; default_credit_limit: number | null;
  };
  const [groups, setGroups] = useState<PartyGroupLite[]>([]);

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const { data } = await supabase
        .from("party_groups")
        .select("id, parent_id, name, default_rd_pct, default_cd_pct, default_credit_days, default_credit_limit")
        .eq("business_id", businessId)
        .order("name");
      setGroups((data as PartyGroupLite[]) ?? []);
    })();
  }, [businessId]);

  const resolveGroupDefaults = useCallback((groupId: string | null) => {
    if (!groupId) return null;
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const parent = group.parent_id ? groups.find(g => g.id === group.parent_id) : undefined;
    return {
      rd: group.default_rd_pct ?? parent?.default_rd_pct ?? 0,
      cd: group.default_cd_pct ?? parent?.default_cd_pct ?? 0,
      creditDays: group.default_credit_days ?? parent?.default_credit_days ?? null,
      creditLimit: group.default_credit_limit ?? parent?.default_credit_limit ?? null,
    };
  }, [groups]);

  const applyGroupToForm = (groupId: string, useDefaults: boolean) => {
    if (!useDefaults) return;
    const resolved = resolveGroupDefaults(groupId);
    if (!resolved) return;
    setForm(f => ({
      ...f,
      party_group_id: groupId,
      use_group_defaults: true,
      agreed_discount: String(f.discount_type === "CD" ? resolved.cd : resolved.rd),
      credit_limit: resolved.creditLimit != null ? String(resolved.creditLimit) : f.credit_limit,
    }));
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pageResult, counts] = await Promise.all([
        fetchPartiesPage(user.id, businessId, page, pageSize, debouncedSearch, sort),
        fetchSummaryCounts(user.id, businessId),
      ]);
      setParties(pageResult.items);
      setTotal(pageResult.total);
      setSummary(counts);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, businessId, page, pageSize, debouncedSearch, sort]);

  useEffect(() => { document.title = "Parties — RD-Pro"; }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, sort]);

  // ── Sort ──────────────────────────────────────────────────────────────────

  const handleSort = (column: SortColumn) =>
    setSort(prev =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );

  // ── Dialog ────────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setActiveTab("general");
    setOpen(true);
  };

  const openEdit = (p: Party) => {
    setEditing(p);
    setForm({
      ...emptyForm,
      name: p.name,
      phone: p.phone || "",
      gst: p.gst || "",
      address: p.address || "",
      billing_address: p.billing_address || "",
      shipping_address: p.shipping_address || "",
      beat: p.beat || "",
      credit_limit: String(p.credit_limit ?? 0),
      outstanding_balance: String(p.outstanding_balance ?? 0),
      agreed_discount: String(p.agreed_discount ?? 0),
      default_discount: String(p.default_discount ?? 0),
      discount_type: (p.discount_type as DiscountType) || "RD",
      notes: p.notes || "",
      ledger_name: p.name,
      party_group_id: p.party_group_id || "",
      use_group_defaults: p.use_group_defaults ?? true,
    });
    setActiveTab("general");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Party name is required");
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        business_id: businessId,
        name: form.name.trim(),
        address: form.address.trim() || null,
        default_discount: parseFloat(form.default_discount) || 0,
        discount_type: form.discount_type,
        agreed_discount: parseFloat(form.agreed_discount) || 0,
        phone: form.phone.trim() || null,
        gst: form.gst.trim() || null,
        billing_address: form.billing_address.trim() || null,
        shipping_address: form.shipping_address.trim() || null,
        beat: form.beat.trim() || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        outstanding_balance: parseFloat(form.outstanding_balance) || 0,
        notes: form.notes.trim() || null,
        party_group_id: form.party_group_id || null,
        use_group_defaults: form.use_group_defaults,
      };
      if (editing) {
        const { error } = await supabase.from("parties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parties").insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Party updated" : "Party added");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Party) => {
    if (!confirm(`Delete party "${p.name}"?`)) return;
    const { error } = await supabase.from("parties").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Party deleted");
    load();
  };

  // ── Export CSV ────────────────────────────────────────────────────────────

  const exportCSV = async () => {
    if (!user) return;
    setExporting(true);
    toast.info("Exporting… please wait");
    try {
      const BATCH = 1000;
      const rows: Party[] = [];
      let from = 0, hasMore = true;
      while (hasMore) {
        let q = supabase.from("parties").select(PARTY_COLS).eq("user_id", user.id)
          .order(sort.column, { ascending: sort.direction === "asc" }).range(from, from + BATCH - 1);
        if (businessId) q = q.eq("business_id", businessId);
        if (debouncedSearch.trim()) {
          const s = `%${debouncedSearch.trim()}%`;
          q = q.or(`name.ilike.${s},phone.ilike.${s},gst.ilike.${s}`);
        }
        const { data, error } = await q;
        if (error) throw error;
        const batch = ((data ?? []) as unknown as Party[]);
        rows.push(...batch);
        hasMore = batch.length === BATCH;
        from += BATCH;
      }

      const headers = ["Name","Phone","GST","Address","Billing Address","Shipping Address",
        "Beat","Credit Limit","Outstanding","Default Disc%","Agreed Disc%","Notes"];
      const esc = (v: any) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...rows.map(p => [
          p.name, p.phone||"", p.gst||"", p.address||"",
          p.billing_address||"", p.shipping_address||"",
          p.beat||"", p.credit_limit??0, p.outstanding_balance??0,
          p.default_discount??0, p.agreed_discount??0, p.notes||""
        ].map(esc).join(","))
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parties_export_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length.toLocaleString()} parties`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────

  const StatusBadge = ({ p }: { p: Party }) => {
    const over = Number(p.outstanding_balance) > Number(p.credit_limit) && Number(p.credit_limit) > 0;
    if (over) return <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 text-xs">Over Limit</Badge>;
    return <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5 text-xs">Active</Badge>;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Business</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Party Master</h1>
          <p className="text-muted-foreground mt-1">Customers, suppliers, dealers and credit management.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / phone / GST…"
              className="pl-9 w-full md:w-72"
            />
            {search !== debouncedSearch && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Excel
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={exporting}>
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button onClick={openNew} className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Plus className="h-4 w-4" /> Add Party
          </Button>
        </div>
      </header>

      {/* Summary footer tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Parties",    value: summary.total.toLocaleString(),                       color: "text-foreground" },
          { label: "Active",           value: summary.active.toLocaleString(),                      color: "text-emerald-600" },
          { label: "Blocked",          value: summary.blocked.toLocaleString(),                     color: "text-destructive" },
          { label: "Total Credit",     value: `₹${(summary.totalCredit/1000).toFixed(1)}K`,         color: "text-primary" },
          { label: "Total Outstanding",value: `₹${(summary.totalOutstanding/1000).toFixed(1)}K`,   color: "text-amber-600" },
        ].map(t => (
          <div key={t.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.label}</p>
            <p className={`font-display text-xl font-bold mt-1 tabular-nums ${t.color}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* ERP Grid */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 380px)", minHeight: 200 }}>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <SortHeader label="Party Name" column="name"                sort={sort} onSort={handleSort} className="text-left" />
                <th className="text-left px-4 py-3">Business Type</th>
                <th className="text-left px-4 py-3">Mobile</th>
                <th className="text-left px-4 py-3">GST Number</th>
                <th className="text-left px-4 py-3">City / Beat</th>
                <SortHeader label="Credit Limit"   column="credit_limit"        sort={sort} onSort={handleSort} className="text-right" />
                <SortHeader label="Outstanding"    column="outstanding_balance"  sort={sort} onSort={handleSort} className="text-right" />
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              ) : parties.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-display font-semibold">No parties found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search ? "Try a different search." : "Add your first party to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                parties.map((p) => {
                  const overLimit = Number(p.outstanding_balance) > Number(p.credit_limit) && Number(p.credit_limit) > 0;
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        {p.name}
                        {overLimit && <AlertCircle className="inline-block h-3.5 w-3.5 ml-1.5 text-destructive -mt-0.5" />}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs capitalize">Retailer</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{p.phone || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.gst || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.beat || p.address?.slice(0,20) || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(p.credit_limit) > 0 ? `₹${Number(p.credit_limit).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={overLimit ? "text-destructive font-semibold" : ""}>
                          {Number(p.outstanding_balance) > 0 ? `₹${Number(p.outstanding_balance).toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge p={p} /></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View Ledger"
                          onClick={() => navigate(`/accounts/party/${p.id}`)}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <ProductsPagination
          page={page} pageSize={pageSize} total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          loading={loading}
        />
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
            <DialogTitle className="font-display text-xl">
              {editing ? `Edit Party — ${editing.name}` : "Add New Party"}
            </DialogTitle>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-border px-6 shrink-0 gap-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                  ${activeTab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="overflow-y-auto flex-1 px-6 py-4">

            {/* ── TAB 1: GENERAL ── */}
            {activeTab === "general" && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label>Party Group</Label>
                      <Select
                        value={form.party_group_id || "none"}
                        onValueChange={v => {
                          const gid = v === "none" ? "" : v;
                          setForm(f => ({ ...f, party_group_id: gid }));
                          if (gid) applyGroupToForm(gid, form.use_group_defaults);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No group</SelectItem>
                          {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        id="use-group-defaults"
                        checked={form.use_group_defaults}
                        onChange={e => {
                          const checked = e.target.checked;
                          setForm(f => ({ ...f, use_group_defaults: checked }));
                          if (checked && form.party_group_id) applyGroupToForm(form.party_group_id, true);
                        }}
                      />
                      <Label htmlFor="use-group-defaults" className="font-normal cursor-pointer">Use Group Defaults</Label>
                    </div>
                  </div>
                  {form.party_group_id && (() => {
                    const r = resolveGroupDefaults(form.party_group_id);
                    if (!r) return null;
                    const tag = form.use_group_defaults ? "Group" : "Override";
                    return (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                        <span>RD <b className="text-foreground">{r.rd}%</b> ({tag})</span>
                        <span>CD <b className="text-foreground">{r.cd}%</b> ({tag})</span>
                        {r.creditDays != null && <span>Credit <b className="text-foreground">{r.creditDays}d</b> ({tag})</span>}
                        {r.creditLimit != null && <span>Limit <b className="text-foreground">₹{r.creditLimit.toLocaleString("en-IN")}</b> ({tag})</span>}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label>Party Name *</Label>
                  <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Ram Traders" />
                </div>
                <div className="space-y-1.5">
                  <Label>Firm Name</Label>
                  <Input value={form.firm_name} onChange={e => setForm({...form, firm_name: e.target.value})} placeholder="Legal entity name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Person</Label>
                  <Input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} placeholder="Owner / Manager name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile Number</Label>
                  <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+91 98765 43210" />
                </div>
                <div className="space-y-1.5">
                  <Label>Alternate Mobile</Label>
                  <Input value={form.alt_phone} onChange={e => setForm({...form, alt_phone: e.target.value})} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="party@email.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Website</Label>
                  <Input value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Type</Label>
                  <Select value={form.business_type} onValueChange={v => setForm({...form, business_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Retailer","Wholesaler","Distributor","Dealer","Workshop","Manufacturer","Supplier","Customer","Customer + Supplier"]
                        .map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Industry Segment</Label>
                  <Select value={form.industry_segment} onValueChange={v => setForm({...form, industry_segment: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Automobile Parts","Tyres","Lubricants","Electrical","Hardware","FMCG","Others"]
                        .map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>GST Number</Label>
                  <Input value={form.gst} onChange={e => setForm({...form, gst: e.target.value})} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div className="space-y-1.5">
                  <Label>PAN Number</Label>
                  <Input value={form.pan} onChange={e => setForm({...form, pan: e.target.value})} placeholder="ABCDE1234F" />
                </div>
                <div className="space-y-1.5">
                  <Label>MSME Number</Label>
                  <Input value={form.msme} onChange={e => setForm({...form, msme: e.target.value})} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Beat / Area</Label>
                  <Input value={form.beat} onChange={e => setForm({...form, beat: e.target.value})} placeholder="e.g. Market Road" />
                </div>
              </div>
            )}

            {/* ── TAB 2: ADDRESS ── */}
            {activeTab === "address" && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Billing Address</Label>
                  <Textarea value={form.billing_address} onChange={e => setForm({...form, billing_address: e.target.value})} rows={3} placeholder="Full billing address" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Shipping Address</Label>
                  <Textarea value={form.shipping_address} onChange={e => setForm({...form, shipping_address: e.target.value})} rows={3} placeholder="Leave blank if same as billing" />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input value={form.state} onChange={e => setForm({...form, state: e.target.value})} placeholder="e.g. Karnataka" />
                </div>
                <div className="space-y-1.5">
                  <Label>District</Label>
                  <Input value={form.district} onChange={e => setForm({...form, district: e.target.value})} placeholder="e.g. Bengaluru Urban" />
                </div>
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="e.g. Bengaluru" />
                </div>
                <div className="space-y-1.5">
                  <Label>Pincode</Label>
                  <Input value={form.pincode} onChange={e => setForm({...form, pincode: e.target.value})} placeholder="560001" />
                </div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Input value={form.country} onChange={e => setForm({...form, country: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <Label>Google Maps Link</Label>
                  <Input value={form.maps_link} onChange={e => setForm({...form, maps_link: e.target.value})} placeholder="https://maps.google.com/..." />
                </div>
              </div>
            )}

            {/* ── TAB 3: ACCOUNTING ── */}
            {activeTab === "accounting" && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Ledger Name</Label>
                    <Input value={form.ledger_name} onChange={e => setForm({...form, ledger_name: e.target.value})} placeholder="Auto-filled from party name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Opening Balance (₹)</Label>
                    <Input type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Balance Type</Label>
                    <Select value={form.balance_type} onValueChange={v => setForm({...form, balance_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DR">DR (Debit)</SelectItem>
                        <SelectItem value="CR">CR (Credit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Credit Days</Label>
                    <Input type="number" value={form.credit_days} onChange={e => setForm({...form, credit_days: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Credit Limit (₹)</Label>
                      {form.party_group_id && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${form.use_group_defaults ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                          {form.use_group_defaults ? "Inherited" : "Overridden"}
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      value={form.credit_limit}
                      disabled={form.use_group_defaults && !!form.party_group_id}
                      onChange={e => setForm({...form, credit_limit: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Interest % (p.a.)</Label>
                    <Input type="number" value={form.interest_pct} onChange={e => setForm({...form, interest_pct: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Payment Date</Label>
                    <Input type="date" value={form.last_payment_date} onChange={e => setForm({...form, last_payment_date: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Invoice Date</Label>
                    <Input type="date" value={form.last_invoice_date} onChange={e => setForm({...form, last_invoice_date: e.target.value})} />
                  </div>
                </div>

                {/* Read-only calculated */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding Amount</p>
                    <p className="font-display text-xl font-bold mt-1 tabular-nums">
                      ₹{Number(form.outstanding_balance).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Available Credit</p>
                    <p className={`font-display text-xl font-bold mt-1 tabular-nums
                      ${(Number(form.credit_limit) - Number(form.outstanding_balance)) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                      ₹{(Number(form.credit_limit) - Number(form.outstanding_balance)).toLocaleString()}
                    </p>
                  </div>
                </div>

                {Number(form.outstanding_balance) > Number(form.credit_limit) && Number(form.credit_limit) > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Outstanding exceeds credit limit. Orders may be blocked.
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Toggle value={form.credit_enabled} onChange={v => setForm({...form, credit_enabled: v})} label="Credit Enabled" />
                </div>
              </div>
            )}

            {/* ── TAB 4: PRICING ── */}
            {activeTab === "pricing" && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Default Discount (%)</Label>
                  <Input type="number" value={form.default_discount} onChange={e => setForm({...form, default_discount: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Agreed Discount (%)</Label>
                    {form.party_group_id && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${form.use_group_defaults ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                        {form.use_group_defaults ? "Inherited" : "Overridden"}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    value={form.agreed_discount}
                    disabled={form.use_group_defaults && !!form.party_group_id}
                    onChange={e => setForm({...form, agreed_discount: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>RD / CD Mode</Label>
                  <Select value={form.discount_type} onValueChange={v => setForm({...form, discount_type: v as DiscountType})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RD">RD (Regular Discount)</SelectItem>
                      <SelectItem value="CD">CD (Cash Discount)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Rate Category</Label>
                  <Select value={form.rate_category} onValueChange={v => setForm({...form, rate_category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Retail Price">Retail Price</SelectItem>
                      <SelectItem value="Dealer Price">Dealer Price</SelectItem>
                      <SelectItem value="Distributor Price">Distributor Price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Special Discount (%)</Label>
                  <Input type="number" value={form.special_discount} onChange={e => setForm({...form, special_discount: e.target.value})} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Pricing Notes</Label>
                  <Textarea value={form.pricing_notes} onChange={e => setForm({...form, pricing_notes: e.target.value})} rows={2} placeholder="Special pricing terms..." />
                </div>
              </div>
            )}

            {/* ── TAB 5: ONLINE COMMERCE ── */}
            {activeTab === "commerce" && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-3">Manage dealer network and online ordering settings for this party.</p>
                <div className="rounded-xl border border-border divide-y divide-border px-4">
                  <Toggle value={form.dealer_network}     onChange={v => setForm({...form, dealer_network: v})}     label="Dealer Network Member" />
                  <Toggle value={form.online_ordering}    onChange={v => setForm({...form, online_ordering: v})}    label="Online Ordering Access" />
                  <Toggle value={form.allow_credit_orders} onChange={v => setForm({...form, allow_credit_orders: v})} label="Allow Credit Orders" />
                  <Toggle value={form.auto_approve}       onChange={v => setForm({...form, auto_approve: v})}       label="Auto Approve Orders" />
                  <Toggle value={form.network_visibility} onChange={v => setForm({...form, network_visibility: v})} label="Network Visibility" />
                  <Toggle value={form.preferred_supplier} onChange={v => setForm({...form, preferred_supplier: v})} label="Preferred Supplier" />
                  <Toggle value={form.preferred_customer} onChange={v => setForm({...form, preferred_customer: v})} label="Preferred Customer" />
                </div>

                <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Future Features</p>
                  <Toggle value={false} onChange={() => {}} label="Auto Purchase Sync"     disabled />
                  <Toggle value={false} onChange={() => {}} label="Auto Sales Sync"        disabled />
                  <Toggle value={false} onChange={() => {}} label="Marketplace Participation" disabled />
                </div>
              </div>
            )}

            {/* ── TAB 6: DOCUMENTS ── */}
            {activeTab === "documents" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Upload KYC and compliance documents for this party.</p>
                {["GST Certificate","PAN Card","Trade License","Cancelled Cheque","Other Documents"].map(doc => (
                  <div key={doc} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{doc}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">No file uploaded</p>
                    </div>
                    <Button variant="outline" size="sm" disabled className="text-xs opacity-50">
                      Upload
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">Document upload will be available in a future release.</p>
              </div>
            )}

            {/* ── TAB 7: HISTORY ── */}
            {activeTab === "history" && (
              <PartyActivityTimeline partyId={editing?.id} />
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90">
              {saving ? "Saving…" : editing ? "Update Party" : "Create Party"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user && (
        <PartyExcelUpload
          open={importOpen}
          onOpenChange={setImportOpen}
          userId={user.id}
          onImported={load}
        />
      )}
    </div>
  );
};

export default Parties;
