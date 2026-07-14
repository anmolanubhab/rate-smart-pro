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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Clock, X } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { ownerMinimumViolation } from "@/lib/companySafety";

// "operator" kept for backward compatibility with any existing rows /
// integrations, but no longer offered in the picker — replaced by the
// more specific "purchase" and "store_manager" roles.
const ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant", "salesman", "purchase", "store_manager", "viewer"];
const ROLE_LABELS: Record<BusinessRole, string> = {
  owner: "Owner", admin: "Admin", manager: "Manager", accountant: "Accountant",
  operator: "Operator", salesman: "Sales", purchase: "Purchase", store_manager: "Store", viewer: "Viewer",
};

type MemberForm = {
  full_name: string; username: string; email: string; mobile: string;
  role: BusinessRole; department: string; status: "active" | "inactive"; notes: string;
};
const emptyMember: MemberForm = {
  full_name: "", username: "", email: "", mobile: "",
  role: "viewer", department: "", status: "active", notes: "",
};

type AddForm = {
  email: string; mobile: string; role: BusinessRole; department: string; notes: string;
};
const emptyAdd: AddForm = { email: "", mobile: "", role: "viewer", department: "", notes: "" };

export default function CompanyUsers() {
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMember);
  const [addForm, setAddForm] = useState<AddForm>(emptyAdd);
  const [adding, setAdding] = useState(false);
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

  const invites = useQuery({
    queryKey: ["company-user-invitations", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_user_invitations" as never)
        .select("id, email, mobile, role, department, notes, status, invited_at")
        .eq("business_id", business!.id)
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filterBy = (items: any[], fields: string[]) => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((r) => fields.some((f) => (r[f] as string | null)?.toLowerCase().includes(s)));
  };

  const activeRows = useMemo(
    () => filterBy((list.data ?? []).filter((r) => r.status === "active"), ["full_name", "username", "email", "mobile", "department", "role"]),
    [list.data, search]
  );
  const disabledRows = useMemo(
    () => filterBy((list.data ?? []).filter((r) => r.status === "inactive"), ["full_name", "username", "email", "mobile", "department", "role"]),
    [list.data, search]
  );
  const pendingRows = useMemo(
    () => filterBy((invites.data ?? []).filter((r) => r.status === "pending"), ["email", "mobile", "department", "role"]),
    [invites.data, search]
  );

  // ── Add (email/mobile → auto-match or invite) ──
  const startAdd = () => { setAddForm(emptyAdd); setAddOpen(true); };

  const submitAdd = async () => {
    if (!business) return;
    if (!addForm.email.trim() && !addForm.mobile.trim()) {
      toast.error("Enter an email or mobile number");
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("add_business_user_by_contact" as never, {
        _business_id: business.id,
        _email: addForm.email.trim() || null,
        _mobile: addForm.mobile.trim() || null,
        _role: addForm.role,
        _department: addForm.department.trim() || null,
        _notes: addForm.notes.trim() || null,
      } as never);
      if (error) throw error;

      const result = data as { outcome: "member_added" | "invited"; membership_id?: string; invitation_id?: string };
      if (result.outcome === "member_added") {
        await logAudit({ business_id: business.id, action: "USER_ADDED", entity_type: "business_user", entity_id: result.membership_id, new_value: addForm });
        toast.success("User found and added to the company");
        qc.invalidateQueries({ queryKey: ["company-users", business.id] });
      } else {
        await logAudit({ business_id: business.id, action: "USER_INVITED", entity_type: "business_user_invitation", entity_id: result.invitation_id, new_value: addForm });
        toast.success("No matching account yet — invitation created (pending)");
        qc.invalidateQueries({ queryKey: ["company-user-invitations", business.id] });
      }
      setAddOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add user");
    } finally {
      setAdding(false);
    }
  };

  const revokeInvite = async (id: string) => {
    if (!business) return;
    if (!confirm("Revoke this invitation?")) return;
    const { error } = await supabase.rpc("revoke_invitation" as never, { _invitation_id: id } as never);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business.id, action: "USER_INVITE_REVOKED", entity_type: "business_user_invitation", entity_id: id });
    qc.invalidateQueries({ queryKey: ["company-user-invitations", business.id] });
    toast.success("Invitation revoked");
  };

  // ── Edit existing membership (role/status/details — no user lookup) ──
  const startEdit = (r: (typeof activeRows)[number]) => {
    setEditingId(r.id);
    setMemberForm({
      full_name: r.full_name ?? "", username: r.username ?? "", email: r.email ?? "",
      mobile: r.mobile ?? "", role: r.role as BusinessRole, department: r.department ?? "",
      status: (r.status === "inactive" ? "inactive" : "active"),
      notes: r.notes ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!business || !editingId) return;
    const original = list.data?.find((r) => r.id === editingId);
    const losesOwnerStatus = original && original.role === "owner" && original.status === "active"
      && (memberForm.role !== "owner" || memberForm.status !== "active");
    if (losesOwnerStatus) {
      const err = ownerMinimumViolation(list.data ?? [], editingId);
      if (err) { toast.error(err); return; }
    }
    const { error } = await supabase.from("business_users").update({
      full_name: memberForm.full_name || null, username: memberForm.username || null,
      email: memberForm.email || null, mobile: memberForm.mobile || null,
      role: memberForm.role, department: memberForm.department || null,
      status: memberForm.status, notes: memberForm.notes || null,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business.id, action: "USER_UPDATED", entity_type: "business_user", entity_id: editingId, new_value: memberForm });
    toast.success("User updated");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["company-users", business.id] });
  };

  const toggleStatus = async (id: string, current: string, roleVal: string) => {
    const next = current === "active" ? "inactive" : "active";
    if (next === "inactive") {
      const err = ownerMinimumViolation(list.data ?? [], id);
      if (err) { toast.error(err); return; }
    }
    const { error } = await supabase.from("business_users").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: next === "inactive" ? "USER_DISABLED" : "USER_ENABLED", entity_type: "business_user", entity_id: id, new_value: { status: next, role: roleVal } });
    qc.invalidateQueries({ queryKey: ["company-users", business?.id] });
  };

  // Per the spec: never delete a user's account -- this only removes
  // their membership in THIS company. The person and their auth account
  // are untouched, and they keep membership in any other company.
  const removeMembership = async (id: string) => {
    const err = ownerMinimumViolation(list.data ?? [], id);
    if (err) { toast.error(err); return; }
    if (!confirm("Remove this user's membership from this company? (Their account itself is not deleted, and any access to other companies is unaffected.)")) return;
    const { error } = await supabase.from("business_users").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "USER_REMOVED", entity_type: "business_user", entity_id: id });
    qc.invalidateQueries({ queryKey: ["company-users", business?.id] });
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

        <Tabs defaultValue="active" className="w-full">
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="active">Active Users ({activeRows.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending Invitations ({pendingRows.length})</TabsTrigger>
              <TabsTrigger value="disabled">Disabled Users ({disabledRows.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active" className="mt-0">
            <MembersTable rows={activeRows} canManage={canManage} onEdit={startEdit} onToggle={toggleStatus} onRemove={removeMembership} disableAction="Disable" />
          </TabsContent>

          <TabsContent value="disabled" className="mt-0">
            <MembersTable rows={disabledRows} canManage={canManage} onEdit={startEdit} onToggle={toggleStatus} onRemove={removeMembership} disableAction="Enable" />
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        <div>{r.email || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.mobile || ""}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{ROLE_LABELS[r.role as BusinessRole] ?? r.role}</Badge></TableCell>
                      <TableCell className="text-sm">{r.department || "—"}</TableCell>
                      <TableCell className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {new Date(r.invited_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeInvite(r.id)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No pending invitations</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add user — email/mobile only, no manual UUID */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Company User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter an email or mobile number. If they already have an account, they're added
              immediately. If not, a pending invitation is created.
            </p>
            <Field label="Email">
              <Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="name@example.com" />
            </Field>
            <Field label="Mobile">
              <Input value={addForm.mobile} onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })} placeholder="+91…" />
            </Field>
            <Field label="Role">
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v as BusinessRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Department"><Input value={addForm.department} onChange={(e) => setAddForm({ ...addForm, department: e.target.value })} /></Field>
            <Field label="Notes">
              <Textarea rows={2} value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button onClick={submitAdd} disabled={adding}>{adding ? "Adding…" : "Add user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit existing membership */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full Name"><Input value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} /></Field>
            <Field label="Username"><Input value={memberForm.username} onChange={(e) => setMemberForm({ ...memberForm, username: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={memberForm.mobile} onChange={(e) => setMemberForm({ ...memberForm, mobile: e.target.value })} /></Field>
            <Field label="Role">
              <Select value={memberForm.role} onValueChange={(v) => setMemberForm({ ...memberForm, role: v as BusinessRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Department"><Input value={memberForm.department} onChange={(e) => setMemberForm({ ...memberForm, department: e.target.value })} /></Field>
            <Field label="Status" className="md:col-span-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <span className="text-sm">{memberForm.status === "active" ? "Active" : "Inactive"}</span>
                <Switch checked={memberForm.status === "active"} onCheckedChange={(v) => setMemberForm({ ...memberForm, status: v ? "active" : "inactive" })} />
              </div>
            </Field>
            <Field label="Notes" className="md:col-span-2">
              <Textarea rows={2} value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MembersTable({
  rows, canManage, onEdit, onToggle, onRemove, disableAction,
}: {
  rows: any[]; canManage: boolean;
  onEdit: (r: any) => void; onToggle: (id: string, status: string, role: string) => void;
  onRemove: (id: string) => void; disableAction: "Disable" | "Enable";
}) {
  return (
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
              </TableCell>
              <TableCell className="text-sm">{r.username || "—"}</TableCell>
              <TableCell className="text-sm">
                <div>{r.email || "—"}</div>
                <div className="text-xs text-muted-foreground">{r.mobile || ""}</div>
              </TableCell>
              <TableCell><Badge variant="outline">{ROLE_LABELS[r.role as BusinessRole] ?? r.role}</Badge></TableCell>
              <TableCell className="text-sm">{r.department || "—"}</TableCell>
              <TableCell>
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right space-x-1">
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => onToggle(r.id, r.status, r.role)}>
                      {disableAction}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRemove(r.id)}>Remove</Button>
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
  );
}

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);
