import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Lock, Upload, Trash2, Plus, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, type BusinessRole } from "@/hooks/useBusiness";
import { canGranular, canHardDelete, canUnlockVouchers, type FinancialRights } from "@/lib/permissions";
import type { PermissionMatrix } from "@/lib/permissionMatrix";
import { useAuth } from "@/hooks/useAuth";
import { deleteVoucher, repostVoucherItems } from "@/lib/voucherService";
import { fmtInr, computeClosingStockValue } from "@/lib/accounting";
import { validateLedgerImportRows, validatePartyImportRows, validateStockImportRows } from "@/lib/migrationImport";
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
import { HardDeleteVoucherDialog } from "@/components/vouchers/HardDeleteVoucherDialog";

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
type ProductLite = { id: string; part_number: string; name: string };
type StockLine = { product_id: string; product_name: string; part_number: string; qty: number; unit_cost: number; value: number };
type LedgerForAdjustment = { id: string; name: string; party_id: string | null; group?: { name: string; nature: string } | null };
type PostedAdjustmentVoucher = {
  id: string; voucher_number: string; voucher_date: string; narration: string | null; total_amount: number;
  voucher_items: { id: string; ledger_account_id: string; dr_amount: number; cr_amount: number; narration: string | null; ledger_accounts: { name: string } | null }[];
};

const NATURE_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", capital: "Capital / Equity", income: "Income", expense: "Expenses",
};

export default function OpeningBalanceMigration() {
  const { business, role, permissions, financialRights } = useBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);
  const [migDate, setMigDate] = useState("");
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const ledgerCsvRef = useRef<HTMLInputElement>(null);
  const partyCsvRef = useRef<HTMLInputElement>(null);
  const stockCsvRef = useRef<HTMLInputElement>(null);
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

  // Adjustment lines can target a party's own ledger, so this pulls every
  // ledger (party-linked included) — unlike `ledgers` above, which excludes
  // party ledgers because the Ledger Opening tab only sets general ledgers.
  const { data: allLedgers = [] } = useQuery({
    queryKey: ["mig-all-ledgers", business?.id],
    enabled: !!business?.id && finalized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_accounts")
        .select("id, name, party_id, group:account_groups(name, nature)")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LedgerForAdjustment[];
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

  // Products, for the bulk stock-import CSV to match by Part Number — only
  // fetched while the migration is actually open, since this list can be
  // large and is otherwise unused on this page.
  const { data: products = [] } = useQuery({
    queryKey: ["mig-products", business?.id],
    enabled: !!business?.id && started && !finalized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, part_number, name")
        .eq("business_id", business!.id)
        .is("is_deleted", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductLite[];
    },
  });

  // Products currently carrying a migration-tracked opening stock line (read
  // via mig_stock_lines(), the same inventory_movements rows
  // mig_set_product_opening_stock() writes) — this is what's actually been
  // imported so far, distinct from the broader stockTotal reference figure
  // below which covers every product regardless of import path.
  const { data: stockLines = [] } = useQuery({
    queryKey: ["mig-stock-lines", business?.id],
    enabled: !!business?.id && started,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mig_stock_lines" as any, { _business_id: business!.id });
      if (error) throw error;
      return (data ?? []) as StockLine[];
    },
  });

  const migratedStockTotal = stockLines.reduce((s, l) => s + Number(l.value), 0);

  const setProductStockOpening = async (productId: string, qty: number, unitCost: number) => {
    if (!business?.id) return;
    try {
      const { error } = await supabase.rpc("mig_set_product_opening_stock" as any, {
        _business_id: business.id, _product_id: productId, _qty: qty, _unit_cost: unitCost, _narration: "Opening stock — migration",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["mig-reconciliation", business.id] });
      qc.invalidateQueries({ queryKey: ["mig-stock-lines", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const importStockCsv = async (file: File) => {
    const text = await file.text();
    const { valid, errors } = validateStockImportRows(text, products as ProductLite[]);
    for (const row of valid) {
      await setProductStockOpening(row.productId, row.qty, row.unitCost);
    }
    setImportErrors(errors);
    if (valid.length) toast.success(`Imported ${valid.length} product opening stock line${valid.length === 1 ? "" : "s"}`);
    if (errors.length) toast.error(`${errors.length} row(s) skipped — see validation list below`);
  };

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
              <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
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
                <div className="flex justify-between items-center">
                  <h2 className="font-semibold">Bulk opening stock (migration)</h2>
                  {editable && !finalized && (
                    <>
                      <input ref={stockCsvRef} type="file" accept=".csv" className="hidden"
                        onChange={(e) => e.target.files?.[0] && importStockCsv(e.target.files[0])} />
                      <Button size="sm" variant="outline" onClick={() => stockCsvRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  CSV columns: Part Number, Product, Opening Qty, Opening Cost. Matches an existing
                  product by Part Number — it never creates one. Every product's own initial stock
                  movement stays product-wise (Stock Summary, Movement Register), but the accounting
                  does not — all imported products aggregate into ONE "Opening Stock" line on the
                  shared Opening Balance Voucher above, never one voucher per product. This does not
                  auto-post a matching Capital line; balance it the same way as everything else, with
                  an explicit Capital/Reserves line on the Ledger Opening tab.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stockLines as StockLine[]).map((l) => (
                        <TableRow key={l.product_id}>
                          <TableCell className="font-medium">{l.product_name}</TableCell>
                          <TableCell className="text-muted-foreground">{l.part_number}</TableCell>
                          <TableCell className="text-right">{l.qty}</TableCell>
                          <TableCell className="text-right">{fmtInr(l.unit_cost)}</TableCell>
                          <TableCell className="text-right font-medium">{fmtInr(l.value)}</TableCell>
                          <TableCell>
                            {editable && !finalized && (
                              <Button size="sm" variant="ghost" onClick={() => setProductStockOpening(l.product_id, 0, 0)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(stockLines as StockLine[]).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                          No products imported yet — use Import CSV above.
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Opening Stock (migration total)</p>
                  <p className="text-xl font-bold">{fmtInr(migratedStockTotal)}</p>
                </div>
              </section>
              <section className="rounded-2xl bg-card border p-6 space-y-3">
                <h2 className="font-semibold">Stock opening — normal product creation</h2>
                <p className="text-sm text-muted-foreground">
                  Products created or edited directly (Products page, or Products → Import Excel,
                  outside this wizard) keep working exactly as before — each one posts its own
                  Dr Opening Stock / Cr Capital Account voucher automatically. That's a separate path
                  from the bulk migration import above and is not duplicated by it; a product's value
                  is only ever claimed by one or the other.
                </p>
                <div className="text-2xl font-bold">{fmtInr(stockTotal)}</div>
                <p className="text-xs text-muted-foreground">Sum of current product stock × unit cost across every product, regardless of import path — the same cost basis used everywhere else (Stock Valuation, Balance Sheet).</p>
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

            <TabsContent value="adjustments" className="space-y-4">
              <AdjustmentPanel
                businessId={business?.id ?? null}
                ledgers={allLedgers as LedgerForAdjustment[]}
                finalized={finalized}
                editable={editable}
                migrationDate={recon?.migration_date ?? null}
                userId={user?.id ?? null}
                role={role}
                permissions={permissions}
                financialRights={financialRights}
                onPosted={() => qc.invalidateQueries({ queryKey: ["mig-reconciliation", business?.id] })}
              />
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

type AdjustmentLine = { key: string; ledgerId: string; drcr: "dr" | "cr"; amount: number; narration: string };

function newAdjustmentLine(drcr: "dr" | "cr"): AdjustmentLine {
  return { key: crypto.randomUUID(), ledgerId: "", drcr, amount: 0, narration: "" };
}

// Once finalized, the wizard itself is locked — this posts a normal journal
// via mig_create_adjustment (tagged reference_type: 'opening_balance_adjustment'
// and linked back to the original Opening Balance Voucher) so post-finalize
// corrections still show up in Trial Balance, Party Statement and Ledger
// Statement instead of being a silent, untracked edit.
function AdjustmentPanel({ businessId, ledgers, finalized, editable, migrationDate, onPosted, userId, role, permissions, financialRights }: {
  businessId: string | null; ledgers: LedgerForAdjustment[]; finalized: boolean; editable: boolean;
  migrationDate: string | null; onPosted?: () => void;
  userId: string | null; role: BusinessRole | null; permissions: PermissionMatrix | null; financialRights: FinancialRights | null;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("Opening Balance Adjustment");
  const [lines, setLines] = useState<AdjustmentLine[]>([newAdjustmentLine("dr"), newAdjustmentLine("cr")]);
  const [posting, setPosting] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<PostedAdjustmentVoucher | null>(null);
  const [editReason, setEditReason] = useState("");
  const [hardDeleteTarget, setHardDeleteTarget] = useState<PostedAdjustmentVoucher | null>(null);
  const canEditLocked = canUnlockVouchers(role, financialRights);
  const canDeletePosted = canHardDelete(role, permissions, "accounts");

  const { data: postedAdjustments = [], isLoading: loadingAdjustments } = useQuery({
    queryKey: ["mig-adjustments", businessId],
    enabled: !!businessId && finalized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, voucher_number, voucher_date, narration, total_amount, voucher_items ( id, ledger_account_id, dr_amount, cr_amount, narration, ledger_accounts ( name ) )")
        .eq("business_id", businessId!)
        .eq("reference_type", "opening_balance_adjustment")
        .eq("status", "posted")
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PostedAdjustmentVoucher[];
    },
  });

  if (!finalized) {
    return (
      <section className="rounded-2xl bg-card border p-6">
        <p className="text-sm text-muted-foreground">
          Adjustments are only needed once opening balances are finalized and locked. Until then, edit
          balances directly in the tabs above.
        </p>
      </section>
    );
  }

  const totalDr = lines.reduce((s, l) => s + (l.drcr === "dr" ? Number(l.amount) || 0 : 0), 0);
  const totalCr = lines.reduce((s, l) => s + (l.drcr === "cr" ? Number(l.amount) || 0 : 0), 0);
  const diff = Math.round((totalDr - totalCr) * 100) / 100;
  const filledLines = lines.filter((l) => l.ledgerId && Number(l.amount) > 0);
  const hasOrphanAmount = lines.some((l) => Number(l.amount) > 0 && !l.ledgerId);
  const canPost = editable && filledLines.length >= 2 && totalDr > 0 && Math.abs(diff) < 0.01 && !hasOrphanAmount
    && (!editingVoucher || editReason.trim().length >= 5);

  const updateLine = (key: string, patch: Partial<AdjustmentLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, newAdjustmentLine("dr")]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.key !== key) : prev));

  // When the user finishes entering an amount on the last line and a balance
  // still remains, auto-append a new line pre-filled with the leftover so the
  // user only has to pick the ledger — repeats until the difference is ₹0.
  const commitAmount = (key: string) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx === -1 || idx !== prev.length - 1) return prev;
      const line = prev[idx];
      if (!line.amount || Number(line.amount) <= 0) return prev;
      const dr = prev.reduce((s, l) => s + (l.drcr === "dr" ? Number(l.amount) || 0 : 0), 0);
      const cr = prev.reduce((s, l) => s + (l.drcr === "cr" ? Number(l.amount) || 0 : 0), 0);
      const remaining = Math.round((dr - cr) * 100) / 100;
      if (Math.abs(remaining) < 0.01) return prev;
      const nextSide: "dr" | "cr" = remaining > 0 ? "cr" : "dr";
      return [...prev, { ...newAdjustmentLine(nextSide), amount: Math.abs(remaining) }];
    });
  };

  const resetForm = () => {
    setEditingVoucher(null);
    setEditReason("");
    setLines([newAdjustmentLine("dr"), newAdjustmentLine("cr")]);
    setNarration("Opening Balance Adjustment");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const startEdit = (v: PostedAdjustmentVoucher) => {
    setEditingVoucher(v);
    setEditReason("");
    setDate(v.voucher_date);
    setNarration(v.narration ?? "Opening Balance Adjustment");
    setLines(v.voucher_items.map((it) => ({
      key: crypto.randomUUID(),
      ledgerId: it.ledger_account_id,
      drcr: Number(it.dr_amount) > 0 ? "dr" : "cr",
      amount: Number(it.dr_amount) > 0 ? Number(it.dr_amount) : Number(it.cr_amount),
      narration: it.narration ?? "",
    })));
  };

  const post = async () => {
    if (!businessId || !canPost) return;
    setPosting(true);
    try {
      if (editingVoucher) {
        if (!userId) throw new Error("Not signed in.");
        const items = filledLines.map((l) => ({
          ledger_account_id: l.ledgerId,
          debit: l.drcr === "dr" ? Number(l.amount) : 0,
          credit: l.drcr === "cr" ? Number(l.amount) : 0,
          remarks: l.narration.trim() || "",
        }));
        await repostVoucherItems(userId, editingVoucher.id, items, editReason.trim(), { canEditLockedVoucher: canEditLocked });
        const { error: narErr } = await supabase
          .from("vouchers")
          .update({ narration: narration.trim() || "Opening Balance Adjustment" })
          .eq("id", editingVoucher.id)
          .eq("business_id", businessId);
        if (narErr) throw narErr;
        await logAudit({
          business_id: businessId, action: "MIGRATION_OPENING_BALANCE_ADJUSTMENT_EDITED", entity_type: "business_migration_settings",
          entity_id: editingVoucher.id, new_value: { lines: filledLines }, reason: editReason.trim(),
        });
        toast.success("Adjustment updated.");
        resetForm();
        qc.invalidateQueries({ queryKey: ["mig-adjustments", businessId] });
        onPosted?.();
      } else {
        const { error } = await supabase.rpc("mig_create_adjustment" as any, {
          _business_id: businessId,
          _voucher_date: date,
          _narration: narration.trim() || "Opening Balance Adjustment",
          _lines: filledLines.map((l) => ({
            ledger_account_id: l.ledgerId, dr_cr: l.drcr, amount: Number(l.amount), narration: l.narration.trim() || null,
          })),
        });
        if (error) throw error;
        await logAudit({
          business_id: businessId, action: "MIGRATION_OPENING_BALANCE_ADJUSTED", entity_type: "business_migration_settings",
          new_value: { voucher_date: date, lines: filledLines },
        });
        toast.success("Opening balance adjustment posted.");
        resetForm();
        qc.invalidateQueries({ queryKey: ["mig-adjustments", businessId] });
        onPosted?.();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPosting(false);
    }
  };

  const handleHardDeleteConfirm = async (reason: string) => {
    if (!hardDeleteTarget || !businessId || !userId) return;
    try {
      await deleteVoucher(userId, hardDeleteTarget.id, reason, { canEditLockedVoucher: canEditLocked });
      toast.success(`Adjustment ${hardDeleteTarget.voucher_number} deleted.`);
      await logAudit({
        business_id: businessId, action: "MIGRATION_OPENING_BALANCE_ADJUSTMENT_DELETED", entity_type: "business_migration_settings",
        entity_id: hardDeleteTarget.id, reason,
      });
      if (editingVoucher?.id === hardDeleteTarget.id) resetForm();
      qc.invalidateQueries({ queryKey: ["mig-adjustments", businessId] });
      onPosted?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete adjustment");
      throw e;
    }
  };

  return (
    <section className="rounded-2xl bg-card border p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Opening Balance Adjustment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Opening balances are locked. Post a balanced correcting journal here — it stays linked to the
          original Opening Balance Voucher and shows up in Trial Balance, Party Statement and Ledger
          Statement like any other posted entry.
        </p>
      </div>

      {editingVoucher && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Editing adjustment {editingVoucher.voucher_number}</p>
            <Button size="sm" variant="ghost" onClick={resetForm}><X className="h-3.5 w-3.5 mr-1" /> Cancel edit</Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-edit-reason">Reason for change (required)</Label>
            <Input id="adj-edit-reason" value={editReason} disabled={!editable}
              onChange={(e) => setEditReason(e.target.value)} placeholder="Why is this adjustment being corrected?" />
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Voucher Date</Label>
          <Input type="date" value={date} min={migrationDate ?? undefined} disabled={!editable || !!editingVoucher}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Narration</Label>
          <Input value={narration} disabled={!editable} onChange={(e) => setNarration(e.target.value)}
            placeholder="Opening Balance Adjustment" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ledger</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Dr/Cr</TableHead>
              <TableHead>Line narration</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.key}>
                <TableCell>
                  <Select value={l.ledgerId} onValueChange={(v) => updateLine(l.key, { ledgerId: v })} disabled={!editable}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Select ledger…" /></SelectTrigger>
                    <SelectContent>
                      {ledgers.map((led) => (
                        <SelectItem key={led.id} value={led.id}>
                          {led.name}{led.party_id ? " (Party)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step="0.01" className="w-32 ml-auto text-right" value={l.amount}
                    disabled={!editable} onChange={(e) => updateLine(l.key, { amount: Number(e.target.value) })}
                    onBlur={() => commitAmount(l.key)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAmount(l.key); } }} />
                </TableCell>
                <TableCell>
                  <Select value={l.drcr} onValueChange={(v) => updateLine(l.key, { drcr: v as "dr" | "cr" })} disabled={!editable}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="dr">Dr</SelectItem><SelectItem value="cr">Cr</SelectItem></SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input value={l.narration} disabled={!editable} onChange={(e) => updateLine(l.key, { narration: e.target.value })}
                    placeholder="Optional" />
                </TableCell>
                <TableCell>
                  {editable && lines.length > 2 && (
                    <Button size="sm" variant="ghost" onClick={() => removeLine(l.key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
      )}

      <div className="border-t pt-4 grid grid-cols-3 gap-4">
        <SummaryStat label="Total Debit" value={totalDr} big />
        <SummaryStat label="Total Credit" value={totalCr} big />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining Balance</p>
          <p className={`text-2xl font-bold ${Math.abs(diff) < 0.01 && !hasOrphanAmount ? "text-emerald-600" : "text-destructive"}`}>
            {Math.abs(diff) < 0.01 ? (hasOrphanAmount ? "Pick a ledger" : "Balanced ✓") : `${fmtInr(Math.abs(diff))} · ${diff > 0 ? "Credit needed" : "Debit needed"}`}
          </p>
        </div>
      </div>
      {Math.abs(diff) >= 0.01 && (
        <p className="text-xs text-muted-foreground -mt-2">
          A new line was added with the leftover amount — pick its ledger, or edit the amount to split it further.
        </p>
      )}
      {Math.abs(diff) < 0.01 && hasOrphanAmount && (
        <p className="text-xs text-muted-foreground -mt-2">
          Amounts balance, but a line still has no ledger selected — choose one to enable posting.
        </p>
      )}

      {editable && (
        <div className="flex gap-2">
          <Button onClick={post} disabled={!canPost || posting}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> {posting ? (editingVoucher ? "Updating…" : "Posting…") : editingVoucher ? "Update Adjustment" : "Post Adjustment"}
          </Button>
          {editingVoucher && (
            <Button variant="outline" onClick={resetForm} disabled={posting}>Cancel</Button>
          )}
        </div>
      )}

      <div className="border-t pt-4 space-y-3">
        <h3 className="font-semibold text-sm">Posted Adjustments</h3>
        {loadingAdjustments && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loadingAdjustments && postedAdjustments.length === 0 && (
          <p className="text-sm text-muted-foreground">No adjustments posted yet.</p>
        )}
        {postedAdjustments.map((v) => (
          <div key={v.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{v.voucher_number} · {v.voucher_date}</p>
                <p className="text-xs text-muted-foreground">{v.narration || "Opening Balance Adjustment"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums">{fmtInr(Number(v.total_amount))}</span>
                {editable && (
                  <Button size="sm" variant="ghost" onClick={() => startEdit(v)} disabled={posting || (!!editingVoucher && editingVoucher.id !== v.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDeletePosted && (
                  <Button size="sm" variant="ghost" onClick={() => setHardDeleteTarget(v)} disabled={posting}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {v.voucher_items.map((it) => (
                <div key={it.id} className="flex justify-between gap-3">
                  <span>{it.ledger_accounts?.name ?? "—"}</span>
                  <span className="tabular-nums">
                    {Number(it.dr_amount) > 0 ? `${fmtInr(Number(it.dr_amount))} Dr` : `${fmtInr(Number(it.cr_amount))} Cr`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <HardDeleteVoucherDialog
        target={hardDeleteTarget ? {
          id: hardDeleteTarget.id, voucher_number: hardDeleteTarget.voucher_number, voucher_type: "journal",
          voucher_date: hardDeleteTarget.voucher_date, total_amount: Number(hardDeleteTarget.total_amount),
        } : null}
        open={!!hardDeleteTarget}
        onOpenChange={(o) => !o && setHardDeleteTarget(null)}
        onConfirm={handleHardDeleteConfirm}
        typeLabel="Journal (Opening Balance Adjustment)"
      />
    </section>
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
