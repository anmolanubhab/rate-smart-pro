import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, can, type BusinessRole } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { ownerMinimumViolation } from "@/lib/companySafety";

const ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant", "operator", "salesman", "viewer"];

type Form = {
  full_name: string; username: string; email: string; mobile: string;
  role: BusinessRole; department: string; status: "active" | "inactive"; notes: string;
  user_id: string;
};

const empty: Form = {
  full_name: "", username: "", email: "", mobile: "",
  role: "viewer", department: "", status: "active", notes: "", user_id: "",
};

export default function CompanyUsers() {
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const canManage = can(role, "team.manage");

  useEffect(() => { document.title = "Company Users — RD Pro"; }, []);

  const list = useQuery({
    queryKey: ["company-users", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_users")
        .select("id, user_id, role, status, full_name, username, email, mobile, department, notes, created_at")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    if (!search.trim()) return all;
    const s = search.toLowerCase();
    return all.filter((r) =>
      [r.full_name, r.username, r.email, r.mobile, r.department, r.role]
        .filter(Boolean).some((v) => (v as string).toLowerCase().includes(s))
    );
  }, [list.data, search]);

  const startAdd = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const startEdit = (r: typeof rows[number]) => {
    setEditingId(r.id);
    setForm({
      full_name: r.full_name ?? "", username: r.username ?? "", email: r.email ?? "",
      mobile: r.mobile ?? "", role: r.role as BusinessRole, department: r.department ?? "",
      status: (r.status === "inactive" ? "inactive" : "active"),
      notes: r.notes ?? "", user_id: r.user_id,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!business) return;
    if (editingId) {
      // Owner-minimum guard: only relevant if this edit actually moves the
      // user OUT of "active owner" status (role change away from owner,
      // or status change away from active). A no-op or unrelated field
      // edit on the last owner must not be blocked.
      const original = list.data?.find((r) => r.id === editingId);
      const losesOwnerStatus = original && original.role === "owner" && original.status === "active"
        && (form.role !== "owner" || form.status !== "active");
      if (losesOwnerStatus) {
        const err = ownerMinimumViolation(list.data ?? [], editingId);
        if (err) { toast.error(err); return; }
      }
      const { error } = await supabase.from("business_users").update({
        full_name: form.full_name || null, username: form.username || null,
        email: form.email || null, mobile: form.mobile || null,
        role: form.role, department: form.department || null,
        status: form.status, notes: form.notes || null,
      }).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      await logAudit({ business_id: business.id, action: "USER_UPDATED", entity_type: "business_user", entity_id: editingId, new_value: form });
      toast.success("User updated");
    } else {
      if (!form.user_id.trim()) { toast.error("Auth User ID is required"); return; }
      const { data, error } = await supabase.from("business_users").insert({
        business_id: business.id,
        user_id: form.user_id.trim(),
        role: form.role,
        status: form.status,
        full_name: form.full_name || null, username: form.username || null,
        email: form.email || null, mobile: form.mobile || null,
        department: form.department || null, notes: form.notes || null,
      }).select("id").maybeSingle();
      if (error) { toast.error(error.message); return; }
      await logAudit({ business_id: business.id, action: "USER_ADDED", entity_type: "business_user", entity_id: data?.id, new_value: form });
      toast.success("User added");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["company-users"] });
  };

  const toggleStatus = async (id: string, current: string, role: string) => {
    const next = current === "active" ? "inactive" : "active";
    if (next === "inactive") {
      const err = ownerMinimumViolation(list.data ?? [], id);
      if (err) { toast.error(err); return; }
    }
    const { error } = await supabase.from("business_users").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: next === "inactive" ? "USER_DISABLED" : "USER_ENABLED", entity_type: "business_user", entity_id: id, new_value: { status: next, role } });
    qc.invalidateQueries({ queryKey: ["company-users"] });
  };

  const remove = async (id: string) => {
    const err = ownerMinimumViolation(list.data ?? [], id);
    if (err) { toast.error(err); return; }
    if (!confirm("Remove this user from the company?")) return;
    const { error } = await supabase.from("business_users").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "USER_REMOVED", entity_type: "business_user", entity_id: id });
    qc.invalidateQueries({ queryKey: ["company-users"] });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Settings</p>
          <h1 className="font-display text-3xl font-bold mt-1">Company Users</h1>
          <p className="text-sm text-muted-foreground mt-2">Manage users for <span className="font-medium">{business?.business_name}</span>. Your role: <span className="capitalize font-medium">{role ?? "—"}</span></p>
        </div>
        {canManage && <Button onClick={startAdd}><Plus className="h-4 w-4 mr-2" />Add User</Button>}
      </header>

      <div className="rounded-2xl border bg-card">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0,8)}…</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.username || "—"}</TableCell>
                  <TableCell className="text-sm">
                    <div>{r.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.mobile || ""}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.role}</Badge></TableCell>
                  <TableCell className="text-sm">{r.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
                        {/* Owner rows are editable/removable too — ownerMinimumViolation()
                            inside toggleStatus/remove/save blocks the action (with a toast)
                            only if this is the last active owner. */}
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.status, r.role)}>
                          {r.status === "active" ? "Disable" : "Enable"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>Remove</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit User" : "Add Company User"}</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            {!editingId && (
              <Field label="Auth User ID *" className="md:col-span-2">
                <Input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="UUID from Lovable Cloud auth user" />
                <p className="text-xs text-muted-foreground mt-1">Email invitations aren't wired yet — enter the existing auth UUID.</p>
              </Field>
            )}
            <Field label="Full Name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Username"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="Role">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as BusinessRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Status" className="md:col-span-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <span className="text-sm">{form.status === "active" ? "Active" : "Inactive"}</span>
                <Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })} />
              </div>
            </Field>
            <Field label="Notes" className="md:col-span-2">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editingId ? "Save changes" : "Add user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);