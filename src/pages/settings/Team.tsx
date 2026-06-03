import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, can, type BusinessRole } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { logAudit } from "@/lib/audit";

const ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant", "operator", "viewer"];

const MATRIX: Array<{ key: string; label: string }> = [
  { key: "business.edit", label: "Edit business profile" },
  { key: "team.manage", label: "Manage team & roles" },
  { key: "voucher.create", label: "Create vouchers" },
  { key: "voucher.edit", label: "Edit vouchers" },
  { key: "voucher.delete", label: "Delete vouchers" },
  { key: "voucher.cancel", label: "Cancel vouchers" },
  { key: "settings.edit", label: "Edit settings" },
  { key: "audit.view", label: "View audit logs" },
  { key: "data.import", label: "Import data" },
  { key: "data.export", label: "Export data" },
];

export default function Team() {
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<BusinessRole>("viewer");

  useEffect(() => { document.title = "Team & Roles — RD Pro"; }, []);

  const members = useQuery({
    queryKey: ["business-members", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_users")
        .select("id, user_id, role, created_at")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const canManage = can(role, "team.manage");

  const addMember = async () => {
    if (!business || !inviteUserId.trim()) { toast.error("Enter a user ID"); return; }
    const { error } = await supabase.from("business_users").insert({
      business_id: business.id,
      user_id: inviteUserId.trim(),
      role: inviteRole,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business.id, action: "TEAM_ADD", entity_type: "business_member", new_value: { user_id: inviteUserId, role: inviteRole } });
    toast.success("Member added");
    setInviteUserId("");
    qc.invalidateQueries({ queryKey: ["business-members"] });
  };

  const changeRole = async (id: string, newRole: BusinessRole) => {
    const { error } = await supabase.from("business_users").update({ role: newRole }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "TEAM_ROLE_CHANGE", entity_type: "business_member", entity_id: id, new_value: { role: newRole } });
    qc.invalidateQueries({ queryKey: ["business-members"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this member?")) return;
    const { error } = await supabase.from("business_users").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "TEAM_REMOVE", entity_type: "business_member", entity_id: id });
    qc.invalidateQueries({ queryKey: ["business-members"] });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Team & Roles</h1>
        <p className="text-sm text-muted-foreground mt-2">Your role: <span className="font-medium">{role ?? "—"}</span></p>
      </header>

      {canManage && (
        <section className="rounded-2xl bg-card border p-6 space-y-3">
          <h2 className="font-semibold">Add member by user ID</h2>
          <p className="text-xs text-muted-foreground">
            Invitations by email aren't wired yet. Enter the auth user ID of an existing RD Pro user.
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <Input placeholder="auth user UUID" value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as BusinessRole)}>
              <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={addMember}>Add</Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-card border p-6">
        <h2 className="font-semibold mb-4">Members</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead><TableHead>Role</TableHead><TableHead>Added</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members.data ?? []).map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.user_id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as BusinessRole)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : m.role}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {canManage && m.role !== "owner" && (
                      <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>Remove</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-6">
        <h2 className="font-semibold mb-4">Permission Matrix</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {ROLES.map(r => <TableHead key={r} className="capitalize text-center">{r}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell className="text-sm">{label}</TableCell>
                  {ROLES.map(r => (
                    <TableCell key={r} className="text-center">
                      {can(r, key) ? <span className="text-emerald-500">✓</span> : <span className="text-muted-foreground/40">·</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

const _Label = Label;
