import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Copy, Ban } from "lucide-react";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchSalesmanPortalAccess, inviteSalesmanToPortal, revokeSalesmanInvitation,
  salesmanInvitationLink, type SalesmanPortalAccess,
} from "@/lib/salesmanPortalAccess";

type SalesmanGroupLite = { id: string; name: string };

type Salesman = {
  id: string;
  salesman_group_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  employee_code: string | null;
  is_active: boolean;
};

const emptyForm = {
  name: "", phone: "", email: "", employee_code: "",
  salesman_group_id: "" as string, is_active: true,
};

export default function Salesmen() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Salesman | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = "Salesmen — RD Pro"; }, []);

  const { data: groups = [] } = useQuery({
    queryKey: ["salesman-groups", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salesman_groups" as never)
        .select("id, name")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data as unknown as SalesmanGroupLite[]) ?? [];
    },
  });

  const { data: salesmen = [], isLoading } = useQuery({
    queryKey: ["salesmen", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salesmen" as never)
        .select("*")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data as unknown as Salesman[]) ?? [];
    },
  });

  const { data: portalAccess = {}, isLoading: portalLoading } = useQuery({
    queryKey: ["salesman-portal-access", business?.id],
    enabled: !!business,
    queryFn: () => fetchSalesmanPortalAccess(business!.id),
  });

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "—";

  const [accessDialog, setAccessDialog] = useState<Salesman | null>(null);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const openGrantAccess = (s: Salesman) => {
    setAccessDialog(s);
    setAccessEmail(s.email ?? "");
    setInviteLink(null);
  };

  const submitGrantAccess = async () => {
    if (!accessDialog || !accessEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setAccessSubmitting(true);
    try {
      const result = await inviteSalesmanToPortal(accessDialog.id, accessEmail);
      if (result.outcome === "access_granted") {
        toast.success(`${accessDialog.name} now has portal access`);
        setAccessDialog(null);
      } else if (result.token) {
        setInviteLink(salesmanInvitationLink(result.token));
        toast.success("Invitation created — share the link below");
      }
      qc.invalidateQueries({ queryKey: ["salesman-portal-access", business!.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not grant portal access");
    } finally {
      setAccessSubmitting(false);
    }
  };

  const handleRevoke = async (access: SalesmanPortalAccess) => {
    if (!access.invitation_id) return;
    try {
      await revokeSalesmanInvitation(access.invitation_id);
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["salesman-portal-access", business!.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not revoke invitation");
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Salesman) => {
    setEditing(s);
    setForm({
      name: s.name, phone: s.phone ?? "", email: s.email ?? "",
      employee_code: s.employee_code ?? "", salesman_group_id: s.salesman_group_id ?? "",
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!business || !form.name.trim()) {
      toast.error("Salesman name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        salesman_group_id: form.salesman_group_id || null,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        employee_code: form.employee_code.trim() || null,
        is_active: form.is_active,
      };

      if (editing) {
        const { error } = await supabase.from("salesmen" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
        toast.success("Salesman updated");
      } else {
        const { error } = await supabase.from("salesmen" as never).insert(payload as never);
        if (error) throw error;
        toast.success("Salesman created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["salesmen", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save salesman");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salesmen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign each salesman to a group, then assign salesmen to parties from the
            Party master — new invoices pick up the assignment automatically.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Salesman</Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Employee Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Portal Access</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : salesmen.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No salesmen yet.</TableCell></TableRow>
            ) : (
              salesmen.map((s) => {
                const access = portalAccess[s.id];
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{groupName(s.salesman_group_id)}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.email ?? "—"}</TableCell>
                    <TableCell>{s.employee_code ?? "—"}</TableCell>
                    <TableCell>
                      {s.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell>
                      {portalLoading ? (
                        <span className="text-xs text-muted-foreground">…</span>
                      ) : access?.status === "active" ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                      ) : access?.status === "invited" ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary">Invited</Badge>
                          <Button size="icon" variant="ghost" className="h-6 w-6" title="Revoke invitation" onClick={() => handleRevoke(access)}>
                            <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openGrantAccess(s)}>
                          <KeyRound className="h-3.5 w-3.5 mr-1" /> Grant Access
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New Salesman"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Salesman Group</Label>
              <Select value={form.salesman_group_id || "none"} onValueChange={(v) => setForm({ ...form, salesman_group_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Employee Code</Label>
                <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label className="font-normal">Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Salesman"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!accessDialog} onOpenChange={(open) => { if (!open) setAccessDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Portal Access — {accessDialog?.name}</DialogTitle>
          </DialogHeader>
          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link with {accessDialog?.name} so they can create their Salesman Portal login.
                It expires in 7 days.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This creates a Salesman Portal login scoped to exactly this salesman — separate from any ERP account.
              </p>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessDialog(null)}>
              {inviteLink ? "Done" : "Cancel"}
            </Button>
            {!inviteLink && (
              <Button onClick={submitGrantAccess} disabled={accessSubmitting}>
                {accessSubmitting ? "Sending…" : "Grant Access"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
