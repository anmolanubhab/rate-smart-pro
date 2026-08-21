// Company Scheme management — Purchase Pricing & Scheme Engine.
// Route: /purchase/schemes
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, CheckCircle2, Archive as ArchiveIcon } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import {
  fetchPurchaseSchemes, savePurchaseScheme, activatePurchaseScheme, archivePurchaseScheme,
  type PurchaseScheme, type PurchaseSchemeStatus,
} from "@/lib/purchaseSchemes";
import type { PurchaseSchemeType } from "@/lib/purchaseCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  paused: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  expired: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

const SCHEME_TYPE_LABELS: Record<PurchaseSchemeType, string> = {
  buy_x_get_y: "Buy X Get Y",
  slab: "Slab (Qty breakpoints)",
  percentage: "Percentage Benefit",
  fixed_amount: "Fixed Amount Benefit",
  rate_benefit: "Rate Benefit",
  none: "No Scheme",
};

type FormState = {
  name: string;
  scheme_type: PurchaseSchemeType;
  buy_qty: string;
  get_qty: string;
  pct: string;
  amount: string;
  per_qty: string;
  benefit_amount: string;
  breakpoints: { min_qty: string; free_qty: string }[];
  effective_from: string;
  effective_to: string;
};

const blankForm = (): FormState => ({
  name: "", scheme_type: "buy_x_get_y",
  buy_qty: "10", get_qty: "1", pct: "2", amount: "500", per_qty: "100", benefit_amount: "50",
  breakpoints: [{ min_qty: "50", free_qty: "5" }],
  effective_from: new Date().toISOString().slice(0, 10), effective_to: "",
});

export default function PurchaseSchemes() {
  useEffect(() => { document.title = "Company Schemes — RD Pro"; }, []);
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "purchase.edit", permissions) || canGranular(role, "settings.edit", permissions);

  const { data: schemes, isLoading } = useQuery({
    queryKey: ["purchase-schemes", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPurchaseSchemes(business!.id),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseScheme | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openNew = () => { setEditing(null); setForm(blankForm()); setDialogOpen(true); };
  const openEdit = (s: PurchaseScheme) => {
    setEditing(s);
    setForm({
      name: s.name,
      scheme_type: s.scheme_type,
      buy_qty: String(s.config.buy_qty ?? 10),
      get_qty: String(s.config.get_qty ?? 1),
      pct: String(s.config.pct ?? 2),
      amount: String(s.config.amount ?? 500),
      per_qty: String(s.config.per_qty ?? 100),
      benefit_amount: String(s.config.benefit_amount ?? 50),
      breakpoints: (s.config.breakpoints ?? [{ min_qty: 50, free_qty: 5 }]).map((b) => ({ min_qty: String(b.min_qty), free_qty: String(b.free_qty) })),
      effective_from: s.effective_from ?? "",
      effective_to: s.effective_to ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!business?.id) return;
    if (!form.name.trim()) return toast.error("Scheme name is required");
    setSaving(true);
    try {
      const config =
        form.scheme_type === "buy_x_get_y" ? { buy_qty: Number(form.buy_qty), get_qty: Number(form.get_qty) } :
        form.scheme_type === "slab" ? { breakpoints: form.breakpoints.map((b) => ({ min_qty: Number(b.min_qty), free_qty: Number(b.free_qty) })) } :
        form.scheme_type === "percentage" ? { pct: Number(form.pct) } :
        form.scheme_type === "fixed_amount" ? { amount: Number(form.amount) } :
        form.scheme_type === "rate_benefit" ? { per_qty: Number(form.per_qty), benefit_amount: Number(form.benefit_amount) } :
        {};
      await savePurchaseScheme({
        id: editing?.id,
        business_id: business.id,
        name: form.name,
        scheme_type: form.scheme_type,
        config,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      });
      toast.success(editing ? "Scheme updated" : "Scheme created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["purchase-schemes", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save scheme");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (s: PurchaseScheme, status: PurchaseSchemeStatus) => {
    setBusyId(s.id);
    try {
      if (status === "active") await activatePurchaseScheme(s.id);
      else await archivePurchaseScheme(s.id);
      qc.invalidateQueries({ queryKey: ["purchase-schemes", business?.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const addBreakpoint = () => setForm((f) => ({ ...f, breakpoints: [...f.breakpoints, { min_qty: "", free_qty: "" }] }));
  const updateBreakpoint = (i: number, patch: Partial<{ min_qty: string; free_qty: string }>) =>
    setForm((f) => ({ ...f, breakpoints: f.breakpoints.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  const removeBreakpoint = (i: number) => setForm((f) => ({ ...f, breakpoints: f.breakpoints.filter((_, idx) => idx !== i) }));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Company Schemes</h1>
          <p className="text-sm text-muted-foreground">Buy X Get Y, slab, percentage, fixed-amount, and rate-benefit purchase schemes.</p>
        </div>
        {editable && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Scheme</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
          ) : !schemes?.length ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No schemes yet.</TableCell></TableRow>
          ) : (
            schemes.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{SCHEME_TYPE_LABELS[s.scheme_type]}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.effective_from || "—"} → {s.effective_to || "—"}
                </TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[s.status]}>{s.status}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  {editable && <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>}
                  {editable && s.status !== "active" && s.status !== "archived" && (
                    <Button size="icon" variant="ghost" disabled={busyId === s.id} onClick={() => setStatus(s, "active")} title="Activate">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </Button>
                  )}
                  {editable && s.status !== "archived" && (
                    <Button size="icon" variant="ghost" disabled={busyId === s.id} onClick={() => setStatus(s, "archived")} title="Archive">
                      <ArchiveIcon className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Scheme" : "New Scheme"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='e.g. "10+1 August"' />
            </div>
            <div className="space-y-1.5">
              <Label>Scheme Type</Label>
              <Select value={form.scheme_type} onValueChange={(v) => setForm({ ...form, scheme_type: v as PurchaseSchemeType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCHEME_TYPE_LABELS) as PurchaseSchemeType[]).map((t) => (
                    <SelectItem key={t} value={t}>{SCHEME_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.scheme_type === "buy_x_get_y" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Buy Qty</Label><Input type="number" value={form.buy_qty} onChange={(e) => setForm({ ...form, buy_qty: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Get Qty Free</Label><Input type="number" value={form.get_qty} onChange={(e) => setForm({ ...form, get_qty: e.target.value })} /></div>
              </div>
            )}

            {form.scheme_type === "slab" && (
              <div className="space-y-2">
                <Label>Slab Breakpoints (paid qty → free qty)</Label>
                {form.breakpoints.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="number" placeholder="Min qty" value={b.min_qty} onChange={(e) => updateBreakpoint(i, { min_qty: e.target.value })} />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input type="number" placeholder="Free qty" value={b.free_qty} onChange={(e) => updateBreakpoint(i, { free_qty: e.target.value })} />
                    <Button size="sm" variant="ghost" onClick={() => removeBreakpoint(i)}>✕</Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addBreakpoint}>+ Add breakpoint</Button>
              </div>
            )}

            {form.scheme_type === "percentage" && (
              <div className="space-y-1.5"><Label>Benefit %</Label><Input type="number" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} /></div>
            )}
            {form.scheme_type === "fixed_amount" && (
              <div className="space-y-1.5"><Label>Fixed Benefit (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            )}
            {form.scheme_type === "rate_benefit" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Per Qty</Label><Input type="number" value={form.per_qty} onChange={(e) => setForm({ ...form, per_qty: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Benefit (₹)</Label><Input type="number" value={form.benefit_amount} onChange={(e) => setForm({ ...form, benefit_amount: e.target.value })} /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Effective From</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Effective Till</Label><Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              A purchase transaction snapshots the scheme's resolved values at save time — changing this scheme later never recalculates an already-saved PO/Invoice.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
