import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Plus, Pencil } from "lucide-react";
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

type Group = {
  id: string;
  parent_id: string | null;
  name: string;
  group_code: string | null;
  is_active: boolean;
};

const emptyForm = { name: "", group_code: "", parent_id: "" as string, is_active: true };

export default function SalesmanGroups() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Group | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = "Salesman Groups — RD Pro"; }, []);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["salesman-groups", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salesman_groups" as never)
        .select("*")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data as unknown as Group[]) ?? [];
    },
  });

  const roots = groups.filter((g) => !g.parent_id);
  const childrenOf = (id: string) => groups.filter((g) => g.parent_id === id);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
      is_active: g.is_active,
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
        is_active: form.is_active,
      };

      if (editing) {
        const { error } = await supabase.from("salesman_groups" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
        toast.success("Group updated");
      } else {
        const { error } = await supabase.from("salesman_groups" as never).insert(payload as never);
        if (error) throw error;
        toast.success("Group created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["salesman-groups", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save group");
    } finally {
      setSaving(false);
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
          {!g.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
          <span className="flex-1" />
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
          <h1 className="text-2xl font-bold">Salesman Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group salesmen (e.g. by team or region) for the Sales Performance Report's
            Group → Salesman → Party drill-down.
          </p>
        </div>
        <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" /> New Group</Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-2">
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
        ) : roots.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No salesman groups yet — create one, then add salesmen under it.
          </div>
        ) : (
          roots.map((g) => <Row key={g.id} g={g} depth={0} />)
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New Salesman Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
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
            <div className="flex items-center justify-between border-t pt-3">
              <Label className="font-normal">Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Group"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
