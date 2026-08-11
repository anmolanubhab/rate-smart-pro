import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { getOrgTree, createDepartment, createTeam, type OrgTree } from "@/lib/platformOrg";

export default function PlatformOrganization() {
  useEffect(() => { document.title = "RD-Pro Control Center — Organization"; }, []);
  const { hasPermission } = usePlatformAuth();

  const [tree, setTree] = useState<OrgTree | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [teamForm, setTeamForm] = useState({ name: "", department_id: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setTree(await getOrgTree());
  };

  useEffect(() => { load().catch((e) => toast.error(e.message ?? "Failed to load organization")); }, []);

  const submitDept = async () => {
    if (!deptForm.name) return;
    setBusy(true);
    try {
      await createDepartment(deptForm);
      setDeptOpen(false);
      setDeptForm({ name: "", description: "" });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create department");
    } finally {
      setBusy(false);
    }
  };

  const submitTeam = async () => {
    if (!teamForm.name) return;
    setBusy(true);
    try {
      await createTeam({ name: teamForm.name, department_id: teamForm.department_id || null });
      setTeamOpen(false);
      setTeamForm({ name: "", department_id: "" });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setBusy(false);
    }
  };

  if (!tree) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const canManageDept = hasPermission("department.manage");
  const canManageTeam = hasPermission("team.manage");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Organization</h1>
          <p className="text-sm text-muted-foreground">Departments, teams, and staff — generated live from current relationships.</p>
        </div>
        <div className="flex gap-2">
          {canManageTeam && <Button variant="outline" onClick={() => setTeamOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Team</Button>}
          {canManageDept && <Button onClick={() => setDeptOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Department</Button>}
        </div>
      </div>

      <div className="space-y-4">
        {tree.departments.length === 0 && (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        )}
        {tree.departments.map((dept) => (
          <Card key={dept.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> {dept.name}
                <Badge variant="outline">{dept.teams.reduce((n, t) => n + t.staff.length, 0) + dept.staff.length} people</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dept.teams.map((team) => (
                <div key={team.id} className="pl-4 border-l-2">
                  <div className="text-sm font-medium flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5" /> {team.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {team.staff.length === 0 && <span className="text-xs text-muted-foreground">No members.</span>}
                    {team.staff.map((s) => <Badge key={s.id} variant="secondary">{s.full_name ?? s.email}</Badge>)}
                  </div>
                </div>
              ))}
              {dept.staff.length > 0 && (
                <div className="pl-4 border-l-2">
                  <div className="text-sm font-medium mb-1 text-muted-foreground">Unassigned to a team</div>
                  <div className="flex flex-wrap gap-1.5">
                    {dept.staff.map((s) => <Badge key={s.id} variant="secondary">{s.full_name ?? s.email}</Badge>)}
                  </div>
                </div>
              )}
              {dept.teams.length === 0 && dept.staff.length === 0 && (
                <p className="text-xs text-muted-foreground">No teams or staff in this department yet.</p>
              )}
            </CardContent>
          </Card>
        ))}

        {tree.unassigned.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base text-muted-foreground">Unassigned Staff</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {tree.unassigned.map((s) => <Badge key={s.id} variant="outline">{s.full_name ?? s.email}</Badge>)}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Department</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptOpen(false)}>Cancel</Button>
            <Button onClick={submitDept} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Team</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={teamForm.department_id} onValueChange={(v) => setTeamForm({ ...teamForm, department_id: v })}>
                <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
                <SelectContent>
                  {tree.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamOpen(false)}>Cancel</Button>
            <Button onClick={submitTeam} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
