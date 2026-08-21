// Shared "Create/Edit Ledger" dialog — extracted from src/pages/accounts/LedgerAccounts.tsx
// so both the Ledger Accounts page and the Universal Voucher Engine's Ctrl+N
// shortcut use one implementation instead of two divergent copies.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { assertLedgerNameAvailable, updateLedger, fetchAccountGroupTree, type LedgerRow, type AccountGroupNode } from "@/lib/accounting";
import { resolveLedgerEditor } from "@/lib/ledgerEditRouter";
import GroupSelector from "@/components/accounts/GroupSelector";
import type { BusinessRole } from "@/hooks/useBusiness";
import type { PermissionMatrix } from "@/lib/permissionMatrix";
import { canCreateLedger } from "@/lib/permissions";

export const LEDGER_TYPES = [
  "expense", "income", "asset", "liability", "customer", "supplier",
  "cash", "bank", "capital", "loan", "employee", "gst_input", "gst_output",
] as const;

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  expense: "Expense", income: "Income", asset: "Asset", liability: "Liability",
  customer: "Customer", supplier: "Supplier", cash: "Cash", bank: "Bank",
  capital: "Capital", loan: "Loan", employee: "Employee",
  gst_input: "GST Input", gst_output: "GST Output",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  /** Called after a successful create/edit with the ledger's id + name, so the
   *  caller (e.g. the voucher grid) can immediately select it. */
  onCreated: (ledger: { id: string; name: string }) => void;
  /** When set, the dialog edits this ledger instead of creating a new one. */
  ledger?: LedgerRow | null;
  /** Pre-selects the Account Group when creating (e.g. an "Add ledger here"
   *  action on a specific Chart of Accounts node). Ignored when `ledger` is set. */
  presetGroupId?: string | null;
  /** Quick Create Master RBAC gate (create mode only — editing an existing
   *  ledger keeps whatever access control its own call site already
   *  enforces). Optional so existing callers that don't pass these keep
   *  today's behavior unchanged. */
  role?: BusinessRole | null;
  permissions?: PermissionMatrix | null;
}

const emptyForm = { name: "", ledger_type: "expense", group_id: "", opening_balance: "0", opening_balance_type: "dr" as "dr" | "cr" };

export default function QuickCreateLedgerDialog({ open, onOpenChange, businessId, userId, onCreated, ledger, presetGroupId, role, permissions }: Props) {
  const isEdit = !!ledger;
  const createAllowed = isEdit || role === undefined ? true : canCreateLedger(role, permissions);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<AccountGroupNode[]>([]);
  const [form, setForm] = useState(emptyForm);

  // Defense in depth for the Smart Edit Router (src/lib/ledgerEditRouter.ts):
  // no matter how this dialog was reached, it must never render as an
  // editor for an entity-linked ledger -- redirect to that entity's own
  // master instead of letting its business fields be edited from here too.
  useEffect(() => {
    if (!open || !ledger) return;
    const resolution = resolveLedgerEditor(ledger);
    if (resolution.kind === "entity") {
      onOpenChange(false);
      navigate(resolution.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ledger]);

  useEffect(() => {
    if (!open || !businessId) return;
    fetchAccountGroupTree(businessId).then(setGroups).catch(() => setGroups([]));
  }, [open, businessId]);

  useEffect(() => {
    if (!open) return;
    setForm(
      ledger
        ? {
            name: ledger.name,
            ledger_type: ledger.ledger_type,
            group_id: ledger.group_id ?? "",
            opening_balance: String(ledger.opening_balance ?? 0),
            opening_balance_type: ledger.opening_balance_type,
          }
        : { ...emptyForm, group_id: presetGroupId ?? "" }
    );
  }, [open, ledger, presetGroupId]);

  const save = async () => {
    if (!isEdit && !createAllowed) { toast.error("You don't have permission to create a new ledger."); return; }
    if (!form.name.trim()) { toast.error("Ledger name is required"); return; }
    if (!form.group_id) { toast.error("Group is required"); return; }
    setSaving(true);
    try {
      await assertLedgerNameAvailable(businessId, form.name, ledger?.id);

      if (isEdit) {
        await updateLedger(ledger!.id, {
          name: form.name.trim(),
          ledger_type: form.ledger_type,
          group_id: form.group_id || null,
          opening_balance: Number(form.opening_balance) || 0,
          opening_balance_type: form.opening_balance_type,
        });
        toast.success(`Ledger "${form.name}" updated`);
        onOpenChange(false);
        onCreated({ id: ledger!.id, name: form.name.trim() });
      } else {
        const { data, error } = await supabase.from("ledger_accounts").insert({
          business_id: businessId,
          user_id: userId,
          created_by: userId,
          name: form.name.trim(),
          ledger_type: form.ledger_type,
          group_id: form.group_id || null,
          opening_balance: Number(form.opening_balance) || 0,
          opening_balance_type: form.opening_balance_type,
          is_system: false,
          status: "active",
        } as never).select("id, name").single();
        if (error) throw error;
        toast.success(`Ledger "${form.name}" created`);
        onOpenChange(false);
        onCreated({ id: (data as any).id, name: (data as any).name });
        setForm(emptyForm);
      }
    } catch (e: any) {
      toast.error(e.message ?? `Could not ${isEdit ? "update" : "create"} ledger`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>{isEdit ? "Edit Ledger" : "Create New Ledger"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ledger Name *</Label>
            <Input
              autoFocus
              placeholder="e.g. Diwali Bonus Expense"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ledger Type</Label>
              <Select value={form.ledger_type} onValueChange={(v) => setForm({ ...form, ledger_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEDGER_TYPES.map((t) => <SelectItem key={t} value={t}>{LEDGER_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account Group *</Label>
              <GroupSelector
                groups={groups}
                value={form.group_id || null}
                onChange={(id) => setForm({ ...form, group_id: id })}
                placeholder="Select group"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opening Balance</Label>
              <Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Balance Type</Label>
              <Select value={form.opening_balance_type} onValueChange={(v) => setForm({ ...form, opening_balance_type: v as "dr" | "cr" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dr">Debit (Dr)</SelectItem>
                  <SelectItem value="cr">Credit (Cr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save Changes" : "Create Ledger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
