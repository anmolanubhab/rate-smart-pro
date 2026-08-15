// Pricing & Promotion Engine — Phase 2A, Screen 1.
// Route: /pricing/rules
//
// Same shape as PriceLists.tsx: table + Create(→Editor)/Activate/Pause/
// Duplicate/Archive. A business has dozens of rules at most, not
// thousands — no server-side pagination needed.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Copy, CheckCircle2, PauseCircle, Archive as ArchiveIcon, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import {
  fetchPricingRules, savePricingRule, setRuleStatus, duplicatePricingRule,
  type PricingRuleWithSummary,
} from "@/lib/pricing/pricingRules";
import { RULE_TYPES_ENABLED, type PricingRuleStatus } from "@/lib/pricing/pricingRuleConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFormatDate } from "@/lib/dateFormat";
import { localDateISO } from "@/lib/pricing/dateUtils";

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  paused: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  expired: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

const RULE_TYPE_LABEL: Record<string, string> = Object.fromEntries(RULE_TYPES_ENABLED.map((t) => [t.value, t.label]));

function benefitSummary(rule: PricingRuleWithSummary): string {
  const b = rule.benefits[0];
  if (!b) return "—";
  if (b.benefit_type === "PERCENT_DISCOUNT" && b.value != null) {
    return `${b.value}% off${b.max_benefit_amount != null ? ` (max ₹${b.max_benefit_amount})` : ""}`;
  }
  if (b.benefit_type === "FLAT_DISCOUNT" && b.value != null) return `₹${b.value} off`;
  return b.benefit_type;
}

type NameMaps = { parties: Map<string, string>; groups: Map<string, string>; products: Map<string, string> };

function targetSummary(rule: PricingRuleWithSummary, names: NameMaps): string {
  const category = rule.conditions.find((c) => c.condition_type === "CATEGORY");
  if (category) {
    const values = Array.isArray(category.value) ? (category.value as string[]) : [String(category.value)];
    return `Category: ${values.join(", ")}`;
  }
  if (rule.targets.length === 0) return "All";
  const byType = (type: string, map: Map<string, string>) =>
    rule.targets.filter((t) => t.target_type === type).map((t) => map.get(t.target_id ?? "") ?? "…");
  const parties = byType("PARTY", names.parties);
  if (parties.length) return `Party: ${parties.join(", ")}`;
  const groups = byType("PARTY_GROUP", names.groups);
  if (groups.length) return `Party Group: ${groups.join(", ")}`;
  const products = byType("PRODUCT", names.products);
  if (products.length) return `Product: ${products.join(", ")}`;
  return rule.targets[0]?.target_type ?? "—";
}

type CreateForm = { name: string; rule_type: string };
const blankForm = (): CreateForm => ({ name: "", rule_type: RULE_TYPES_ENABLED[0].value });

export default function PricingRules() {
  useEffect(() => { document.title = "Pricing Rules — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);
  const fd = useFormatDate();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["pricing-rules", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPricingRules(business!.id),
  });

  const [names, setNames] = useState<NameMaps>({ parties: new Map(), groups: new Map(), products: new Map() });
  useEffect(() => {
    if (!rules?.length) return;
    const partyIds = new Set<string>();
    const groupIds = new Set<string>();
    const productIds = new Set<string>();
    for (const r of rules) {
      for (const t of r.targets) {
        if (!t.target_id) continue;
        if (t.target_type === "PARTY") partyIds.add(t.target_id);
        else if (t.target_type === "PARTY_GROUP") groupIds.add(t.target_id);
        else if (t.target_type === "PRODUCT") productIds.add(t.target_id);
      }
    }
    (async () => {
      const [{ data: parties }, { data: groups }, { data: products }] = await Promise.all([
        partyIds.size ? supabase.from("parties").select("id, name").in("id", Array.from(partyIds)) : Promise.resolve({ data: [] }),
        groupIds.size ? supabase.from("party_groups").select("id, name").in("id", Array.from(groupIds)) : Promise.resolve({ data: [] }),
        productIds.size ? supabase.from("products").select("id, name").in("id", Array.from(productIds)) : Promise.resolve({ data: [] }),
      ]);
      setNames({
        parties: new Map(((parties ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])),
        groups: new Map(((groups ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name])),
        products: new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])),
      });
    })();
  }, [rules]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["pricing-rules", business?.id] });
  const openCreate = () => { setForm(blankForm()); setDialogOpen(true); };

  const create = async () => {
    if (!business?.id) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const id = await savePricingRule(
        business.id,
        { name: form.name, rule_type: form.rule_type, priority: 100, stacking_mode: null, effective_from: localDateISO(), effective_to: null, approval_required: false },
        [], [], []
      );
      toast.success("Rule created as draft");
      setDialogOpen(false);
      refresh();
      navigate(`/pricing/rules/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create rule");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id: string, action: "activate" | "pause" | "archive" | "duplicate", label: string) => {
    if (!business?.id) return;
    setBusyId(id);
    try {
      if (action === "activate") await setRuleStatus(id, business.id, "active");
      else if (action === "pause") await setRuleStatus(id, business.id, "paused");
      else if (action === "archive") await setRuleStatus(id, business.id, "archived");
      else await duplicatePricingRule(id, business.id);
      toast.success(label);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Pricing &amp; Promotion Engine</p>
          <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
            <Percent className="h-7 w-7 text-muted-foreground" /> Pricing Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Party/Item/Category discounts the Pricing Engine applies on top of the base price list. Use the rule editor's Preview tab to test before activating.
          </p>
        </div>
        {editable && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Create Rule</Button>}
      </header>

      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Benefit</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && (rules ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm py-8 text-muted-foreground">No pricing rules yet — create one to get started.</TableCell></TableRow>
              )}
              {(rules ?? []).map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/pricing/rules/${r.id}`)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{RULE_TYPE_LABEL[r.rule_type] ?? r.rule_type}</TableCell>
                  <TableCell className="text-sm">{targetSummary(r, names)}</TableCell>
                  <TableCell className="text-sm">{benefitSummary(r)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.priority}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{r.effective_from ? fd(r.effective_from) : "—"}</TableCell>
                  <TableCell className="text-xs">{r.effective_to ? fd(r.effective_to) : "—"}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => navigate(`/pricing/rules/${r.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && r.status !== "active" && r.status !== "archived" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Activate" disabled={busyId === r.id} onClick={() => runAction(r.id, "activate", `${r.name} activated`)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && r.status === "active" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Pause" disabled={busyId === r.id} onClick={() => runAction(r.id, "pause", `${r.name} paused`)}>
                          <PauseCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && r.status !== "archived" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Archive" disabled={busyId === r.id} onClick={() => runAction(r.id, "archive", `${r.name} archived`)}>
                          <ArchiveIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicate" disabled={busyId === r.id} onClick={() => runAction(r.id, "duplicate", `${r.name} duplicated`)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Pricing Rule</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali 10% Party Discount" />
            </div>
            <div className="space-y-1.5">
              <Label>Rule Type</Label>
              <Select value={form.rule_type} onValueChange={(v) => setForm({ ...form, rule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES_ENABLED.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
