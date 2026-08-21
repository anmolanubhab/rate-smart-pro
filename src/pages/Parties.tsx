import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Users, Search, Upload,
  ArrowUpDown, ArrowUp, ArrowDown, Download, RefreshCw,
  BookOpen,
  ChevronRight, CreditCard, AlertCircle, CheckCircle2, Ban,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import PartyFormDialog from "@/components/parties/PartyFormDialog";
import { ProductsPagination } from "@/components/ProductsPagination";
import { useDebounce } from "@/hooks/useDebounce";
import PartyExcelUpload from "@/components/PartyExcelUpload";
import { fetchParties, Party, fetchPartyOutstandingBalances, resolvePartyOutstanding } from "@/lib/parties";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortColumn = "name" | "credit_limit" | "outstanding_balance" | "created_at";
type SortDir = "asc" | "desc";
interface SortState { column: SortColumn; direction: SortDir; }


const DEFAULT_PAGE_SIZE = 25;
const PARTY_COLS = `
  id, name, phone, gst, address, billing_address, shipping_address,
  beat, credit_limit, outstanding_balance, agreed_discount,
  default_discount, discount_type, notes, created_at,
  party_group_id, use_group_defaults, credit_days, salesman_id,
  firm_name, contact_person, alt_phone, email, website,
  business_type, industry_segment, pan, msme, status,
  state, district, city, pincode, country, maps_link,
  ledger_name, opening_balance, balance_type, credit_enabled,
  interest_pct, last_payment_date, last_invoice_date,
  rate_category, special_discount, pricing_notes,
  dealer_network, online_ordering, allow_credit_orders,
  auto_approve, network_visibility, preferred_supplier, preferred_customer
`.trim();

// ─── Empty form ───────────────────────────────────────────────────────────────

// ─── Server fetch ─────────────────────────────────────────────────────────────

async function fetchPartiesPage(
  userId: string, businessId: string | null, page: number, pageSize: number,
  search: string, sort: SortState
): Promise<{ items: Party[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // Fail closed: without a company the old code dropped the filter and
  // listed every company's parties (and counted them in the header).
  if (!businessId) return { items: [], total: 0 };

  let q = supabase
    .from("parties")
    .select(PARTY_COLS, { count: "exact" })
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .order(sort.column, { ascending: sort.direction === "asc" })
    .range(from, to);

  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},phone.ilike.${s},gst.ilike.${s},address.ilike.${s}`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: ((data ?? []) as unknown as Party[]), total: count ?? 0 };
}

async function fetchSummaryCounts(userId: string, businessId: string | null, ledgerBalances: Map<string, number>) {
  // These are the OUTSTANDING / credit-limit aggregates on the page header.
  if (!businessId) return { total: 0, active: 0, blocked: 0, totalCredit: 0, totalOutstanding: 0 };
  const q = supabase
    .from("parties")
    .select("id, outstanding_balance, credit_limit")
    .eq("business_id", businessId)
    .eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  const all = data ?? [];
  return {
    total: all.length,
    active: all.length,
    blocked: 0,
    totalCredit: all.reduce((s, p) => s + Number(p.credit_limit ?? 0), 0),
    totalOutstanding: all.reduce((s, p) => s + (ledgerBalances.get(p.id) ?? Number(p.outstanding_balance ?? 0)), 0),
  };
}


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
  const [searchParams, setSearchParams] = useSearchParams();
  const businessId = business?.id ?? null;
  const [parties, setParties]   = useState<Party[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [summary, setSummary]   = useState({ total: 0, active: 0, blocked: 0, totalCredit: 0, totalOutstanding: 0 });
  const [ledgerBalances, setLedgerBalances] = useState<Map<string, number>>(new Map());
  const [exporting, setExporting] = useState(false);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch]     = useState("");
  const debouncedSearch         = useDebounce(search, 500);
  const [sort, setSort]         = useState<SortState>({ column: "name", direction: "asc" });

  const [open, setOpen]         = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing]   = useState<Party | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pageResult, ledgerMap] = await Promise.all([
        fetchPartiesPage(user.id, businessId, page, pageSize, debouncedSearch, sort),
        fetchPartyOutstandingBalances(user.id),
      ]);
      const counts = await fetchSummaryCounts(user.id, businessId, ledgerMap);
      setParties(pageResult.items);
      setTotal(pageResult.total);
      setSummary(counts);
      setLedgerBalances(ledgerMap);
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
    setOpen(true);
  };

  const openEdit = (p: Party) => {
    setEditing(p);
    setOpen(true);
  };

  // Deep link for the Smart Edit Router (src/hooks/useLedgerEditRouter.ts):
  // any screen with a party-linked ledger sends the user here instead of
  // opening its own editor, so this dialog stays the single place a party's
  // fields can be edited. The target may not be on the currently loaded
  // page/search of `parties`, so it's fetched directly by id.
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || !user) return;
    (async () => {
      // Deep link by raw id — the exact pattern businessScope.ts warns about.
      // Unscoped, /parties?edit=<company-B-party-id> opened B's party in A's
      // editor and saved back into B.
      if (!businessId) { toast.error("Party not found."); return; }
      const q = supabase.from("parties").select(PARTY_COLS)
        .eq("id", editId)
        .eq("business_id", businessId)
        .eq("user_id", user.id);
      const { data, error } = await q.maybeSingle();
      if (error) { toast.error(error.message); }
      else if (!data) { toast.error("Party not found."); }
      else { openEdit(data as unknown as Party); }
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("edit"); return next; }, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, businessId]);

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
    // Export is a read surface like any other: unscoped it wrote every
    // company's parties into one CSV.
    if (!businessId) { toast.error("No active company selected"); return; }
    setExporting(true);
    toast.info("Exporting… please wait");
    try {
      const BATCH = 1000;
      const rows: Party[] = [];
      let from = 0, hasMore = true;
      while (hasMore) {
        let q = supabase.from("parties").select(PARTY_COLS)
          .eq("business_id", businessId)
          .eq("user_id", user.id)
          .order(sort.column, { ascending: sort.direction === "asc" }).range(from, from + BATCH - 1);
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
          p.beat||"", p.credit_limit??0, effectiveOutstanding(p),
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

  // Single source of truth for "how much does this party owe" -- see
  // src/lib/parties.ts's resolvePartyOutstanding() doc comment.
  const effectiveOutstanding = useCallback(
    (p: Party) => resolvePartyOutstanding(p, ledgerBalances),
    [ledgerBalances]
  );

  // ── Status badge ──────────────────────────────────────────────────────────

  const StatusBadge = ({ p }: { p: Party }) => {
    const over = effectiveOutstanding(p) > Number(p.credit_limit) && Number(p.credit_limit) > 0;
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
            {exporting ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />} {exporting ? "Exporting…" : "Export CSV"}
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
                  const outstanding = effectiveOutstanding(p);
                  const overLimit = outstanding > Number(p.credit_limit) && Number(p.credit_limit) > 0;
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        <button
                          className="hover:underline hover:text-primary text-left"
                          onClick={() => navigate(`/parties/${p.id}`)}
                        >
                          {p.name}
                        </button>
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
                          {outstanding !== 0 ? `₹${Math.abs(outstanding).toLocaleString()} ${outstanding < 0 ? "Cr" : "Dr"}` : "—"}
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

      {businessId && user && (
        <PartyFormDialog
          open={open}
          onOpenChange={setOpen}
          businessId={businessId}
          userId={user.id}
          editing={editing}
          onSaved={() => load()}
        />
      )}

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
