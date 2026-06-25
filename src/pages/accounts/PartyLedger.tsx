// src/pages/accounts/PartyLedger.tsx
// Route: /accounts/party/:partyId
// Shows a full running-balance ledger statement for one party.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchPartyLedger,
  fmtInr,
  type PartyLedgerLine,
} from "@/lib/accounting";
import { fetchParties } from "@/lib/parties";

// ── helpers ─────────────────────────────────────────────────────────────────

const toneClass = (balance: number) =>
  balance >= 0
    ? "text-emerald-600"
    : "text-destructive";

const sideBadge = (balance: number) =>
  balance >= 0 ? "Dr" : "Cr";

const sideToneClass = (balance: number) =>
  balance >= 0
    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
    : "border-destructive/30 text-destructive bg-destructive/5";

// ── component ────────────────────────────────────────────────────────────────

export default function PartyLedger() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    document.title = "Party Ledger — RD Pro";
  }, []);

  // date range filter
  const today = new Date();
  const fyStart = today.getMonth() >= 3
    ? `${today.getFullYear()}-04-01`
    : `${today.getFullYear() - 1}-04-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  // parties list for the selector
  const { data: parties = [] } = useQuery({
    queryKey: ["parties", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchParties(user!.id),
  });

  // selected party info
  const party = parties.find((p) => p.id === partyId);

  // ledger data
  const { data, isLoading, error } = useQuery({
    queryKey: ["party-ledger", user?.id, partyId, from, to],
    enabled: !!user?.id && !!partyId,
    queryFn: () =>
      fetchPartyLedger(user!.id, partyId!, { from, to }),
  });

  const { ledger, lines = [], closingBalance = 0 } = data ?? {};

  const openingBalance = useMemo(() => {
    if (!ledger) return 0;
    const sign = ledger.opening_balance_type === "cr" ? -1 : 1;
    return Number(ledger.opening_balance ?? 0) * sign;
  }, [ledger]);

  const totalDr = lines.reduce((s, l) => s + l.dr, 0);
  const totalCr = lines.reduce((s, l) => s + l.cr, 0);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => navigate("/accounts/ledgers")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Ledger Accounts
            </Button>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Accounts · Party Statement
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1 flex items-center gap-3">
            <User className="h-7 w-7 text-muted-foreground" />
            {party?.name ?? ledger?.name ?? "Party Ledger"}
          </h1>
          {party?.phone && (
            <p className="text-muted-foreground mt-1">{party.phone}</p>
          )}
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
        </div>
      </header>

      {/* No ledger found */}
      {!isLoading && !ledger && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          <p className="font-medium">No ledger found for this party.</p>
          <p className="text-sm mt-1">
            "Sync from existing data" button use karein Ledger Accounts page pe.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/accounts/ledgers")}
          >
            Go to Ledger Accounts
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-destructive text-sm">
          {(error as Error).message}
        </div>
      )}

      {ledger && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Opening Balance
              </p>
              <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${toneClass(openingBalance)}`}>
                ₹ {fmtInr(Math.abs(openingBalance))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sideBadge(openingBalance)} side
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Total Debit
              </p>
              <p className="font-display text-2xl font-bold mt-2 tabular-nums text-emerald-600">
                ₹ {fmtInr(totalDr)}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Total Credit
              </p>
              <p className="font-display text-2xl font-bold mt-2 tabular-nums text-amber-600">
                ₹ {fmtInr(totalCr)}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Closing Balance
              </p>
              <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${toneClass(closingBalance)}`}>
                ₹ {fmtInr(Math.abs(closingBalance))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sideBadge(closingBalance)} side
              </p>
            </div>
          </div>

          {/* Ledger Table */}
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
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {from}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs" colSpan={3}>
                      Opening Balance
                    </td>
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
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        Is period mein koi transactions nahi hain.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line: PartyLedgerLine, i: number) => (
                      <tr
                        key={i}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                          {line.date}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {line.voucher_number}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                            {line.voucher_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                          {line.narration ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">
                          {line.dr > 0 ? `₹ ${fmtInr(line.dr)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-600 font-medium">
                          {line.cr > 0 ? `₹ ${fmtInr(line.cr)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                          ₹ {fmtInr(Math.abs(line.running_balance))}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={sideToneClass(line.running_balance)}
                          >
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
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-600">
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
        </>
      )}
    </div>
  );
}
