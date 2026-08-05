// Pricing & Promotion Engine — Phase 1C Core Slice, Screen 1.
// Route: /pricing/price-lists
//
// Table + Create/Edit(→Editor)/Activate/Archive/Duplicate/Mark-Default —
// same shape as GstConfiguration.tsx's GST registrations table. No
// server-side pagination here: a business has a handful of price lists,
// not thousands (unlike the Products tab inside the Editor).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Star, Copy, CheckCircle2, Archive as ArchiveIcon, Tags } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  fetchPriceLists, savePriceList, activatePriceList, archivePriceList, duplicatePriceList,
  type PriceListWithCount,
} from "@/lib/pricing/priceLists";
import { PRICE_LIST_TYPES } from "@/lib/pricing/priceListConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFormatDate } from "@/lib/dateFormat";

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

type CreateForm = { name: string; list_type: string; currency: string; effective_from: string; effective_to: string };
const blankForm = (): CreateForm => ({ name: "", list_type: "Dealer", currency: "INR", effective_from: new Date().toISOString().slice(0, 10), effective_to: "" });

export default function PriceLists() {
  useEffect(() => { document.title = "Price Lists — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);
  const fd = useFormatDate();

  const { data: lists, isLoading } = useQuery({
    queryKey: ["price-lists", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPriceLists(business!.id),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["price-lists", business?.id] });

  const openCreate = () => { setForm(blankForm()); setDialogOpen(true); };

  const create = async () => {
    if (!business?.id) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const id = await savePriceList({
        business_id: business.id,
        name: form.name,
        list_type: form.list_type,
        currency: form.currency,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      });
      await logAudit({ business_id: business.id, action: "PRICE_LIST_CREATE", entity_type: "price_lists", entity_id: id, new_value: { name: form.name } });
      toast.success("Price list created");
      setDialogOpen(false);
      refresh();
      navigate(`/pricing/price-lists/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create price list");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id: string, action: "activate" | "archive" | "duplicate", label: string) => {
    if (!business?.id) return;
    setBusyId(id);
    try {
      if (action === "activate") await activatePriceList(id);
      else if (action === "archive") await archivePriceList(id);
      else await duplicatePriceList(id, business.id);
      await logAudit({ business_id: business.id, action: `PRICE_LIST_${action.toUpperCase()}`, entity_type: "price_lists", entity_id: id });
      toast.success(label);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const markDefault = async (l: PriceListWithCount) => {
    if (!business?.id) return;
    setBusyId(l.id);
    try {
      await savePriceList({
        id: l.id, business_id: business.id, name: l.name, code: l.code, list_type: l.list_type,
        description: l.description, price_source: l.price_source, price_basis: l.price_basis,
        rounding_policy: l.rounding_policy, currency: l.currency, is_default: true,
        effective_from: l.effective_from, effective_to: l.effective_to,
      });
      toast.success(`${l.name} is now the default price list`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not update");
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
            <Tags className="h-7 w-7 text-muted-foreground" /> Price Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Retail/Wholesale/Dealer/... price lists the Pricing Engine resolves against. See{" "}
            <Link to="/pricing/test-bench" className="text-primary hover:underline">Pricing Test Bench</Link> to verify how a list gets picked up.
          </p>
        </div>
        {editable && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Create Price List</Button>}
      </header>

      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && (lists ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm py-8 text-muted-foreground">No price lists yet — create one to get started.</TableCell></TableRow>
              )}
              {(lists ?? []).map((l) => (
                <TableRow key={l.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/pricing/price-lists/${l.id}`)}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.list_type ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_TONE[l.status] ?? ""}>{l.status}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {l.is_default ? (
                      <Badge className="gap-1"><Star className="h-3 w-3" /> Default</Badge>
                    ) : editable ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busyId === l.id} onClick={() => markDefault(l)}>Make default</Button>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.effective_from ? fd(l.effective_from) : "—"}</TableCell>
                  <TableCell className="text-xs">{l.effective_to ? fd(l.effective_to) : "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{l.products_count}</TableCell>
                  <TableCell className="text-xs">{fd(l.updated_at)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => navigate(`/pricing/price-lists/${l.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && l.status !== "active" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Activate" disabled={busyId === l.id} onClick={() => runAction(l.id, "activate", `${l.name} activated`)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && l.status !== "archived" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Archive" disabled={busyId === l.id} onClick={() => runAction(l.id, "archive", `${l.name} archived`)}>
                          <ArchiveIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicate" disabled={busyId === l.id} onClick={() => runAction(l.id, "duplicate", `${l.name} duplicated`)}>
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
          <DialogHeader><DialogTitle>Create Price List</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dealer 2026-27" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.list_type} onValueChange={(v) => setForm({ ...form, list_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICE_LIST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To</Label>
                <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
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
