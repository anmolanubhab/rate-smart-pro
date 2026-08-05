// Pricing & Promotion Engine — Phase 2A, Screen 2.
// Route: /pricing/rules/:id
//
// One generic Rule Editor covers Party Discount / Item Discount / Category
// Discount (Phase 2B/2C are just this editor used with different rule_type
// + target dimension, not separate screens). Target section writes to
// pricing_rule_targets (Party/Party Group/Product — OR-matched, uuid rows)
// or pricing_rule_conditions (Category — AND-matched, free-text via an IN
// condition) per ruleResolver.ts's existing split. Preview tab calls the
// unmodified calculatePricing() twice (with/without this draft rule) —
// no separate simulation logic.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, PauseCircle, Archive as ArchiveIcon, Copy, X, Calculator } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { fetchParties, type Party } from "@/lib/parties";
import { searchProducts, type Product } from "@/lib/products";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPricingRule, savePricingRule, setRuleStatus, duplicatePricingRule, fetchDistinctCategories,
  type RuleTargetInput, type RuleConditionInput, type RuleBenefitInput,
} from "@/lib/pricing/pricingRules";
import { RULE_TYPES_ENABLED, RULE_TYPES_COMING_SOON, BENEFIT_TYPES_ENABLED, BENEFIT_TYPES_COMING_SOON, STACKING_MODE_OPTIONS, TARGET_DIMENSIONS_ENABLED, TARGET_DIMENSIONS_COMING_SOON, type TargetDimension } from "@/lib/pricing/pricingRuleConstants";
import { defaultStackingModeFor } from "@/lib/pricing/ruleTypeDefaults";
import { calculatePricing } from "@/lib/pricing/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  paused: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  expired: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};
const RULE_TYPE_LABEL: Record<string, string> = Object.fromEntries(RULE_TYPES_ENABLED.map((t) => [t.value, t.label]));
const inr = (n: number) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

interface Chip { id: string; name: string }

export default function PricingRuleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "Pricing Rule Editor — RD Pro"; }, []);

  const { data: rule } = useQuery({
    queryKey: ["pricing-rule", id],
    enabled: !!id,
    queryFn: () => fetchPricingRule(id!),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pricing-rule", id] });
    qc.invalidateQueries({ queryKey: ["pricing-rules", business?.id] });
  };

  // ── General ──────────────────────────────────────────────────────────
  const [form, setForm] = useState<{
    name: string; rule_type: string; priority: number; stacking_mode: string;
    effective_from: string; effective_to: string; approval_required: boolean;
  } | null>(null);

  // ── Target ───────────────────────────────────────────────────────────
  const [dimension, setDimension] = useState<TargetDimension>("PARTY");
  const [selectedParties, setSelectedParties] = useState<Chip[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Chip | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Chip[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // ── Benefit ──────────────────────────────────────────────────────────
  const [benefitType, setBenefitType] = useState("PERCENT_DISCOUNT");
  const [benefitValue, setBenefitValue] = useState("");
  const [maxBenefit, setMaxBenefit] = useState("");

  useEffect(() => {
    if (!rule) return;
    setForm({
      name: rule.name,
      rule_type: rule.rule_type,
      priority: rule.priority,
      stacking_mode: rule.stacking_mode ?? "USE_BUSINESS_DEFAULT",
      effective_from: rule.effective_from ?? "",
      effective_to: rule.effective_to ?? "",
      approval_required: rule.approval_required,
    });

    const partyTargets = rule.targets.filter((t) => t.target_type === "PARTY" && t.target_id);
    const groupTarget = rule.targets.find((t) => t.target_type === "PARTY_GROUP" && t.target_id);
    const productTargets = rule.targets.filter((t) => t.target_type === "PRODUCT" && t.target_id);
    const categoryCondition = rule.conditions.find((c) => c.condition_type === "CATEGORY");

    if (groupTarget) setDimension("PARTY_GROUP");
    else if (productTargets.length) setDimension("PRODUCT");
    else if (categoryCondition) setDimension("CATEGORY");
    else setDimension("PARTY");

    if (categoryCondition) {
      const v = categoryCondition.value;
      setSelectedCategories(Array.isArray(v) ? (v as string[]) : [String(v)]);
    }

    const b = rule.benefits[0];
    if (b) {
      setBenefitType(b.benefit_type);
      setBenefitValue(b.value != null ? String(b.value) : "");
      setMaxBenefit(b.max_benefit_amount != null ? String(b.max_benefit_amount) : "");
    }

    // Resolve chip names for existing targets (ids only in the schema).
    (async () => {
      if (partyTargets.length) {
        const { data } = await supabase.from("parties").select("id, name").in("id", partyTargets.map((t) => t.target_id!));
        setSelectedParties(((data ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })));
      }
      if (groupTarget) {
        const { data } = await supabase.from("party_groups").select("id, name").eq("id", groupTarget.target_id!).maybeSingle();
        if (data) setSelectedGroup({ id: (data as any).id, name: (data as any).name });
      }
      if (productTargets.length) {
        const { data } = await supabase.from("products").select("id, name").in("id", productTargets.map((t) => t.target_id!));
        setSelectedProducts(((data ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })));
      }
    })();
  }, [rule]);

  // ── Target pickers ───────────────────────────────────────────────────
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [partyQuery, setPartyQuery] = useState("");
  useEffect(() => { if (user?.id && !allParties.length) fetchParties(user.id).then(setAllParties).catch(() => {}); }, [user?.id]);
  const partyResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return [];
    return allParties.filter((p) => p.name.toLowerCase().includes(q) && !selectedParties.some((s) => s.id === p.id)).slice(0, 12);
  }, [allParties, partyQuery, selectedParties]);

  const [groups, setGroups] = useState<Chip[]>([]);
  useEffect(() => { if (business?.id) supabase.from("party_groups").select("id, name").eq("business_id", business.id).order("name").then(({ data }) => setGroups(((data ?? []) as any[]).map((g) => ({ id: g.id, name: g.name })))); }, [business?.id]);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => { if (productQuery.trim()) searchProducts(user.id, productQuery).then(setProductResults).catch(() => {}); else setProductResults([]); }, 250);
    return () => clearTimeout(t);
  }, [productQuery, user?.id]);

  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => { if (business?.id) fetchDistinctCategories(business.id).then(setCategories).catch(() => {}); }, [business?.id]);

  // ── Save ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!business?.id || !id || !form || !rule) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }

    const targets: RuleTargetInput[] = [];
    const conditions: RuleConditionInput[] = [];
    if (dimension === "PARTY") selectedParties.forEach((p) => targets.push({ target_type: "PARTY", target_id: p.id }));
    else if (dimension === "PARTY_GROUP" && selectedGroup) targets.push({ target_type: "PARTY_GROUP", target_id: selectedGroup.id });
    else if (dimension === "PRODUCT") selectedProducts.forEach((p) => targets.push({ target_type: "PRODUCT", target_id: p.id }));
    else if (dimension === "CATEGORY" && selectedCategories.length) conditions.push({ condition_type: "CATEGORY", operator: "IN", value: selectedCategories });

    const benefits: RuleBenefitInput[] = benefitValue.trim()
      ? [{ benefit_type: benefitType, value: Number(benefitValue), max_benefit_amount: maxBenefit.trim() ? Number(maxBenefit) : null }]
      : [];

    setSaving(true);
    try {
      const newId = await savePricingRule(
        business.id,
        {
          name: form.name,
          rule_type: form.rule_type,
          priority: form.priority,
          stacking_mode: form.stacking_mode === "USE_BUSINESS_DEFAULT" ? null : form.stacking_mode,
          effective_from: form.effective_from || null,
          effective_to: form.effective_to || null,
          approval_required: form.approval_required,
        },
        targets, conditions, benefits,
        rule
      );
      toast.success(newId === id ? "Saved" : "Saved as a new version");
      if (newId !== id) navigate(`/pricing/rules/${newId}`);
      else refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const runStatusAction = async (action: "activate" | "pause" | "archive" | "duplicate") => {
    if (!business?.id || !id) return;
    setBusy(true);
    try {
      if (action === "duplicate") {
        const newId = await duplicatePricingRule(id, business.id);
        toast.success("Duplicated");
        navigate(`/pricing/rules/${newId}`);
        return;
      }
      const next = action === "activate" ? "active" : action === "pause" ? "paused" : "archived";
      await setRuleStatus(id, business.id, next as any);
      toast.success(next[0].toUpperCase() + next.slice(1));
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Preview / Test This Rule ────────────────────────────────────────
  const [testParty, setTestParty] = useState<Chip | null>(null);
  const [testPartyQuery, setTestPartyQuery] = useState("");
  const [testProduct, setTestProduct] = useState<Chip | null>(null);
  const [testProductQuery, setTestProductQuery] = useState("");
  const [testProductResults, setTestProductResults] = useState<Product[]>([]);
  const [testQty, setTestQty] = useState("1");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ before: any; after: any; reason?: string } | null>(null);

  useEffect(() => {
    if (!testParty && selectedParties[0]) setTestParty(selectedParties[0]);
    if (!testProduct && selectedProducts[0]) setTestProduct(selectedProducts[0]);
  }, [selectedParties, selectedProducts]);

  const testPartyResults = useMemo(() => {
    const q = testPartyQuery.trim().toLowerCase();
    if (!q) return [];
    return allParties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [allParties, testPartyQuery]);

  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => { if (testProductQuery.trim()) searchProducts(user.id, testProductQuery).then(setTestProductResults).catch(() => {}); else setTestProductResults([]); }, 250);
    return () => clearTimeout(t);
  }, [testProductQuery, user?.id]);

  const ruleReady = !!id && !!business?.id && !!rule && (rule.targets.length > 0 || rule.conditions.length > 0) && rule.benefits.length > 0;
  const canTest = ruleReady && !!testProduct;

  const runTest = async () => {
    if (!business?.id || !id || !testProduct) return;
    setTesting(true);
    setTestResult(null);
    try {
      const context = {
        businessId: business.id,
        partyId: testParty?.id ?? null,
        date: todayIso(),
        lines: [{ lineId: "test", productId: testProduct.id, qty: Number(testQty) || 1 }],
      };
      const [before, after] = await Promise.all([
        calculatePricing(context),
        calculatePricing(context, { includeDraftRuleIds: [id] }),
      ]);
      const afterLine = after.lines[0];
      const applied = afterLine.appliedRules.some((r) => r.ruleId === id) || afterLine.appliedRules.some((r) => r.decision === "replaced_base" && r.ruleId === id);
      let reason: string | undefined;
      if (!applied) {
        const ineligible = afterLine.ineligibleRules.find((r) => r.ruleId === id);
        const rejected = afterLine.rejectedRules.find((r) => r.ruleId === id);
        reason = ineligible?.reason ?? rejected?.reason ?? "Rule did not match this party/product.";
      }
      setTestResult({ before: before.lines[0], after: afterLine, reason });
    } catch (e: any) {
      toast.error(e.message ?? "Could not run test");
    } finally {
      setTesting(false);
    }
  };

  if (!rule || !form) {
    return <div className="text-center text-sm text-muted-foreground py-16">Loading…</div>;
  }

  const effectiveStacking = defaultStackingModeFor(form.rule_type);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/pricing/rules")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Pricing Rules
          </Button>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            {rule.name}
            <Badge variant="outline" className={STATUS_TONE[rule.status] ?? ""}>{rule.status}</Badge>
            {rule.version > 1 && <Badge variant="secondary">v{rule.version}</Badge>}
          </h1>
        </div>
        {editable && (
          <div className="flex gap-2">
            {rule.status !== "active" && rule.status !== "archived" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("activate")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
              </Button>
            )}
            {rule.status === "active" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("pause")}>
                <PauseCircle className="h-3.5 w-3.5 mr-1" /> Pause
              </Button>
            )}
            {rule.status !== "archived" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("archive")}>
                <ArchiveIcon className="h-3.5 w-3.5 mr-1" /> Archive
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("duplicate")}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
            </Button>
          </div>
        )}
      </header>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="target">Target</TabsTrigger>
          <TabsTrigger value="benefit">Benefit</TabsTrigger>
          <TabsTrigger value="stacking">Stacking</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input disabled={!editable} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Rule Type</Label>
              <Select disabled={!editable} value={form.rule_type} onValueChange={(v) => setForm({ ...form, rule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES_ENABLED.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {RULE_TYPES_COMING_SOON.map((t) => (
                  <Tooltip key={t}>
                    <TooltipTrigger asChild><Badge variant="outline" className="text-muted-foreground cursor-not-allowed">{t.replace(/_/g, " ")}</Badge></TooltipTrigger>
                    <TooltipContent>Coming soon</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input disabled={!editable} type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 100 })} />
                <p className="text-xs text-muted-foreground">Lower number = evaluated first.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 mt-6">
                <Label className="cursor-pointer">Approval Required</Label>
                <Switch disabled={!editable} checked={form.approval_required} onCheckedChange={(v) => setForm({ ...form, approval_required: v })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input disabled={!editable} type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To</Label>
                <Input disabled={!editable} type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
            {editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </div>
        </TabsContent>

        {/* Target */}
        <TabsContent value="target" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4 max-w-2xl">
            <div className="flex flex-wrap gap-2">
              {TARGET_DIMENSIONS_ENABLED.map((d) => (
                <Button key={d.value} type="button" size="sm" variant={dimension === d.value ? "default" : "outline"} disabled={!editable} onClick={() => setDimension(d.value)}>
                  {d.label}
                </Button>
              ))}
              {TARGET_DIMENSIONS_COMING_SOON.map((d) => (
                <Tooltip key={d.value}>
                  <TooltipTrigger asChild><Button type="button" size="sm" variant="outline" disabled className="text-muted-foreground">{d.label}</Button></TooltipTrigger>
                  <TooltipContent>{d.reason}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {dimension === "PARTY" && (
              <div className="space-y-2">
                <Label>Parties (any one matching applies)</Label>
                <DocumentEntitySearchField
                  results={partyResults}
                  getKey={(p) => p.id}
                  query={partyQuery}
                  onQueryChange={setPartyQuery}
                  onSelect={(p) => { setSelectedParties((prev) => [...prev, { id: p.id, name: p.name }]); setPartyQuery(""); }}
                  renderRow={(p) => <span>{p.name}</span>}
                  placeholder="Search party to add…"
                  inputClassName="h-9 text-sm"
                  disabled={!editable}
                />
                <div className="flex flex-wrap gap-1.5">
                  {selectedParties.map((p) => (
                    <Badge key={p.id} variant="secondary" className="gap-1">
                      {p.name}
                      {editable && <button onClick={() => setSelectedParties((prev) => prev.filter((x) => x.id !== p.id))}><X className="h-3 w-3" /></button>}
                    </Badge>
                  ))}
                  {selectedParties.length === 0 && <p className="text-xs text-muted-foreground">No parties selected yet.</p>}
                </div>
              </div>
            )}

            {dimension === "PARTY_GROUP" && (
              <div className="space-y-2">
                <Label>Party Group</Label>
                <Select disabled={!editable} value={selectedGroup?.id ?? ""} onValueChange={(v) => setSelectedGroup(groups.find((g) => g.id === v) ?? null)}>
                  <SelectTrigger><SelectValue placeholder="Select a party group" /></SelectTrigger>
                  <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {dimension === "PRODUCT" && (
              <div className="space-y-2">
                <Label>Products (any one matching applies)</Label>
                <DocumentEntitySearchField
                  results={productResults}
                  getKey={(p) => p.id}
                  query={productQuery}
                  onQueryChange={setProductQuery}
                  onSelect={(p) => { setSelectedProducts((prev) => [...prev, { id: p.id, name: p.name }]); setProductQuery(""); }}
                  renderRow={(p) => <span>{p.part_number} — {p.name}</span>}
                  placeholder="Search product to add…"
                  inputClassName="h-9 text-sm"
                  disabled={!editable}
                />
                <div className="flex flex-wrap gap-1.5">
                  {selectedProducts.map((p) => (
                    <Badge key={p.id} variant="secondary" className="gap-1">
                      {p.name}
                      {editable && <button onClick={() => setSelectedProducts((prev) => prev.filter((x) => x.id !== p.id))}><X className="h-3 w-3" /></button>}
                    </Badge>
                  ))}
                  {selectedProducts.length === 0 && <p className="text-xs text-muted-foreground">No products selected yet.</p>}
                </div>
              </div>
            )}

            {dimension === "CATEGORY" && (
              <div className="space-y-2">
                <Label>Categories (any one matching applies)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => {
                    const active = selectedCategories.includes(c);
                    return (
                      <Badge
                        key={c}
                        variant={active ? "default" : "outline"}
                        className={editable ? "cursor-pointer" : ""}
                        onClick={() => editable && setSelectedCategories((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))}
                      >
                        {c}
                      </Badge>
                    );
                  })}
                  {categories.length === 0 && <p className="text-xs text-muted-foreground">No product categories found yet.</p>}
                </div>
              </div>
            )}
            {editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </div>
        </TabsContent>

        {/* Benefit */}
        <TabsContent value="benefit" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>Benefit Type</Label>
              <Select disabled={!editable} value={benefitType} onValueChange={setBenefitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BENEFIT_TYPES_ENABLED.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {BENEFIT_TYPES_COMING_SOON.map((t) => (
                  <Tooltip key={t}>
                    <TooltipTrigger asChild><Badge variant="outline" className="text-muted-foreground cursor-not-allowed">{t.replace(/_/g, " ")}</Badge></TooltipTrigger>
                    <TooltipContent>Coming soon</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{benefitType === "PERCENT_DISCOUNT" ? "Percent (%)" : "Amount (Rs.)"} <span className="text-destructive">*</span></Label>
                <Input disabled={!editable} type="number" value={benefitValue} onChange={(e) => setBenefitValue(e.target.value)} placeholder={benefitType === "PERCENT_DISCOUNT" ? "e.g. 10" : "e.g. 500"} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Benefit Amount (optional)</Label>
                <Input disabled={!editable} type="number" value={maxBenefit} onChange={(e) => setMaxBenefit(e.target.value)} placeholder="e.g. 5000" />
              </div>
            </div>
            {editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </div>
        </TabsContent>

        {/* Stacking */}
        <TabsContent value="stacking" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>Stacking Mode</Label>
              <Select disabled={!editable} value={form.stacking_mode} onValueChange={(v) => setForm({ ...form, stacking_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STACKING_MODE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Business Default for {RULE_TYPE_LABEL[form.rule_type] ?? form.rule_type} is currently <span className="font-medium">{effectiveStacking.replace(/_/g, " ")}</span>.
              </p>
            </div>
            {editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </div>
        </TabsContent>

        {/* Preview */}
        <TabsContent value="preview" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Calculator className="h-4 w-4" /> Test This Rule</div>
            {!ruleReady ? (
              <p className="text-sm text-muted-foreground">Save the rule with at least one target and one benefit to test it.</p>
            ) : (
              <>
                <div className="grid md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Party (optional)</Label>
                    {testParty ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{testParty.name}</Badge>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setTestParty(null)}>Change</Button>
                      </div>
                    ) : (
                      <DocumentEntitySearchField
                        results={testPartyResults}
                        getKey={(p) => p.id}
                        query={testPartyQuery}
                        onQueryChange={setTestPartyQuery}
                        onSelect={(p) => { setTestParty({ id: p.id, name: p.name }); setTestPartyQuery(""); }}
                        renderRow={(p) => <span>{p.name}</span>}
                        placeholder="Search party…"
                        inputClassName="h-9 text-sm"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Product <span className="text-destructive">*</span></Label>
                    {testProduct ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{testProduct.name}</Badge>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setTestProduct(null)}>Change</Button>
                      </div>
                    ) : (
                      <DocumentEntitySearchField
                        results={testProductResults}
                        getKey={(p) => p.id}
                        query={testProductQuery}
                        onQueryChange={setTestProductQuery}
                        onSelect={(p) => { setTestProduct({ id: p.id, name: p.name }); setTestProductQuery(""); }}
                        renderRow={(p) => <span>{p.part_number} — {p.name}</span>}
                        placeholder="Search product…"
                        inputClassName="h-9 text-sm"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={testQty} onChange={(e) => setTestQty(e.target.value)} className="h-9" />
                  </div>
                </div>
                <Button size="sm" disabled={!testProduct || testing} onClick={runTest}>{testing ? "Testing…" : "Run Test"}</Button>

                {testResult && (
                  <div className="grid md:grid-cols-4 gap-3 pt-2">
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Current Price</CardTitle></CardHeader>
                      <CardContent><div className="text-lg font-semibold">{inr(testResult.before.finalAmount)}</div></CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">After Rule</CardTitle></CardHeader>
                      <CardContent><div className="text-lg font-semibold text-primary">{inr(testResult.after.finalAmount)}</div></CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Margin Before → After</CardTitle></CardHeader>
                      <CardContent><div className="text-sm font-semibold">{testResult.before.estimatedMarginPct}% → {testResult.after.estimatedMarginPct}%</div></CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Profit Impact</CardTitle></CardHeader>
                      <CardContent><div className={`text-sm font-semibold ${testResult.after.estimatedProfit < testResult.before.estimatedProfit ? "text-destructive" : "text-emerald-600"}`}>
                        {inr(testResult.after.estimatedProfit - testResult.before.estimatedProfit)}
                      </div></CardContent></Card>
                  </div>
                )}
                {testResult?.reason && (
                  <p className="text-xs text-amber-600">This rule did not apply to the chosen party/product: {testResult.reason}</p>
                )}
                {rule.status === "active" && (
                  <p className="text-xs text-muted-foreground">This rule is already active — "Current Price" already includes it, so the comparison mainly matters before activation.</p>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
