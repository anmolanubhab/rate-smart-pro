import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import {
  listApprovalRules, listApprovalRuleSteps, createApprovalRule,
  activateApprovalRule, deactivateApprovalRule, addApprovalRuleStep, removeApprovalRuleStep,
  type PlatformApprovalRuleRow, type PlatformApprovalRuleStepRow,
} from "@/lib/platformApprovalRules";

export default function PlatformApprovalRules() {
  useEffect(() => { document.title = "RD-Pro Control Center — Approval Rules"; }, []);
  const { hasPermission } = usePlatformAuth();
  const canManage = hasPermission("approval_rule.manage");

  const [rules, setRules] = useState<PlatformApprovalRuleRow[]>([]);
  const [selected, setSelected] = useState<PlatformApprovalRuleRow | null>(null);
  const [steps, setSteps] = useState<PlatformApprovalRuleStepRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newStepLevel, setNewStepLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    request_type: "", name: "", min_amount: "", max_amount: "",
    step1Level: "100",
  });

  const load = async () => {
    const r = await listApprovalRules();
    setRules(r);
    if (r.length && !selected) selectRule(r[0]);
  };

  useEffect(() => { load().catch((e) => toast.error(e.message ?? "Failed to load rules")); }, []);

  const selectRule = async (rule: PlatformApprovalRuleRow) => {
    setSelected(rule);
    setSteps(await listApprovalRuleSteps(rule.id));
  };

  const submitCreate = async () => {
    if (!form.request_type || !form.name) { toast.error("Request type and name are required"); return; }
    setBusy(true);
    try {
      const created = await createApprovalRule({
        request_type: form.request_type,
        name: form.name,
        min_amount: form.min_amount ? Number(form.min_amount) : null,
        max_amount: form.max_amount ? Number(form.max_amount) : null,
        steps: [{ step_order: 1, min_level: Number(form.step1Level) || 100, label: "Step 1" }],
      });
      setCreateOpen(false);
      setForm({ request_type: "", name: "", min_amount: "", max_amount: "", step1Level: "100" });
      await load();
      await selectRule(created);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (rule: PlatformApprovalRuleRow) => {
    try {
      if (rule.is_active) await deactivateApprovalRule(rule.id);
      else await activateApprovalRule(rule.id);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update rule");
    }
  };

  const addStep = async () => {
    if (!selected || !newStepLevel) return;
    try {
      await addApprovalRuleStep(selected.id, {
        step_order: steps.length + 1,
        min_level: Number(newStepLevel),
      });
      setNewStepLevel("");
      await selectRule(selected);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add step");
    }
  };

  const removeStep = async (stepId: string) => {
    if (!selected) return;
    try {
      await removeApprovalRuleStep(stepId);
      await selectRule(selected);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove step");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Approval Rules</h1>
          <p className="text-sm text-muted-foreground">
            Configurable approval chains per request type. Steps are gated by minimum staff level, not a named role.
          </p>
        </div>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Rule</Button>}
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="pt-6 space-y-1">
            {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules yet.</p>}
            {rules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => selectRule(rule)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selected?.id === rule.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span>{rule.name}</span>
                  <Badge variant={rule.is_active ? "default" : "outline"}>{rule.is_active ? "active" : "inactive"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{rule.request_type}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{selected.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.request_type}
                  {(selected.min_amount != null || selected.max_amount != null) &&
                    ` · amount ${selected.min_amount ?? 0}–${selected.max_amount ?? "∞"}`}
                </p>
              </div>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => toggleActive(selected)}>
                  <Power className="h-3.5 w-3.5 mr-1.5" /> {selected.is_active ? "Deactivate" : "Activate"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((s) => (
                <div key={s.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <span className="text-sm">Step {s.step_order} · min level {s.min_level} {s.label && `· ${s.label}`}</span>
                  {canManage && (
                    <button onClick={() => removeStep(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></button>
                  )}
                </div>
              ))}
              {canManage && (
                <div className="flex gap-2 items-end">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs">Add step — minimum level</Label>
                    <Input type="number" value={newStepLevel} onChange={(e) => setNewStepLevel(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={addStep} disabled={!newStepLevel}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Approval Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Request type</Label>
              <Input value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} placeholder="e.g. refund, data_correction" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min amount (optional)</Label>
                <Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max amount (optional)</Label>
                <Input type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>First step — minimum level</Label>
              <Input type="number" value={form.step1Level} onChange={(e) => setForm({ ...form, step1Level: e.target.value })} />
              <p className="text-xs text-muted-foreground">More steps can be added after the rule is created.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={busy}>{busy ? "Creating…" : "Create Rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
