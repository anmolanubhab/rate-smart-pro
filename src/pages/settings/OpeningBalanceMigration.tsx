import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Lock, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { fmtInr, computeClosingStockValue } from "@/lib/accounting";
import { validateLedgerImportRows, validatePartyImportRows } from "@/lib/migrationImport";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MigStatus = "not_started" | "in_progress" | "finalized";

type Recon = {
  status: MigStatus;
  migration_date: string | null;
  total_dr: number;
  total_cr: number;
  difference: number;
  asset_total: number;
  liability_total: number;
  capital_total: number;
  income_total: number;
  expense_total: number;
  line_count: number;
};

type LedgerLite = { id: string; name: string; ledger_type: string; group?: { name: string; nature: string } | null };
type PartyLite = { id: string; name: string; preferred_customer: boolean | null; preferred_supplier: boolean | null };

const NATURE_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", capital: "Capital / Equity", income: "Income", expense: "Expenses",
};

export default function OpeningBalanceMigration() {
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);
  const [migDate, setMigDate] = useState("");
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const ledgerCsvRef = useRef<HTMLInputElement>(null);
  const partyCsvRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  useEffect(() => { document.title = "Opening Balance / Migration — RD Pro"; }, []);

  const { data: recon, isLoading: reconLoading } = useQuery({
    queryKey: ["mig-reconciliation", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mig_reconciliation" as any, { _business_id: business!.id });
      if (error) throw error;
      return (data?.[0] ?? null) as Recon | null;
    },
    refetchInterval: false,
  });

  useEffect(() => {
    if (recon?.migration_date && !migDate) setMigDate(recon.migration_date);
  }, [recon, migDate]);

  const status: MigStatus = recon?.status ?? "not_started";
  const finalized = status === "finalized";
  const started = status !== "not_started";

  const { data: ledgers = [] } = useQuery({
    queryKey: ["mig-ledgers", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_accounts")
        .select("id, name, ledger_type, group:account_groups(name, nature)")
        .eq("business_id", business!.id)
        .is("party_id", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LedgerLite[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["mig-parties", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id, name, preferred_customer, preferred_supplier")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PartyLite[];
    },
  });

  const { data: existingLines = {} } = useQuery({
    queryKey: ["mig-lines", business?.id, status],
    enabled: !!business?.id && started,
    queryFn: async () => {
      const { data: settings } = await supabase
        .from("business_migration_settings" as any)
        .select("voucher_id")
        .eq("business_id", business!.id)
        .maybeSingle();
      const voucherId = (settings as any)?.voucher_id;
      if (!voucherId) return {} as Record<string, { ledger_account_id: string; amount: number; dr_cr: "dr" | "cr" }>;
      const { data, error } = await supabase
        .from("voucher_items")
        .select("ledger_account_id, dr_amount, cr_amount")
        .eq("voucher_id", voucherId);
      if (error) throw error;
      const map: Record<string, { ledger_account_id: string; amount: number; dr_cr: "dr" | "cr" }> = {};
      for (const it of data ?? []) {
        const amt = Number(it.dr_amount) > 0 ? Number(it.dr_amount) : Number(it.cr_amount);
        map[it.ledger_account_id] = { ledger_account_id: it.ledger_account_id, amount: amt, dr_cr: Number(it.dr_amount) > 0 ? "dr" : "cr" };
      }
      return map;
    },
  });

  const { data: stockTotal = 0 } = useQuery({
    queryKey: ["mig-stock-total", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("stock, purchase_price, cost_price, dealer_rate, mrp")
        .eq("business_id", business!.id)
        .is("is_deleted", null);
      if (error) throw error;
      return computeClosingStockValue((data ?? []) as any);
    },
  });

  const startMigration = async () => {
    if (!business?.id || !migDate) return;
    try {
      const { error } = await supabase.rpc("mig_start" as any, { _business_id: business.id, _migration_date: migDate });
      if (error) throw error;
      await logAudit({ business_id: business.id, action: "MIGRATION_OPENING_BALANCE_STARTED", entity_type: "business_migration_settings", new_value: { migration_date: migDate } });
      toast.success("Migration window opened. Enter opening balances below.");
      qc.invalidateQueries({ queryKey: ["mig-reconciliation", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const setLedgerOpening = async (ledgerId: string, amount: number, drCr: "dr" | "cr") => {
    if (!business?.id) return;
    try {
      const { error } = await supabase.rpc("mig_set_ledger_opening" as any, {
        _business_id: business.id, _ledger_account_id: ledgerId, _amount: amount, _dr_cr: drCr, _narration: "Opening balance — migration",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["mig-reconciliation", business.id] });
      qc.invalidateQueries({ queryKey: ["mig-lines", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const setPartyOpening = async (partyId: string, amount: number, drCr: "dr" | "cr") => {
    if (!business?.id) return;
    try {
      const { error } = await supabase.rpc("mig_set_party_opening" as any, {
        _business_id: business.id, _party_id: partyId, _amount: amount, _dr_cr: drCr, _narration: "Opening balance — migration",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["mig-reconciliation", business.id] });
      qc.invalidateQueries({ queryKey: ["mig-lines", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const finalize = async () => {
    if (!business?.id) return;
    try {
      const { error } = await supabase.rpc("mig_finalize" as any, { _business_id: business.id });
      if (error) throw error;
      await logAudit({ business_id: business.id, action: "MIGRATION_OPENING_BALANCE_FINALIZED", entity_type: "business_migration_settings" });
      toast.success("Opening balances finalized and locked.");
      qc.invalidateQueries({ queryKey: ["mig-reconciliation", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmFinalize(false);
    }
  };

  const importLedgerCsv = async (file: File) => {
    const text = await file.text();
    const { valid, errors } = validateLedgerImportRows(text, ledgers as LedgerLite[]);
    for (const row of valid) {
      await setLedgerOpening(row.ledgerId, row.amount, row.drCr);
    }
    setImportErrors(errors);
    if (valid.length) toast.success(`Imported ${valid.length} ledger opening balance${valid.length === 1 ? "" : "s"}`);
    if (errors.length) toast.error(`${errors.length} row(s) skipped — see validation list below`);
  };

  const importPartyCsv = async (file: File) => {
    const text = await file.text();
    const { valid, errors } = validatePartyImportRows(text, parties as PartyLite[]);
    for (const row of valid) {
      await setPartyOpening(row.partyId, row.amount, row.drCr);
    }
    setImportErrors(errors);
    if (valid.length) toast.success(`Imported ${valid.length} party opening balance${valid.length === 1 ? "" : "s"}`);
    if (errors.length) toast.error(`${errors.length} row(s) skipped — see validation list below`);
  };

  const diffZero = (recon?.difference ?? 0) < 0.01 && (recon?.line_count ?? 0) >= 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Opening Balance / Migration</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Enter closing balances from your previous accounting system (Tally, Busy, Easy, or any
          other ERP) as of the day before your migration date. These become opening balances from
          the migration date onward. Every debit and credit posted here shares one Opening Balance
          Voucher — the same source that feeds the Trial Balance, Party Statement, Ledger Statement
          and Balance Sheet, so nothing here can silently drift from those reports.
        </p>
        {finalized && (
          <Badge variant="secondary" className="mt-3"><Lock className="h-3 w-3 mr-1" />Finalized — locked</Badge>
        )}
      </header>

      <section className="rounded-2xl bg-card border p-6 space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Migration / Books Start Date</Label>
        <p className="text-sm text-muted-foreground">
          Example: 01-04-2027. Balances entered below are dated as of the day before this date and
          become your opening position from this date onward.
        </p>
        <div className="flex gap-3 items-end">
          <Input type="date" value={migDate} onChange={(e) => setMigDate(e.target.value)} disabled={finalized} className="max-w-xs" />
          {editable && !finalized && (
            <Button onClick={startMigration} disabled={!migDate}>
              <CalendarClock className="h-4 w-4 mr-1" /> {started ? "Update date" : "Start migration"}
            </Button>
          )}
          {finalized && <span className="text-sm text-muted-foreground">Migration date: {recon?.migration_date}</span>}
        </div>
      </section>

      {started && (
        <>
          <Tabs defaultValue="ledgers">
            <TabsList>
              <TabsTrigger value="ledgers">Ledger Opening</TabsTrigger>
              <TabsTrigger value="parties">Party Opening</TabsTrigger>
              <TabsTrigger value="stock">Stock &amp; Fixed Assets</TabsTrigger>
              <TabsTrigger value="reconcile">Reconciliation &amp; Finalize</TabsTrigger>
            </TabsList>

            <TabsContent value="ledgers" className="space-y-4">
              <section className="rounded-2xl bg-card border p-6">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold">Ledger opening balances</h2>
                  {editable && !finalized && (
                    <>
                      <input ref={ledgerCsvRef} type="file" accept=".csv" className="hidden"
                        onChange={(e) => e.target.files?.[0] && importLedgerCsv(e.target.files[0])} />
                      <Button size="sm" variant="outline" onClick={() => ledgerCsvRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  CSV columns: Ledger Name, Group, Opening Balance, Dr/Cr
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ledger</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Dr/Cr</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ledgers as LedgerLite[]).map((l) => {
                        const line = existingLines[l.id];
                        return (
                          <LedgerRowEditor
                            key={l.id}
                            ledger={l}
                            line={line}
                            disabled={!editable || finalized}
                            onSave={(amount, drcr) => setLedgerOpening(l.id, amount, drcr)}
                            onRemove={() => setLedgerOpening(l.id, 0, "dr")}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="parties" className="space-y-4">
              <section className="rounded-2xl bg-card border p-6">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold">Party opening balances</h2>
                  {editable && !finalized && (
                    <>
                      <input ref={partyCsvRef} type="file" accept=".csv" className="hidden"
                        onChange={(e) => e.target.files?.[0] && importPartyCsv(e.target.files[0])} />
                      <Button size="sm" variant="outline" onClick={() => partyCsvRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  CSV columns: Party Name, Party Type, Opening Balance, Dr/Cr. Customers are usually
                  Dr (they owe you), suppliers are usually Cr (you owe them) — but either can carry
                  the opposite balance if it's genuinely an advance.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Party</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Dr/Cr</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parties as PartyLite[]).filter((p) => p.preferred_customer || p.preferred_supplier).map((p) => (
                        <PartyRowEditor
                          key={p.id}
                          party={p}
                          disabled={!editable || finalized}
                          onSave={(amount, drcr) => setPartyOpening(p.id, amount, drcr)}
                          onRemove={() => setPartyOpening(p.id, 0, "dr")}
                        />
                      ))}
                      {(parties as PartyLite[]).filter((p) => p.preferred_customer || p.preferred_supplier).length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                          No parties classified as Customer or Supplier yet.
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="stock" className="space-y-4">
              <section className="rounded-2xl bg-card border p-6 space-y-3">
                <h2 className="font-semibold">Stock opening</h2>
                <p className="text-sm text-muted-foreground">
                  Product-wise opening quantity, unit cost and value are set on each product's own
                  record (Products → Opening Stock), the same mechanism this business already uses —
                  it posts its own Dr Opening Stock / Cr Capital Account entry automatically and is
                  already included in the Trial Balance below. This wizard doesn't duplicate that
                  entry; it only shows the total for reference.
                </p>
                <div className="text-2xl font-bold">{fmtInr(stockTotal)}</div>
                <p className="text-xs text-muted-foreground">Sum of current product stock × unit cost, at the same cost basis used everywhere else (Stock Valuation, Balance Sheet).</p>
              </section>
              <section className="rounded-2xl bg-card border p-6 space-y-3">
                <h2 className="font-semibold">Fixed assets</h2>
                <p className="text-sm text-muted-foreground">
                  Enter each fixed asset's net book value as a Dr line against a ledger under the
                  "Fixed Assets" group in the Ledger Opening tab above (create one ledger per asset,
                  or a combined one, from Ledger Accounts first). RD Pro does not currently track
                  accumulated depreciation as a separate figure — enter the net value only; do not
                  post historical depreciation as a current-year expense.
                </p>
              </section>
            </TabsContent>

            <TabsContent value="reconcile" className="space-y-4">
              <ReconciliationPanel
                recon={recon ?? null}
                loading={reconLoading}
                editable={editable}
                finalized={finalized}
                onFinalize={() => setConfirmFinalize(true)}
              />
              {importErrors.length > 0 && (
                <section className="rounded-2xl bg-destructive/5 border border-destructive/30 p-4 text-sm space-y-1">
                  <p className="font-medium text-destructive">Import validation issues (not applied):</p>
                  {importErrors.map((e, i) => <p key={i} className="text-destructive/90">{e}</p>)}
                </section>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Opening Balances?</AlertDialogTitle>
            <AlertDialogDescription>
              This posts the Opening Balance Voucher and locks it permanently — after this, opening
              balances can only be corrected through an Opening Balance Adjustment journal, not
              edited directly. This only succeeds if Total Debit exactly equals Total Credit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={finalize} disabled={!diffZero}>Finalize Opening Balances</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LedgerRowEditor({ ledger, line, disabled, onSave, onRemove }: {
  ledger: LedgerLite; line?: { amount: number; dr_cr: "dr" | "cr" }; disabled: boolean;
  onSave: (amount: number, drcr: "dr" | "cr") => void; onRemove: () => void;
}) {
  const [amount, setAmount] = useState(line?.amount ?? 0);
  const [drcr, setDrcr] = useState<"dr" | "cr">(line?.dr_cr ?? "dr");
  useEffect(() => { setAmount(line?.amount ?? 0); setDrcr(line?.dr_cr ?? "dr"); }, [line]);
  return (
    <TableRow>
      <TableCell className="font-medium">{ledger.name}</TableCell>
      <TableCell className="text-muted-foreground">{ledger.group?.name ?? "—"}</TableCell>
      <TableCell className="text-right">
        <Input type="number" min={0} step="0.01" className="w-32 ml-auto text-right" value={amount}
          disabled={disabled} onChange={(e) => setAmount(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <Select value={drcr} onValueChange={(v) => setDrcr(v as "dr" | "cr")} disabled={disabled}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="dr">Dr</SelectItem><SelectItem value="cr">Cr</SelectItem></SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {!disabled && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => onSave(amount, drcr)} disabled={amount <= 0}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            {line && <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function PartyRowEditor({ party, disabled, onSave, onRemove }: {
  party: PartyLite; disabled: boolean; onSave: (amount: number, drcr: "dr" | "cr") => void; onRemove: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [drcr, setDrcr] = useState<"dr" | "cr">(party.preferred_customer ? "dr" : "cr");
  return (
    <TableRow>
      <TableCell className="font-medium">{party.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {party.preferred_customer && party.preferred_supplier ? "Customer & Supplier" : party.preferred_customer ? "Customer" : "Supplier"}
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" min={0} step="0.01" className="w-32 ml-auto text-right" value={amount}
          disabled={disabled} onChange={(e) => setAmount(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <Select value={drcr} onValueChange={(v) => setDrcr(v as "dr" | "cr")} disabled={disabled}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="dr">Dr</SelectItem><SelectItem value="cr">Cr</SelectItem></SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {!disabled && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => onSave(amount, drcr)} disabled={amount <= 0}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function ReconciliationPanel({ recon, loading, editable, finalized, onFinalize }: {
  recon: Recon | null; loading: boolean; editable: boolean; finalized: boolean; onFinalize: () => void;
}) {
  const diff = recon?.difference ?? 0;
  const zero = diff < 0.01;
  return (
    <section className="rounded-2xl bg-card border p-6 space-y-4">
      <h2 className="font-semibold">Opening Balance Summary</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <SummaryStat label="Assets" value={recon?.asset_total ?? 0} />
            <SummaryStat label="Liabilities" value={recon?.liability_total ?? 0} />
            <SummaryStat label="Capital / Equity" value={recon?.capital_total ?? 0} />
            <SummaryStat label="Income" value={recon?.income_total ?? 0} />
            <SummaryStat label="Expenses" value={recon?.expense_total ?? 0} />
            <SummaryStat label="Lines entered" value={recon?.line_count ?? 0} isCount />
          </div>
          <div className="border-t pt-4 grid grid-cols-3 gap-4">
            <SummaryStat label="Opening Debits" value={recon?.total_dr ?? 0} big />
            <SummaryStat label="Opening Credits" value={recon?.total_cr ?? 0} big />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Difference</p>
              <p className={`text-2xl font-bold ${zero ? "text-emerald-600" : "text-destructive"}`}>{fmtInr(diff)}</p>
            </div>
          </div>
          {!zero && (
            <p className="text-sm text-destructive">
              Opening Balance Difference — Total Debit does not equal Total Credit. Add or adjust a
              line (an explicit equity/suspense ledger if needed) until this is ₹0. Migration cannot
              be finalized while a difference remains.
            </p>
          )}
          {editable && !finalized && (
            <Button onClick={onFinalize} disabled={!zero || loading}>
              <Lock className="h-4 w-4 mr-1" /> Finalize Opening Balances
            </Button>
          )}
          {finalized && (
            <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Finalized — opening balances are locked</Badge>
          )}
        </>
      )}
    </section>
  );
}

function SummaryStat({ label, value, big, isCount }: { label: string; value: number; big?: boolean; isCount?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={big ? "text-xl font-bold" : "font-semibold"}>{isCount ? value : fmtInr(value)}</p>
    </div>
  );
}
