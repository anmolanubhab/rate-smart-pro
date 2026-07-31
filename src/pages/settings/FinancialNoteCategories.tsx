// src/pages/settings/FinancialNoteCategories.tsx
// Route: /settings/financial-note-categories
//
// Master data for the Financial Adjustment mode of Debit Note / Credit Note
// (see note_adjustment_categories, migration 20260728060000). Any category
// used by that mode — Freight, Discount, Commission, and any future one like
// Warranty Claim or Insurance Claim — is added here, never hardcoded in
// application code.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Copy, Trash2, Lock, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { fetchLedgersWithBalance, ensurePartyLedgers, seedAccounts, type LedgerRow } from "@/lib/accounting";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Category = {
  id: string;
  code: string;
  category_name: string;
  description: string | null;
  debit_default_ledger_id: string | null;
  credit_default_ledger_id: string | null;
  gst_applicable: boolean;
  default_gst_rate: number | null;
  default_narration: string | null;
  affects_profit_loss: boolean;
  allow_ledger_override: boolean;
  display_order: number;
  system_category: boolean;
  is_active: boolean;
};

type FormState = Omit<Category, "id" | "system_category"> & { id?: string; system_category?: boolean };

const blankForm = (nextOrder: number): FormState => ({
  code: "",
  category_name: "",
  description: "",
  debit_default_ledger_id: null,
  credit_default_ledger_id: null,
  gst_applicable: false,
  default_gst_rate: null,
  default_narration: "",
  affects_profit_loss: true,
  allow_ledger_override: true,
  display_order: nextOrder,
  is_active: true,
});

export default function FinancialNoteCategories() {
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "Financial Note Categories — RD Pro"; }, []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm(0));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const list = useQuery({
    queryKey: ["note-adjustment-categories", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("note_adjustment_categories" as any)
        .select("*")
        .eq("business_id", business!.id)
        .eq("is_deleted", false)
        .order("display_order")
        .order("category_name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });

  const ledgers = useQuery({
    queryKey: ["ledgers-for-categories", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
      await ensurePartyLedgers(user!.id);
      return fetchLedgersWithBalance(user!.id);
    },
  });

  const rows = list.data ?? [];
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        if (!r.code.toLowerCase().includes(s) && !r.category_name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const ledgerName = (id: string | null) => (id ? (ledgers.data ?? []).find((l: LedgerRow) => l.id === id)?.name ?? "—" : "—");

  const openNew = () => {
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 1;
    setForm(blankForm(nextOrder));
    setDialogOpen(true);
  };

  const openEdit = (row: Category) => {
    setForm({ ...row });
    setDialogOpen(true);
  };

  const openCopy = (row: Category) => {
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 1;
    setForm({
      ...row,
      id: undefined,
      code: `${row.code}_COPY`,
      category_name: `${row.category_name} (Copy)`,
      system_category: false,
      display_order: nextOrder,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!business?.id || !user?.id) return;
    if (!form.code.trim() || !form.category_name.trim()) {
      toast.error("Code and Category Name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        code: form.code.trim().toUpperCase().replace(/\s+/g, "_"),
        category_name: form.category_name.trim(),
        description: form.description || null,
        debit_default_ledger_id: form.debit_default_ledger_id || null,
        credit_default_ledger_id: form.credit_default_ledger_id || null,
        gst_applicable: form.gst_applicable,
        default_gst_rate: form.gst_applicable ? form.default_gst_rate : null,
        default_narration: form.default_narration || null,
        affects_profit_loss: form.affects_profit_loss,
        allow_ledger_override: form.allow_ledger_override,
        display_order: form.display_order,
        is_active: form.is_active,
        updated_by: user.id,
      };

      if (form.id) {
        const { error } = await supabase.from("note_adjustment_categories" as any).update(payload).eq("id", form.id);
        if (error) throw error;
        await logAudit({ business_id: business.id, action: "NOTE_CATEGORY_UPDATE", entity_type: "note_adjustment_categories", entity_id: form.id, new_value: payload });
        toast.success("Category updated");
      } else {
        const { data, error } = await supabase
          .from("note_adjustment_categories" as any)
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit({ business_id: business.id, action: "NOTE_CATEGORY_CREATE", entity_type: "note_adjustment_categories", entity_id: (data as any)?.id, new_value: payload });
        toast.success("Category created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["note-adjustment-categories"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save category");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: Category) => {
    if (!business?.id || !user?.id) return;
    const { error } = await supabase
      .from("note_adjustment_categories" as any)
      .update({ is_active: !row.is_active, updated_by: user.id })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business.id, action: "NOTE_CATEGORY_UPDATE", entity_type: "note_adjustment_categories", entity_id: row.id, new_value: { is_active: !row.is_active } });
    qc.invalidateQueries({ queryKey: ["note-adjustment-categories"] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !business?.id || !user?.id) return;
    const { error } = await supabase
      .from("note_adjustment_categories" as any)
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); setDeleteTarget(null); return; }
    await logAudit({ business_id: business.id, action: "NOTE_CATEGORY_DELETE", entity_type: "note_adjustment_categories", entity_id: deleteTarget.id });
    toast.success(`"${deleteTarget.category_name}" removed`);
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["note-adjustment-categories"] });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Settings</p>
          <h1 className="font-display text-3xl font-bold mt-1">Financial Note Categories</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Used by Financial Adjustment mode on Debit &amp; Credit Notes (Freight, Discount, Commission, etc.).
            New categories — Warranty Claim, Insurance Claim, and so on — are added here, not in code.
          </p>
        </div>
        {editable && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Category</Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Debit Ledger</TableHead>
                <TableHead>Credit Ledger</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>P&amp;L</TableHead>
                <TableHead>Override</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">No categories found</TableCell></TableRow>
              ) : filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{row.display_order}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.code}
                    {row.system_category && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>{row.category_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ledgerName(row.debit_default_ledger_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ledgerName(row.credit_default_ledger_id)}</TableCell>
                  <TableCell>{row.gst_applicable ? <Badge variant="secondary">{row.default_gst_rate ?? "—"}%</Badge> : "—"}</TableCell>
                  <TableCell>{row.affects_profit_loss ? "P&L" : "B/S"}</TableCell>
                  <TableCell>{row.allow_ledger_override ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Switch checked={row.is_active} disabled={!editable} onCheckedChange={() => toggleActive(row)} />
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCopy(row)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={row.system_category}
                          title={row.system_category ? "System categories can't be deleted" : "Delete"}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  value={form.code}
                  disabled={!!form.system_category}
                  placeholder="e.g. FREIGHT"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category Name <span className="text-destructive">*</span></Label>
                <Input value={form.category_name} onChange={(e) => setForm({ ...form, category_name: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Debit Note Default Ledger</Label>
                <Select value={form.debit_default_ledger_id ?? "__none"} onValueChange={(v) => setForm({ ...form, debit_default_ledger_id: v === "__none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {(ledgers.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Credit Note Default Ledger</Label>
                <Select value={form.credit_default_ledger_id ?? "__none"} onValueChange={(v) => setForm({ ...form, credit_default_ledger_id: v === "__none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {(ledgers.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="cursor-pointer">GST Applicable</Label>
                <Switch checked={form.gst_applicable} onCheckedChange={(v) => setForm({ ...form, gst_applicable: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Default GST Rate (%)</Label>
                <Input
                  type="number" disabled={!form.gst_applicable}
                  value={form.default_gst_rate ?? ""}
                  onChange={(e) => setForm({ ...form, default_gst_rate: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Default Narration</Label>
              <Input value={form.default_narration ?? ""} onChange={(e) => setForm({ ...form, default_narration: e.target.value })} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="cursor-pointer text-xs">Affects P&amp;L</Label>
                <Switch checked={form.affects_profit_loss} onCheckedChange={(v) => setForm({ ...form, affects_profit_loss: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="cursor-pointer text-xs">Allow Override</Label>
                <Switch checked={form.allow_ledger_override} onCheckedChange={(v) => setForm({ ...form, allow_ledger_override: v })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Display Order</Label>
                <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soft-delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Category?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.category_name}</strong> will be hidden from selection. Existing vouchers that already
              used it keep their own snapshot and are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
