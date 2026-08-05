// src/pages/gst/HsnMaster.tsx
// Route: /gst/hsn-master
//
// The Tax Profile master: HSN/SAC code, description, Goods/Service type,
// default UQC, status, remarks, plus an effective-dated GST rate history
// (so a national rate change never rewrites an old invoice's snapshot, but a
// backdated correction can still pick the rate actually in force then).
// Shared reference data across all businesses — not business-scoped.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Search, Barcode } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { hasRole } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  fetchHsnList, fetchHsnDetail, createHsn, updateHsnProfile, addRate,
  type HsnMasterListItem, type HsnMasterDetail, type GstRateRow,
} from "@/lib/hsnMaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const WRITER_ROLES = ["owner", "admin", "manager", "accountant"] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);

type ProfileForm = {
  hsn_code: string;
  description: string;
  default_uqc: string;
  is_service: boolean;
  status: "active" | "inactive";
  remarks: string;
  rate: string;
  cess_rate: string;
  effective_from: string;
};

const blankForm = (): ProfileForm => ({
  hsn_code: "",
  description: "",
  default_uqc: "",
  is_service: false,
  status: "active",
  remarks: "",
  rate: "",
  cess_rate: "0",
  effective_from: todayIso(),
});

export default function HsnMaster() {
  const { user } = useAuth();
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const editable = hasRole(role, WRITER_ROLES as unknown as any[]);

  useEffect(() => { document.title = "HSN Master — RD Pro"; }, []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "goods" | "service">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(blankForm());
  const [rateHistory, setRateHistory] = useState<GstRateRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [newRate, setNewRate] = useState({ rate: "", cess_rate: "0", effective_from: todayIso() });
  const [addingRate, setAddingRate] = useState(false);

  const list = useQuery({
    queryKey: ["hsn-master-list"],
    queryFn: fetchHsnList,
  });

  const rows = list.data ?? [];
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter === "goods" && r.is_service) return false;
      if (typeFilter === "service" && !r.is_service) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        if (!r.hsn_code.toLowerCase().includes(s) && !(r.description ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const openNew = () => {
    setEditingCode(null);
    setForm(blankForm());
    setRateHistory([]);
    setDialogOpen(true);
  };

  const openEdit = async (row: HsnMasterListItem) => {
    setEditingCode(row.hsn_code);
    setForm({
      hsn_code: row.hsn_code,
      description: row.description ?? "",
      default_uqc: row.default_uqc ?? "",
      is_service: row.is_service,
      status: row.status,
      remarks: row.remarks ?? "",
      rate: "",
      cess_rate: "0",
      effective_from: todayIso(),
    });
    setRateHistory([]);
    setDialogOpen(true);
    const detail: HsnMasterDetail | null = await fetchHsnDetail(row.hsn_code);
    if (detail) setRateHistory(detail.rates);
  };

  const save = async () => {
    const code = form.hsn_code.trim();
    if (!code || !/^\d{4,8}$/.test(code)) {
      toast.error("HSN/SAC code must be 4, 6, or 8 digits");
      return;
    }
    setSaving(true);
    try {
      if (editingCode) {
        await updateHsnProfile(editingCode, {
          description: form.description.trim() || null,
          default_uqc: form.default_uqc.trim() || null,
          is_service: form.is_service,
          status: form.status,
          remarks: form.remarks.trim() || null,
        });
        await logAudit({ business_id: business?.id ?? null, action: "HSN_MASTER_UPDATE", entity_type: "hsn_master", entity_id: editingCode });
        toast.success("HSN updated");
      } else {
        const rate = Number(form.rate);
        if (form.rate === "" || Number.isNaN(rate) || rate < 0) {
          toast.error("Enter a valid GST rate");
          setSaving(false);
          return;
        }
        await createHsn({
          hsn_code: code,
          description: form.description.trim() || null,
          default_uqc: form.default_uqc.trim() || null,
          is_service: form.is_service,
          status: form.status,
          remarks: form.remarks.trim() || null,
          rate,
          cess_rate: Number(form.cess_rate) || 0,
          effective_from: form.effective_from,
        });
        await logAudit({ business_id: business?.id ?? null, action: "HSN_MASTER_CREATE", entity_type: "hsn_master", entity_id: code });
        toast.success("HSN created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["hsn-master-list"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save HSN");
    } finally {
      setSaving(false);
    }
  };

  const submitNewRate = async () => {
    if (!editingCode) return;
    const rate = Number(newRate.rate);
    if (newRate.rate === "" || Number.isNaN(rate) || rate < 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setAddingRate(true);
    try {
      await addRate(editingCode, rate, Number(newRate.cess_rate) || 0, newRate.effective_from);
      await logAudit({ business_id: business?.id ?? null, action: "HSN_RATE_ADD", entity_type: "hsn_master", entity_id: editingCode, new_value: { rate, effective_from: newRate.effective_from } });
      const detail = await fetchHsnDetail(editingCode);
      if (detail) setRateHistory(detail.rates);
      setNewRate({ rate: "", cess_rate: "0", effective_from: todayIso() });
      qc.invalidateQueries({ queryKey: ["hsn-master-list"] });
      toast.success("Rate added");
    } catch (e: any) {
      toast.error(e.message ?? "Could not add rate");
    } finally {
      setAddingRate(false);
    }
  };

  const toggleActive = async (row: HsnMasterListItem) => {
    try {
      await updateHsnProfile(row.hsn_code, {
        description: row.description,
        default_uqc: row.default_uqc,
        is_service: row.is_service,
        status: row.status === "active" ? "inactive" : "active",
        remarks: row.remarks,
      });
      await logAudit({ business_id: business?.id ?? null, action: "HSN_MASTER_UPDATE", entity_type: "hsn_master", entity_id: row.hsn_code, new_value: { status: row.status === "active" ? "inactive" : "active" } });
      qc.invalidateQueries({ queryKey: ["hsn-master-list"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update status");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">GST &amp; Compliance</p>
          <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
            <Barcode className="h-7 w-7 text-muted-foreground" /> HSN Master
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            One HSN/SAC list used everywhere — Product Master, Sales &amp; Purchase Invoices, and GST reports.
            Rate changes are effective-dated, so old invoices keep the rate that was in force when they were made.
          </p>
        </div>
        {editable && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New HSN</Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by HSN code or description…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="goods">Goods</SelectItem>
            <SelectItem value="service">Service</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead>HSN/SAC</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>UQC</TableHead>
                <TableHead>GST Rate</TableHead>
                <TableHead>Cess</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No HSN entries found</TableCell></TableRow>
              ) : filtered.map((row) => (
                <TableRow key={row.hsn_code}>
                  <TableCell className="font-mono text-xs">{row.hsn_code}</TableCell>
                  <TableCell>{row.description || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{row.is_service ? "Service" : "Goods"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.default_uqc || "—"}</TableCell>
                  <TableCell>{row.current_rate != null ? <Badge variant="secondary">{row.current_rate}%</Badge> : <span className="text-muted-foreground text-xs">Not set</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.current_cess_rate ? `${row.current_cess_rate}%` : "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.status === "active" ? "default" : "outline"}
                      className={editable ? "cursor-pointer" : undefined}
                      onClick={editable ? () => toggleActive(row) : undefined}
                    >
                      {row.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCode ? `Edit HSN ${editingCode}` : "New HSN"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>HSN/SAC Code <span className="text-destructive">*</span></Label>
                <Input
                  value={form.hsn_code}
                  disabled={!!editingCode}
                  placeholder="e.g. 84212300"
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.is_service ? "service" : "goods"} onValueChange={(v) => setForm({ ...form, is_service: v === "service" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">Goods</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Oil Filter" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Default UQC</Label>
                <Input value={form.default_uqc} onChange={(e) => setForm({ ...form, default_uqc: e.target.value.toUpperCase() })} placeholder="e.g. PCS, NOS, KG, LTR" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>

            {!editingCode ? (
              <div className="grid grid-cols-3 gap-4 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label>GST Rate (%) <span className="text-destructive">*</span></Label>
                  <Input type="number" step="any" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cess (%)</Label>
                  <Input type="number" step="any" value={form.cess_rate} onChange={(e) => setForm({ ...form, cess_rate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Effective From</Label>
                  <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-sm">Rate History</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Rate</TableHead>
                      <TableHead className="h-8">Cess</TableHead>
                      <TableHead className="h-8">Effective From</TableHead>
                      <TableHead className="h-8">Effective To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateHistory.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-3">No rate history yet</TableCell></TableRow>
                    ) : rateHistory.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.rate}%</TableCell>
                        <TableCell>{r.cess_rate}%</TableCell>
                        <TableCell className="text-xs">{r.effective_from}</TableCell>
                        <TableCell className="text-xs">{r.effective_to ?? <span className="text-muted-foreground">Ongoing</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {editable && (
                  <div className="grid grid-cols-4 gap-2 items-end pt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">New Rate (%)</Label>
                      <Input type="number" step="any" value={newRate.rate} onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cess (%)</Label>
                      <Input type="number" step="any" value={newRate.cess_rate} onChange={(e) => setNewRate({ ...newRate, cess_rate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Effective From</Label>
                      <Input type="date" value={newRate.effective_from} onChange={(e) => setNewRate({ ...newRate, effective_from: e.target.value })} />
                    </div>
                    <Button variant="outline" onClick={submitNewRate} disabled={addingRate}>{addingRate ? "Adding…" : "Add Rate"}</Button>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            {editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
