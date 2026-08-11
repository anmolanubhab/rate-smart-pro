import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import {
  getStaffDetail, updateStaffProfile, assignRole, removeRole,
  deactivateStaff, reactivateStaff, listStaffActivity, type PlatformStaffRow,
} from "@/lib/platformStaff";
import { listRoles, type PlatformRoleRow } from "@/lib/platformRoles";
import { listDepartments, type PlatformDepartmentRow } from "@/lib/platformOrg";

export default function PlatformStaffDetail() {
  useEffect(() => { document.title = "RD-Pro Control Center — Staff Detail"; }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePlatformAuth();

  const [staff, setStaff] = useState<PlatformStaffRow | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string; level: number }[]>([]);
  const [allRoles, setAllRoles] = useState<PlatformRoleRow[]>([]);
  const [departments, setDepartments] = useState<PlatformDepartmentRow[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  const [addRoleId, setAddRoleId] = useState("");
  const [busy, setBusy] = useState(false);

  const canManage = hasPermission("staff.manage");

  const load = async () => {
    if (!id) return;
    const [detail, ar, depts, act] = await Promise.all([
      getStaffDetail(id), listRoles(), listDepartments(), listStaffActivity(id),
    ]);
    setStaff(detail.staff);
    setRoles(detail.roles);
    setAllRoles(ar);
    setDepartments(depts);
    setActivity(act);
  };

  useEffect(() => { load().catch((e) => toast.error(e.message ?? "Failed to load")); }, [id]);

  if (!staff) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const saveField = async (patch: Partial<PlatformStaffRow>) => {
    if (!id) return;
    try {
      await updateStaffProfile(id, patch);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleAddRole = async () => {
    if (!id || !addRoleId) return;
    setBusy(true);
    try {
      await assignRole(id, addRoleId);
      setAddRoleId("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "You don't have the authority to grant this role.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!id) return;
    try {
      await removeRole(id, roleId);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove role");
    }
  };

  const toggleStatus = async () => {
    if (!id) return;
    try {
      if (staff.status === "active") await deactivateStaff(id);
      else await reactivateStaff(id);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const assignableRoles = allRoles.filter((r) => !roles.some((rr) => rr.id === r.id));

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/platform/staff")}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Staff
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{staff.full_name ?? staff.email}</h1>
          <p className="text-sm text-muted-foreground">{staff.email}</p>
        </div>
        {canManage && (
          <Button variant={staff.status === "active" ? "destructive" : "default"} onClick={toggleStatus}>
            {staff.status === "active" ? <><Ban className="h-4 w-4 mr-1.5" /> Deactivate</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Reactivate</>}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input defaultValue={staff.designation ?? ""} disabled={!canManage}
                onBlur={(e) => e.target.value !== (staff.designation ?? "") && saveField({ designation: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input defaultValue={staff.phone ?? ""} disabled={!canManage}
                onBlur={(e) => e.target.value !== (staff.phone ?? "") && saveField({ phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={staff.department_id ?? ""} onValueChange={(v) => saveField({ department_id: v || null })} disabled={!canManage}>
                <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div><Badge variant={staff.status === "active" ? "default" : "destructive"}>{staff.status}</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Roles</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {roles.length === 0 && <span className="text-sm text-muted-foreground">No roles assigned.</span>}
              {roles.map((r) => (
                <Badge key={r.id} variant="secondary" className="gap-1">
                  {r.name} (level {r.level})
                  {canManage && (
                    <button onClick={() => handleRemoveRole(r.id)} className="ml-1"><X className="h-3 w-3" /></button>
                  )}
                </Badge>
              ))}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Select value={addRoleId} onValueChange={setAddRoleId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Add a role…" /></SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} (level {r.level})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleAddRole} disabled={!addRoleId || busy}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can only grant a role if you already hold every permission it grants, and its level does not exceed your own.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {activity.length === 0 && <p className="text-sm text-muted-foreground">No recorded activity yet.</p>}
          <ul className="space-y-2">
            {activity.map((a, i) => (
              <li key={i} className="text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{String(a.action)}</span>
                <span className="text-muted-foreground ml-2">{new Date(String(a.created_at)).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
