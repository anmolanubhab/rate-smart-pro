// Pricing & Promotion Engine — Phase 1B.2 Pricing Test Bench.
//
// Developer + accountant diagnostic tool that calls calculatePricing()
// (src/lib/pricing/engine.ts) directly and shows every layer of the
// result — trace, plain-language explanation, rejected/ineligible rules
// with reasons, the would-be snapshot, and raw JSON. Not wired into any
// real save flow; this is how the engine gets verified before Phase 1C
// (Price List UI) starts.
//
// "Simulate with Current Rules" (not "Replay"): prefills the form from a
// real past invoice's party/products/date, then always recalculates with
// today's engine. It never claims to reproduce what was actually
// calculated on the invoice date — that needs a persisted snapshot, which
// doesn't exist yet (deferred to Phase 1C/1D). Keep this distinction in
// every label — "Replay" is reserved for that future, snapshot-backed
// feature.

import { useEffect, useMemo, useState } from "react";
import { Calculator, Trash2, Download, Copy, Printer, Play, Save, FolderOpen, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchParties, type Party } from "@/lib/parties";
import { searchProducts, type Product } from "@/lib/products";
import { fetchInvoices, fetchInvoiceItems } from "@/lib/salesInvoices";
import { calculatePricing } from "@/lib/pricing/engine";
import { explainPricing } from "@/lib/pricing/explain";
import { buildSnapshot } from "@/lib/pricing/snapshot";
import type { PricingContext, PricingContextLine, PricingResult } from "@/lib/pricing/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { localDateISO } from "@/lib/pricing/dateUtils";

const inr = (n: number) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const uid = () => Math.random().toString(36).slice(2, 10);

type Row = { lineId: string; productId: string; label: string; qty: number };

interface SavedTestCase {
  name: string;
  partyId: string | null;
  partyLabel: string;
  rows: Row[];
  branchId: string | null;
  warehouseId: string | null;
  salesman: string;
  voucherType: string;
  date: string;
  manualDiscountPct: string;
}

const STORAGE_KEY = "pricing_test_bench_cases";

function loadTestCases(): SavedTestCase[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusBadgeClass(decision: string): string {
  if (decision === "applied" || decision === "replaced_base") return "border-emerald-500/40 text-emerald-600 bg-emerald-500/10";
  if (decision === "settlement_only") return "border-amber-500/40 text-amber-600 bg-amber-500/10";
  return "border-destructive/40 text-destructive bg-destructive/10";
}

export default function PricingTestBench() {
  useEffect(() => {
    document.title = "Pricing Test Bench — RD Pro";
  }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [parties, setParties] = useState<Party[]>([]);
  const [partyQuery, setPartyQuery] = useState("");
  const [partyId, setPartyId] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [salesman, setSalesman] = useState("");
  const [voucherType, setVoucherType] = useState("sales_invoice");
  const [date, setDate] = useState(localDateISO());
  const [manualDiscountPct, setManualDiscountPct] = useState("");

  const [result, setResult] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; party_name: string | null; invoice_date: string }[]>([]);
  const [simulateInvoiceId, setSimulateInvoiceId] = useState("");
  const [testCases, setTestCases] = useState<SavedTestCase[]>(loadTestCases());
  const [loadCaseId, setLoadCaseId] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    fetchParties(user.id).then(setParties).catch(() => {});
    fetchInvoices(user.id)
      .then((inv) => setInvoices((inv as any[]).slice(0, 50).map((i) => ({ id: i.id, invoice_number: i.invoice_number, party_name: i.party_name, invoice_date: i.invoice_date }))))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!businessId) return;
    supabase.from("branches").select("id, name").eq("business_id", businessId).then(({ data }) => setBranches((data as any[]) ?? []));
    supabase.from("warehouses").select("id, warehouse_name").eq("business_id", businessId).then(({ data }) => setWarehouses((data as any[]) ?? []));
  }, [businessId]);

  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      if (productQuery.trim()) searchProducts(user.id, productQuery).then(setProductResults).catch(() => {});
      else setProductResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [productQuery, user?.id]);

  const party = useMemo(() => parties.find((p) => p.id === partyId) ?? null, [parties, partyId]);
  const partyResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q || (party && party.name.toLowerCase() === q)) return [];
    return parties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [parties, partyQuery, party]);

  const addRow = (product: Product) => {
    setRows((prev) => [...prev, { lineId: uid(), productId: product.id, label: `${product.part_number} — ${product.name}`, qty: 1 }]);
    setProductQuery("");
    setProductResults([]);
  };
  const removeRow = (lineId: string) => setRows((prev) => prev.filter((r) => r.lineId !== lineId));
  const updateQty = (lineId: string, qty: number) => setRows((prev) => prev.map((r) => (r.lineId === lineId ? { ...r, qty } : r)));

  const resetForm = () => {
    setPartyId(null);
    setPartyQuery("");
    setRows([]);
    setBranchId(null);
    setWarehouseId(null);
    setSalesman("");
    setVoucherType("sales_invoice");
    setDate(localDateISO());
    setManualDiscountPct("");
    setResult(null);
    setError(null);
    setSimulateInvoiceId("");
  };

  const runCalculation = async () => {
    if (!businessId) return;
    if (rows.length === 0) {
      toast.error("Add at least one product line");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const lines: PricingContextLine[] = rows.map((r) => ({
        lineId: r.lineId,
        productId: r.productId,
        qty: r.qty,
        manualDiscountPct: manualDiscountPct.trim() ? Number(manualDiscountPct) : null,
      }));
      const context: PricingContext = {
        businessId,
        branchId,
        partyId,
        partyGroupId: party?.party_group_id ?? null,
        salesmanId: salesman.trim() || null,
        warehouseId,
        date,
        voucherType,
        lines,
      };
      const r = await calculatePricing(context, { traceMode: true });
      setResult(r);
      setSelectedLineId(r.lines[0]?.lineId ?? null);
    } catch (e: any) {
      setError(e.message ?? "Calculation failed");
      toast.error(e.message ?? "Calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const simulateFromInvoice = async () => {
    if (!simulateInvoiceId) return;
    try {
      const items = await fetchInvoiceItems(simulateInvoiceId);
      const inv = invoices.find((i) => i.id === simulateInvoiceId);
      const partyMatch = inv ? parties.find((p) => p.name === inv.party_name) : null;
      setPartyId(partyMatch?.id ?? null);
      setPartyQuery(inv?.party_name ?? "");
      setDate(inv?.invoice_date ?? localDateISO());
      setRows(
        (items as any[])
          .filter((it) => it.product_id)
          .map((it) => ({ lineId: uid(), productId: it.product_id, label: `${it.part_number ?? ""} — ${it.description ?? ""}`, qty: Number(it.qty) || 1 }))
      );
      toast.success("Prefilled from invoice — recalculating with current rules, not the historical result");
    } catch (e: any) {
      toast.error(e.message ?? "Could not load invoice");
    }
  };

  const saveTestCase = () => {
    const name = window.prompt("Name this test case");
    if (!name) return;
    const testCase: SavedTestCase = {
      name,
      partyId,
      partyLabel: partyQuery,
      rows,
      branchId,
      warehouseId,
      salesman,
      voucherType,
      date,
      manualDiscountPct,
    };
    const next = [...testCases.filter((c) => c.name !== name), testCase];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setTestCases(next);
    toast.success(`Saved "${name}"`);
  };

  const loadTestCase = (name: string) => {
    const tc = testCases.find((c) => c.name === name);
    if (!tc) return;
    setPartyId(tc.partyId);
    setPartyQuery(tc.partyLabel);
    setRows(tc.rows);
    setBranchId(tc.branchId);
    setWarehouseId(tc.warehouseId);
    setSalesman(tc.salesman);
    setVoucherType(tc.voucherType);
    setDate(tc.date);
    setManualDiscountPct(tc.manualDiscountPct);
    setLoadCaseId(name);
  };

  const selectedLine = result?.lines.find((l) => l.lineId === selectedLineId) ?? result?.lines[0] ?? null;
  const allRuleRows = (result?.lines ?? []).flatMap((l) => [
    ...l.appliedRules.map((r) => ({ ...r, lineId: l.lineId })),
    ...l.rejectedRules.map((r) => ({ ...r, lineId: l.lineId })),
    ...l.ineligibleRules.map((r) => ({ ...r, lineId: l.lineId })),
    ...l.settlementEligible.map((r) => ({ ...r, lineId: l.lineId })),
  ]);

  const totalCost = (result?.lines ?? []).reduce((s, l) => s + l.estimatedCost, 0);

  const exportPayload = result
    ? {
        pricingResult: result,
        snapshot: result.lines.map(buildSnapshot),
      }
    : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Pricing &amp; Promotion Engine</p>
          <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
            <Calculator className="h-7 w-7 text-muted-foreground" /> Pricing Test Bench
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Calls calculatePricing() directly against real data — for verifying the engine before Phase 1C's Price List UI.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={resetForm}><FilePlus2 className="h-3.5 w-3.5 mr-1" /> New Test</Button>
          <Button size="sm" variant="outline" onClick={saveTestCase}><Save className="h-3.5 w-3.5 mr-1" /> Save Test Case</Button>
          {testCases.length > 0 && (
            <Select value={loadCaseId} onValueChange={loadTestCase}>
              <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Load Test Case" /></SelectTrigger>
              <SelectContent>
                {testCases.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-4 no-print">
        {/* Left panel — inputs */}
        <div className="rounded-2xl bg-card border p-4 space-y-3">
          <h2 className="font-semibold text-sm">Inputs</h2>

          <div className="space-y-1.5 relative">
            <Label className="text-xs">Party</Label>
            <DocumentEntitySearchField
              results={partyResults}
              getKey={(p) => p.id}
              query={partyQuery}
              onQueryChange={(v) => { setPartyQuery(v); if (!v) setPartyId(null); }}
              onSelect={(p) => { setPartyId(p.id); setPartyQuery(p.name); }}
              renderRow={(p) => <span>{p.name}</span>}
              placeholder="Search party…"
              inputClassName="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5 relative">
            <Label className="text-xs">Add Product</Label>
            <DocumentEntitySearchField
              results={productResults}
              getKey={(p) => p.id}
              query={productQuery}
              onQueryChange={setProductQuery}
              onSelect={(p) => addRow(p)}
              renderRow={(p) => <span>{p.part_number} — {p.name}</span>}
              placeholder="Search part / name…"
              inputClassName="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No lines yet — search a product above.</p>
            ) : (
              rows.map((r) => (
                <div
                  key={r.lineId}
                  className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer ${selectedLineId === r.lineId ? "border-primary" : ""}`}
                  onClick={() => setSelectedLineId(r.lineId)}
                >
                  <span className="text-xs flex-1 truncate">{r.label}</span>
                  <Input
                    type="number"
                    value={r.qty}
                    onChange={(e) => updateQty(r.lineId, Number(e.target.value) || 0)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 w-16 text-xs"
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); removeRow(r.lineId); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Voucher Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">Order</SelectItem>
                  <SelectItem value="quotation">Quotation</SelectItem>
                  <SelectItem value="sales_invoice">Sales Invoice</SelectItem>
                  <SelectItem value="purchase_invoice">Purchase Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Branch</Label>
              <Select value={branchId ?? "__none"} onValueChange={(v) => setBranchId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse</Label>
              <Select value={warehouseId ?? "__none"} onValueChange={(v) => setWarehouseId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Salesman</Label>
              <Input value={salesman} onChange={(e) => setSalesman(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Manual Discount %</Label>
              <Input type="number" value={manualDiscountPct} onChange={(e) => setManualDiscountPct(e.target.value)} className="h-8 text-sm" placeholder="optional" />
            </div>
          </div>

          <Button className="w-full" onClick={runCalculation} disabled={loading}>
            <Play className="h-4 w-4 mr-1" /> {loading ? "Calculating…" : "Calculate"}
          </Button>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Simulate with Current Rules</Label>
            <p className="text-[11px] text-muted-foreground">
              Prefills from a past invoice's party/products/date, then recalculates with today's engine — not a replay of what was actually charged.
            </p>
            <div className="flex gap-1.5">
              <Select value={simulateInvoiceId} onValueChange={setSimulateInvoiceId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick an invoice" /></SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.invoice_number} — {i.party_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={simulateFromInvoice}>
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Center panel — trace */}
        <div className="rounded-2xl bg-card border p-4 space-y-2">
          <h2 className="font-semibold text-sm">Calculation</h2>
          {!result ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Run a calculation to see the step-by-step breakdown.</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="space-y-3">
              {result.lines.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.lines.map((l) => (
                    <Button key={l.lineId} size="sm" variant={l.lineId === selectedLineId ? "default" : "outline"} className="h-7 text-xs" onClick={() => setSelectedLineId(l.lineId)}>
                      {rows.find((r) => r.lineId === l.lineId)?.label.slice(0, 20) ?? l.lineId}
                    </Button>
                  ))}
                </div>
              )}
              {selectedLine && (
                <div className="space-y-1 text-sm font-mono">
                  {(result.trace?.[selectedLine.lineId] ?? []).map((step, i) => (
                    <div key={i} className="flex justify-between border-b border-dashed py-1 text-xs">
                      <span className="text-muted-foreground">{step.split("  ")[0]}</span>
                      <span className="font-semibold">{step.split("  ").slice(1).join(" ")}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-2 border-t">
                {result.metrics.rulesEvaluated} rules evaluated · {result.metrics.rulesMatched} matched · {result.metrics.rulesApplied} applied · {result.metrics.executionTimeMs}ms
              </div>
            </div>
          )}
        </div>

        {/* Right panel — matched rules */}
        <div className="rounded-2xl bg-card border p-4">
          <h2 className="font-semibold text-sm mb-2">Matched Rules</h2>
          {allRuleRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No rules matched (or none configured yet).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Priority</TableHead>
                  <TableHead className="text-xs">Stack</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRuleRows.map((r, i) => (
                  <TableRow key={`${r.ruleId}-${i}`}>
                    <TableCell className="text-xs">{r.name} <span className="text-muted-foreground">v{r.version}</span></TableCell>
                    <TableCell className="text-xs">{r.priority}</TableCell>
                    <TableCell className="text-xs">{r.stackingMode}</TableCell>
                    <TableCell><Badge variant="outline" className={statusBadgeClass(r.decision)}>{r.decision}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Bottom — profit summary */}
      {result && (
        <div className="rounded-2xl bg-card border p-4 grid grid-cols-2 md:grid-cols-5 gap-4 no-print">
          {/* Taxable, not grandTotal — this row is the profit summary, and
              cost/margin/profit are all measured excluding pass-through GST. */}
          <div><p className="text-xs text-muted-foreground">Revenue (excl. GST)</p><p className="font-semibold">{inr(result.totals.taxable)}</p></div>
          <div><p className="text-xs text-muted-foreground">Cost</p><p className="font-semibold">{inr(totalCost)}</p></div>
          <div><p className="text-xs text-muted-foreground">Gross Margin</p><p className="font-semibold">{result.totals.estimatedMarginPct}%</p></div>
          <div><p className="text-xs text-muted-foreground">Promotion Cost</p><p className="font-semibold">{inr(result.totals.discountTotal)}</p></div>
          <div><p className="text-xs text-muted-foreground">Net Profit</p><p className="font-semibold text-emerald-600">{inr(result.totals.estimatedProfit)}</p></div>
        </div>
      )}

      {/* Tabs */}
      {result && (
        <div className="rounded-2xl bg-card border p-4 no-print">
          <Tabs defaultValue="trace">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <TabsList>
                <TabsTrigger value="trace">Pricing Trace</TabsTrigger>
                <TabsTrigger value="explain">Explain</TabsTrigger>
                <TabsTrigger value="rejected">Rejected Rules</TabsTrigger>
                <TabsTrigger value="snapshot">Snapshot Preview</TabsTrigger>
                <TabsTrigger value="json">JSON View</TabsTrigger>
              </TabsList>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2)); toast.success("Copied"); }}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy JSON
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadJson(exportPayload, "pricing-test.json")}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print Explanation
                </Button>
              </div>
            </div>

            <TabsContent value="trace" className="mt-3 space-y-1 font-mono text-xs">
              {selectedLine && (result.trace?.[selectedLine.lineId] ?? []).map((s, i) => <div key={i}>{s}</div>)}
            </TabsContent>

            <TabsContent value="explain" className="mt-3 space-y-1 text-sm">
              {selectedLine && explainPricing(selectedLine).map((s, i) => <div key={i} className={s.startsWith("  ") ? "text-muted-foreground pl-4" : ""}>{s}</div>)}
            </TabsContent>

            <TabsContent value="rejected" className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="text-xs">Rule</TableHead><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Reason</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[...(selectedLine?.rejectedRules ?? []), ...(selectedLine?.ineligibleRules ?? [])].map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.name}</TableCell>
                      <TableCell className="text-xs">{r.ruleType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                  {(selectedLine?.rejectedRules.length ?? 0) + (selectedLine?.ineligibleRules.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-xs text-muted-foreground text-center py-4">Nothing rejected for this line.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="snapshot" className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Preview only — not persisted anywhere yet (Phase 1C/1D wires this into real invoices).</p>
              <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-auto max-h-96">
                {selectedLine ? JSON.stringify(buildSnapshot(selectedLine), null, 2) : ""}
              </pre>
            </TabsContent>

            <TabsContent value="json" className="mt-3">
              <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-auto max-h-96">{JSON.stringify(exportPayload, null, 2)}</pre>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Print-only explanation */}
      {result && selectedLine && (
        <div className="hidden print:block text-sm space-y-1">
          <h2 className="font-bold text-lg mb-2">Pricing Explanation</h2>
          {explainPricing(selectedLine).map((s, i) => <div key={i}>{s}</div>)}
        </div>
      )}
    </div>
  );
}
