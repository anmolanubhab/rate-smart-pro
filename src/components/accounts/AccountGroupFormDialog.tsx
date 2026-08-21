import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GroupSelector from "@/components/accounts/GroupSelector";
import { createAccountGroup, updateAccountGroup, type AccountGroupNode } from "@/lib/accounting";

const NATURES = ["asset", "liability", "income", "expense", "capital"] as const;
export const NATURE_LABEL: Record<string, string> = {
  asset: "Asset", liability: "Liability", income: "Income", expense: "Expense", capital: "Capital",
};

type FormState = {
  name: string;
  parentId: string | null;
  nature: string;
  groupCode: string;
  allowLedgerCreation: boolean;
  displayOrder: string;
};

const emptyForm: FormState = { name: "", parentId: null, nature: "asset", groupCode: "", allowLedgerCreation: true, displayOrder: "0" };

/** All descendant ids of `id` within `groups`, including `id` itself — used
 *  to keep the "Under Group" picker from offering a group (or one of its own
 *  descendants) as its own parent. The DB's circular-hierarchy trigger is
 *  the real guard; this only keeps the UI from ever showing an invalid pick. */
function selfAndDescendants(id: string, groups: AccountGroupNode[]): Set<string> {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const g of groups) {
      if (g.parent_id === cur && !out.has(g.id)) {
        out.add(g.id);
        stack.push(g.id);
      }
    }
  }
  return out;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AccountGroupNode[];
  businessId: string;
  userId: string;
  /** Editing an existing group, or null to create a new one. */
  editing: AccountGroupNode | null;
  /** Pre-selects "Under Group" when creating (e.g. an "Add sub-group" action
   *  on a specific node). Ignored when `editing` is set. */
  initialParentId?: string | null;
  onSaved: () => void;
}

/** Create/Edit Group dialog — shared by the Group Master screen
 *  (/accounts/groups) and Chart of Accounts, so there is one implementation
 *  of the form, not two divergent copies. */
export default function AccountGroupFormDialog({ open, onOpenChange, groups, businessId, userId, editing, initialParentId = null, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        parentId: editing.parent_id,
        nature: editing.nature ?? "asset",
        groupCode: editing.group_code ?? "",
        allowLedgerCreation: editing.allow_ledger_creation ?? true,
        displayOrder: String(editing.display_order ?? 0),
      });
    } else {
      const parent = initialParentId ? groups.find((g) => g.id === initialParentId) : null;
      setForm({ ...emptyForm, parentId: initialParentId, nature: parent?.nature ?? "asset" });
    }
  }, [open, editing, initialParentId, groups]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Group name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateAccountGroup(editing.id, {
          name: form.name,
          parentId: form.parentId,
          groupCode: form.groupCode,
          allowLedgerCreation: form.allowLedgerCreation,
          displayOrder: Number(form.displayOrder) || 0,
        });
        toast.success(`Group "${form.name}" updated`);
      } else {
        await createAccountGroup({
          businessId,
          userId,
          name: form.name,
          parentId: form.parentId,
          nature: form.nature,
          groupCode: form.groupCode,
          allowLedgerCreation: form.allowLedgerCreation,
          displayOrder: Number(form.displayOrder) || 0,
        });
        toast.success(`Group "${form.name}" created`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save group");
    } finally {
      setSaving(false);
    }
  };

  const excludeForParentPicker = editing ? selfAndDescendants(editing.id, groups) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>{editing ? "Edit Group" : "Create Group"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Vehicle Finance" />
          </div>
          <div className="space-y-1.5">
            <Label>Under Group</Label>
            <GroupSelector
              groups={groups}
              value={form.parentId}
              onChange={(id) => {
                const parent = groups.find((g) => g.id === id);
                setForm({ ...form, parentId: id, nature: parent?.nature ?? form.nature });
              }}
              excludeIds={excludeForParentPicker}
              placeholder="Top level (no parent)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select value={form.nature} onValueChange={(v) => setForm({ ...form, nature: v })} disabled={!!form.parentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NATURES.map((n) => <SelectItem key={n} value={n}>{NATURE_LABEL[n]}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.parentId && <p className="text-xs text-muted-foreground">Inherited from the parent group</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Group Code</Label>
              <Input value={form.groupCode} onChange={(e) => setForm({ ...form, groupCode: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Display Order</Label>
              <Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label className="text-sm">Allow Ledger Creation</Label>
              <Switch checked={form.allowLedgerCreation} onCheckedChange={(v) => setForm({ ...form, allowLedgerCreation: v })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Group"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
