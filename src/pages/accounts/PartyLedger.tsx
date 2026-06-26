// src/pages/accounts/PartyLedger.tsx
// Route: /accounts/party/:partyId
// Party Ledger — central drill-down page of the accounting system.
// Enhanced with: Quick Filters, Search, Print, Export, Voucher drill-down.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, User, Printer, FileSpreadsheet, FileDown, RefreshCw,
  Search, Calendar, Share2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchPartyLedger,
  fmtInr,
  type PartyLedgerLine,
} from "@/lib/accounting";
import { fetchParties } from "@/lib/parties";

// ── helpers ─────────────────────────────────────────────────────────────────

const toneClass = (balance: number) =>
  balance >= 0 ? "text-emerald-600" : "text-destructive";

const sideBadge = (balance: number) => (balance >= 0 ? "Dr" : "Cr");

const sideToneClass = (balance: number) =>
  balance >= 0
    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
    : "border-destructive/30 text-destructive bg-destructive/5";

function fyStart() {
  const t = new Date();
  const y = t.getFullYear();
  return t.getMonth() >= 3 ? `${y}-04-01` : `${y - 1}-04-01`;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

const QUICK_FILTERS = [
  { label: "Today", getRange: () => { const d = toISO(new Date()); return { from: d, to: d }; } },
  {
    label: "Yesterday",
    getRange: () => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      const s = toISO(d); return { from: s, to: s };
    },
  },
  {
    label: "This Week",
    getRange: () => {
      const now = new Date();
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
      return { from: toISO(mon), to: toISO(now) };
    },
  },
  {
    label: "This Month",
    getRange: () => {
      const now = new Date();
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: toISO(now) };
    },
  },
  {
    label: "This FY",
    getRange: () => ({ from: fyStart(), to: toISO(new Date()) }),
  },
];

// ── CSV / simple export helper ───────────────────────────────────────────────

function downloadCSV(rows: PartyLedgerLine[], opening: number, closing: number, partyName: string) {
  const lines = [
    ["Date", "Voucher #", "Type", "Narration", "Debit", "Credit", "Running Balance", "Dr/Cr"],
    ["", "Opening Balance", "", "", "", "", Math.abs(opening).toFixed(2), opening >= 0 ? "Dr" : "Cr"],
    ...rows.map((r) => [
      r.date, r.voucher_number, r.voucher_type,
      (r.narration ?? "").replace(/,/g, " "),
      r.dr > 0 ? r.dr.toFixed(2) : "",
      r.cr > 0 ? r.cr.toFixed(2) : "",
      Math.abs(r.running_balance).toFixed(2),
      r.running_balance >= 0 ? "Dr" : "Cr",
    ]),
    ["", "Closing Balance", "", "", "", "", Math.abs(closing).toFixed(2), closing >= 0 ? "Dr" : "Cr"],
  ];
  const csv = lines.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${partyName.replace(/\s+/g, "_")}_Ledger.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── component ────────────────────────────────────────────────────────────────

export default function PartyLedger() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Party Ledger — RD Pro"; }, []);

  // date range
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(toISO(new Date()));
  const [activeQuick, setActiveQuick] = useState<string | null>("This FY");

  // search
  const [search, setSearch] = useState("");

  // parties list for name lookup
  const { data: parties = [] } = useQuery({
    queryKey: ["parties", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchParties(user!.id),
  });
  const party = parties.find((p) => p.id === partyId);

  // ledger data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["party-ledger", user?.id, partyId, from, to],
    enabled: !!user?.id && !!partyId,
    queryFn: () => fetchPartyLedger(user!.id, partyId!, { from, to }),
  });

  const { ledger, lines = [], closingBalance = 0 } = data ?? {};

  const openingBalance = useMemo(() => {
    if (!ledger) return 0;
    const sign = ledger.opening_balance_type === "cr" ? -1 : 1;
    return Number(ledger.opening_balance ?? 0) * sign;
  }, [ledger]);

  const totalDr = lines.reduce((s, l) => s + l.dr, 0);
  const totalCr = lines.reduce((s, l) => s + l.cr, 0);

  // filtered lines (search)
  const filteredLines = useMemo(() => {
    if (!search.trim()) return lines;
    const q = search.toLowerCase();
    return lines.filter(
      (l) =>
        l.voucher_number.toLowerCase().includes(q) ||
        (l.narration ?? "").toLowerCase().includes(q) ||
        String(l.dr).includes(q) ||
        String(l.cr).includes(q)
    );
  }, [lines, search]);

  // quick filter apply
  const applyQuick = (label: string, getRange: () => { from: string; to: string }) => {
    const r = getRange();
    setFrom(r.from);
    setTo(r.to);
    setActiveQuick(label);
  };

  // print
  const handlePrint = () => window.print();

  // export
  const handleExportCSV = () => {
    downloadCSV(filteredLines, openingBalance, closingBalance, party?.name ?? ledger?.name ?? "Party");
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body > *:not(#party-ledger-print-root) { display: none !important; }
          #party-ledger-print-root { display: block !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div id="party-ledger-print-root" className="max-w-7xl mx-auto space-y-5 animate-fade-in-up">

        {/* ── Top Action Bar ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 no-print">
          {/* Back */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground w-fit"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: `${party?.name ?? "Party"} Ledger`, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
          </div>
        </div>

        {/* ── Header ── */}
        <header ref={printRef}>
          <p className="text-sm text-muted-foreground font-medium">Accounts · Party Statement</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1 flex items-center gap-3">
            <User className="h-7 w-7 text-muted-foreground" />
            {party?.name ?? ledger?.name ?? "Party Ledger"}
          </h1>
          {party?.phone && (
            <p className="text-muted-foreground mt-1">{party.phone}</p>
          )}
          {party?.gst && (
            <p className="text-xs text-muted-foreground">GST: {party.gst}</p>
          )}
        </header>

        {/* ── Date Filter + Quick Filters ── */}
        <div className="flex flex-col gap-3 no-print">
          {/* Custom date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date" value={from}
              onChange={(e) => { setFrom(e.target.value); setActiveQuick(null); }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <input
              type="date" value={to}
              onChange={(e) => { setTo(e.target.value); setActiveQuick(null); }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
          </div>

          {/* Quick filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {QUICK_FILTERS.map((qf) => (
              <button
                key={qf.label}
                onClick={() => applyQuick(qf.label, qf.getRange)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
                  ${activeQuick === qf.label
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary bg-background"
                  }`}
              >
                {qf.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── No ledger found ── */}
        {!isLoading && !ledger && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
            <p className="font-medium">No ledger found for this party.</p>
            <p className="text-sm mt-1">
              "Sync from existing data" button use karein Ledger Accounts page pe.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/accounts/ledgers")}>
              Go to Ledger Accounts
            </Button>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-destructive text-sm">
            {(error as Error).message}
          </div>
        )}

        {ledger && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Opening Balance</p>
                <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${toneClass(openingBalance)}`}>
                  ₹ {fmtInr(Math.abs(openingBalance))}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{sideBadge(openingBalance)} side</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Debit</p>
                <p className="font-display text-2xl font-bold mt-2 tabular-nums text-emerald-600">
                  ₹ {fmtInr(totalDr)}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Credit</p>
                <p className="font-display text-2xl font-bold mt-2 tabular-nums text-amber-600">
                  ₹ {fmtInr(totalCr)}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Closing Balance</p>
                <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${toneClass(closingBalance)}`}>
                  ₹ {fmtInr(Math.abs(closingBalance))}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{sideBadge(closingBalance)} side</p>
              </div>
            </div>

            {/* ── Search bar ── */}
            <div className="relative no-print">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by voucher number, narration, or amount…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* ── Ledger Table ── */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Voucher #</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Narration</th>
                      <th className="px-4 py-3 text-right">Debit (Dr)</th>
                      <th className="px-4 py-3 text-right">Credit (Cr)</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-center">Dr/Cr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{from}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs" colSpan={3}>Opening Balance</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        ₹ {fmtInr(Math.abs(openingBalance))}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={sideToneClass(openingBalance)}>
                          {sideBadge(openingBalance)}
                        </Badge>
                      </td>
                    </tr>

                    {/* Transaction rows */}
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading…</td>
                      </tr>
                    ) : filteredLines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                          {search ? "No matching transactions found." : "Is period mein koi transactions nahi hain."}
                        </td>
                      </tr>
                    ) : (
                      filteredLines.map((line: PartyLedgerLine, i: number) => (
                        <tr key={i} className="border-t border-border hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {line.date}
                          </td>
                          {/* Clickable voucher number */}
                          <td className="px-4 py-2.5">
                            <button
                              className="font-mono text-xs text-primary hover:underline"
                              onClick={() => navigate(`/accounts/vouchers?id=${line.voucher_id}`)}
                            >
                              {line.voucher_number}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                              {line.voucher_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                            {line.narration ?? "—"}
                          </td>
                          {/* Debit — green */}
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">
                            {line.dr > 0 ? `₹ ${fmtInr(line.dr)}` : "—"}
                          </td>
                          {/* Credit — red/amber */}
                          <td className="px-4 py-2.5 text-right tabular-nums text-destructive font-medium">
                            {line.cr > 0 ? `₹ ${fmtInr(line.cr)}` : "—"}
                          </td>
                          {/* Running balance — green=Dr, red=Cr */}
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${toneClass(line.running_balance)}`}>
                            ₹ {fmtInr(Math.abs(line.running_balance))}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant="outline" className={sideToneClass(line.running_balance)}>
                              {sideBadge(line.running_balance)}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  {/* Footer: Closing balance */}
                  {lines.length > 0 && (
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 font-semibold text-foreground text-xs uppercase tracking-wider">
                          Closing Balance
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">
                          ₹ {fmtInr(totalDr)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive">
                          ₹ {fmtInr(totalCr)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-lg">
                          ₹ {fmtInr(Math.abs(closingBalance))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className={sideToneClass(closingBalance)}>
                            {sideBadge(closingBalance)}
                          </Badge>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── Print-only footer ── */}
            <div className="print-only mt-8 border-t pt-4 text-xs text-muted-foreground flex justify-between">
              <span>Generated on {new Date().toLocaleDateString("en-IN")}</span>
              <span>Period: {from} to {to}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
