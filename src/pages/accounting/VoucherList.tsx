// src/pages/accounting/VoucherList.tsx
// Route: /accounting/vouchers
// Full voucher list with search, filters, pagination, export.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Filter, Printer, FileSpreadsheet, FileDown,
  Eye, Pencil, Trash2, CheckCircle, MoreHorizontal, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listVouchers, deleteVoucher, postVoucher,
  VOUCHER_TYPES, VOUCHER_STATUSES,
  type Voucher, type VoucherType, type VoucherStatus,
} from "@/lib/voucherService";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useActiveBusinessId";
import { fmtInr } from "@/lib/accounting";

// ── tone helpers ──────────────────────────────────────────────────────────────

const statusTone: Record<string, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  posted: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

const typeTone: Record<string, string> = {
  Sales: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  Purchase: "border-violet-500/40 text-violet-600 bg-violet-500/10",
  Receipt: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  Payment: "border-rose-500/40 text-rose-600 bg-rose-500/10",
  Journal: "border-slate-500/40 text-slate-600 bg-slate-500/10",
  Contra: "border-orange-500/40 text-orange-600 bg-orange-500/10",
  "Debit Note": "border-red-500/40 text-red-600 bg-red-500/10",
  "Credit Note": "border-teal-500/40 text-teal-600 bg-teal-500/10",
  "Opening Balance": "border-gray-500/40 text-gray-600 bg-gray-500/10",
};

const PAGE_SIZE = 25;

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows: Voucher[]) {
  const headers = ["Voucher No", "Date", "Type", "Narration", "Amount", "Status"];
  const lines = rows.map((r) => [
    r.voucher_no,
    r.voucher_date,
    r.voucher_type,
    (r.narration ?? "").replace(/,/g, " "),
    (r.total_debit ?? 0).toFixed(2),
    r.status,
  ]);
  const csv = [headers, ...lines].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Vouchers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── component ────────────────────────────────────────────────────────────────

export default function VoucherList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();

  useEffect(() => { document.title = "Vouchers — RD Pro"; }, []);

  // filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  // action dialogs
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null);
  const [postTarget, setPostTarget] = useState<Voucher | null>(null);
  const [busy, setBusy] = useState(false);

  // reset page on filter change
  useEffect(() => { setPage(1); }, [search, typeFilter, statusFilter, fromDate, toDate]);

  const offset = (page - 1) * PAGE_SIZE;

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ["vouchers-list", business?.id, typeFilter, statusFilter, fromDate, toDate, search, page],
    queryFn: () =>
      listVouchers({
        voucher_type: typeFilter as VoucherType | "All",
        status: statusFilter as VoucherStatus | "All",
        from: fromDate || undefined,
        to: toDate || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    keepPreviousData: true,
  });

  const vouchers = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // summary KPIs
  const kpis = useMemo(() => {
    const posted = vouchers.filter((v) => v.status === "posted").length;
    const draft = vouchers.filter((v) => v.status === "draft").length;
    const totalAmt = vouchers.reduce((s, v) => s + (v.total_debit ?? 0), 0);
    return { posted, draft, totalAmt };
  }, [vouchers]);

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteVoucher(deleteTarget.id);
      toast.success(`Voucher ${deleteTarget.voucher_no} deleted.`);
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const handlePost = async () => {
    if (!postTarget || !user?.id) return;
    setBusy(true);
    try {
      await postVoucher(user.id, postTarget.id);
      toast.success(`Voucher ${postTarget.voucher_no} posted successfully.`);
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setPostTarget(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Accounting</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Vouchers</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Double-entry accounting vouchers. All modules post through this engine.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV(vouchers)}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button onClick={() => navigate("/accounting/vouchers/new")}>
              <Plus className="h-4 w-4 mr-1" /> New Voucher
            </Button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total (Page)", value: total, plain: true },
            { label: "Posted", value: kpis.posted, tone: "text-emerald-600" },
            { label: "Draft", value: kpis.draft, tone: "text-amber-600" },
            { label: "Value (Page)", value: `₹ ${fmtInr(kpis.totalAmt)}`, plain: true },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
              <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${(k as any).tone ?? "text-foreground"}`}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by voucher no or narration…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Type filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              {VOUCHER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Status</SelectItem>
              {VOUCHER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm self-center">–</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            placeholder="To"
          />
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Voucher No</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Narration</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FileDown className="h-10 w-10 opacity-30" />
                        <p className="font-medium">No vouchers found</p>
                        <p className="text-sm">Create your first voucher to get started.</p>
                        <Button size="sm" onClick={() => navigate("/accounting/vouchers/new")}>
                          <Plus className="h-4 w-4 mr-1" /> New Voucher
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  vouchers.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/accounting/vouchers/${v.id}`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">
                        {v.voucher_no}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {v.voucher_date}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={typeTone[v.voucher_type] ?? ""}>
                          {v.voucher_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[220px] truncate">
                        {v.narration || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={statusTone[v.status]}>
                          {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        ₹ {fmtInr(v.total_debit ?? 0)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/accounting/vouchers/${v.id}`)}>
                              <Eye className="h-4 w-4 mr-2" /> View
                            </DropdownMenuItem>
                            {v.status === "draft" && (
                              <>
                                <DropdownMenuItem onClick={() => navigate(`/accounting/vouchers/${v.id}/edit`)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-emerald-600"
                                  onClick={() => setPostTarget(v)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" /> Post
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(v)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="px-3 py-1 rounded border border-border text-xs">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher <strong>{deleteTarget?.voucher_no}</strong> will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post confirmation */}
      <AlertDialog open={!!postTarget} onOpenChange={() => setPostTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher <strong>{postTarget?.voucher_no}</strong> will be posted.
              Posted vouchers cannot be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} disabled={busy}>
              Post Voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
