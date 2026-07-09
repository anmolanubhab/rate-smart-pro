import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Plus, Pencil, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Group = {
  id: string;
  parent_id: string | null;
  name: string;
  group_code: string | null;
  is_active: boolean;
  is_system: boolean;
  default_rd_pct: number | null;
  default_cd_pct: number | null;
  default_credit_days: number | null;
  default_credit_limit: number | null;
  grace_days: number;
  interest_pct: number;
  stop_supply_rule: string;
  payment_terms: string | null;
  territory: string | null;
  zone: string | null;
  route: string | null;
  approval_required: boolean;
  override_allowed: boolean;
};

const emptyForm = {
  name: "", group_code: "", parent_id: "" as string,
  default_rd_pct: "", default_cd_pct: "", default_credit_days: "", default_credit_limit: "",
  grace_days: "0", interest_pct: "0", stop_supply_rule: "none",
  payment_terms: "", territory: "", zone: "", route: "",
  approval_required: false, override_allowed: true,
};

export default function PartyGroups() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Group | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [propagateTarget, setPropagateTarget] = useState<Group | null>(null);
  const [propagating, setPropagating] = useState(false);

  useEffect(() => { document.title = "Party Groups — RD Pro"; }, []);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["party-groups", business?.id],
    enabled: !!business,
    queryFn: async () => {
      // Seed the recommended hierarchy the first time this business opens
      // the page — no-ops if groups already exist.
      await supabase.rpc("seed_party_groups" as never, { _business_id: business!.id } as never);
      const { data, error } = await supabase
        .from("party_groups")
        .select("*")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data as Group[]) ?? [];
    },
  });

  const roots = groups.filter((g) => !g.parent_id);
  const childrenOf = (id: string) => groups.filter((g) => g.parent_id === id);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openNew = (parentId?: string) => {
    setEditing(null);
    setForm({ ...emptyForm, parent_id: parentId ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name, group_code: g.group_code ?? "", parent_id: g.parent_id ?? "",
      default_rd_pct: String(g.default_rd_pct ?? ""), default_cd_pct: String(g.default_cd_pct ?? ""),
      default_credit_days: String(g.default_credit_days ?? ""), default_credit_limit: String(g.default_credit_limit ?? ""),
      grace_days: String(g.grace_days ?? 0), interest_pct: String(g.interest_pct ?? 0),
      stop_supply_rule: g.stop_supply_rule ?? "none",
      payment_terms: g.payment_terms ?? "", territory: g.territory ?? "", zone: g.zone ?? "", route: g.route ?? "",
      approval_required: g.approval_required, override_allowed: g.override_allowed,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!business || !form.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        parent_id: form.parent_id || null,
        name: form.name.trim(),
        group_code: form.group_code.trim() || null,
        default_rd_pct: form.default_rd_pct ? Number(form.default_rd_pct) : null,
        default_cd_pct: form.default_cd_pct ? Number(form.default_cd_pct) : null,
        default_credit_days: form.default_credit_days ? Number(form.default_credit_days) : null,
        default_credit_limit: form.default_credit_limit ? Number(form.default_credit_limit) : null,
        grace_days: Number(form.grace_days) || 0,
        interest_pct: Number(form.interest_pct) || 0,
        stop_supply_rule: form.stop_supply_rule,
        payment_terms: form.payment_terms || null,
        territory: form.territory || null,
        zone: form.zone || null,
        route: form.route || null,
        approval_required: form.approval_required,
        override_allowed: form.override_allowed,
      };

      if (editing) {
        const { error } = await supabase.from("party_groups").update(payload as never).eq("id", editing.id);
        if (error) throw error;
        toast.success("Group updated");
      } else {
        const { error } = await supabase.from("party_groups").insert(payload as never);
        if (error) throw error;
        toast.success("Group created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["party-groups", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save group");
    } finally {
      setSaving(false);
    }
  };

  const propagate = async (scope: "inherited_only" | "all") => {
    if (!propagateTarget) return;
    setPropagating(true);
    try {
      const { data, error } = await supabase.rpc("propagate_group_defaults" as never, {
        _group_id: propagateTarget.id, _scope: scope,
      } as never);
      if (error) throw error;
      toast.success(`Updated ${data} ${data === 1 ? "party" : "parties"}`);
      setPropagateTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not propagate");
    } finally {
      setPropagating(false);
    }
  };

  const Row = ({ g, depth }: { g: Group; depth: number }) => {
    const kids = childrenOf(g.id);
    const isOpen = expanded.has(g.id);
    return (
      <>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md group"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {kids.length > 0 ? (
            <button onClick={() => toggle(g.id)} className="text-muted-foreground">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : <span className="w-4" />}
          <span className="font-medium">{g.name}</span>
          {g.group_code && <Badge variant="outline" className="text-xs">{g.group_code}</Badge>}
          {g.default_rd_pct != null && <span className="text-xs text-muted-foreground">RD {g.default_rd_pct}%</span>}
          {g.default_cd_pct != null && <span className="text-xs text-muted-foreground">CD {g.default_cd_pct}%</span>}
          {g.default_credit_days != null && <span className="text-xs text-muted-foreground">{g.default_credit_days}d credit</span>}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => setPropagateTarget(g)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Push to parties
          </Button>
          <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => openNew(g.id)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Sub-group
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isOpen && kids.map((k) => <Row key={k.id} g={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Party Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Default RD/CD, credit terms, and territory rules — every party in a group inherits
            these unless it has its own override.
          </p>
        </div>
        <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" /> New Group</Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-2">
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
        ) : roots.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No groups yet.</div>
        ) : (
          roots.map((g) => <Row key={g.id} g={g} depth={0} />)
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New Party Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Group Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Group Code</Label>
                <Input value={form.group_code} onChange={(e) => setForm({ ...form, group_code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Parent Group</Label>
                <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {groups.filter((g) => g.id !== editing?.id).map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Commercial Defaults</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Default RD %</Label>
                  <Input type="number" value={form.default_rd_pct} onChange={(e) => setForm({ ...form, default_rd_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Default CD %</Label>
                  <Input type="number" value={form.default_cd_pct} onChange={(e) => setForm({ ...form, default_cd_pct: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Credit Defaults</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Credit Days</Label>
                  <Input type="number" value={form.default_credit_days} onChange={(e) => setForm({ ...form, default_credit_days: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Credit Limit (₹)</Label>
                  <Input type="number" value={form.default_credit_limit} onChange={(e) => setForm({ ...form, default_credit_limit: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Grace Days</Label>
                  <Input type="number" value={form.grace_days} onChange={(e) => setForm({ ...form, grace_days: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Interest %</Label>
                  <Input type="number" value={form.interest_pct} onChange={(e) => setForm({ ...form, interest_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Stop Supply Rule</Label>
                  <Select value={form.stop_supply_rule} onValueChange={(v) => setForm({ ...form, stop_supply_rule: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="on_overdue">On overdue</SelectItem>
                      <SelectItem value="on_limit_breach">On credit-limit breach</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Sales</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Territory</Label>
                  <Input value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Zone</Label>
                  <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Route</Label>
                  <Input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <Label>Payment Terms</Label>
              <Input placeholder="e.g. Net 30" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-normal">Approval required for new parties in this group</Label>
                <Switch checked={form.approval_required} onCheckedChange={(v) => setForm({ ...form, approval_required: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Allow individual parties to override group defaults</Label>
                <Switch checked={form.override_allowed} onCheckedChange={(v) => setForm({ ...form, override_allowed: v })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Group"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!propagateTarget} onOpenChange={(o) => !o && setPropagateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push "{propagateTarget?.name}" defaults to parties?</AlertDialogTitle>
            <AlertDialogDescription>
              This updates RD%, CD%, credit days and credit limit for parties in this group.
              Choose whether to only touch parties still using group defaults, or force it onto
              every party in the group (including ones with a manual override).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={propagating}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={propagating} onClick={() => propagate("inherited_only")}>
              Only inherited parties
            </Button>
            <AlertDialogAction disabled={propagating} onClick={() => propagate("all")}>
              All parties (override too)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
