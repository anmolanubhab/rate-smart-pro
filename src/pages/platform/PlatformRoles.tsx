import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import {
  listRoles, listPermissionCatalog, listRolePermissionIds, createRole, updateRole,
  duplicateRole, assignPermissionToRole, removePermissionFromRole, listStaffForRole,
  type PlatformRoleRow, type PlatformPermissionRow,
} from "@/lib/platformRoles";

export default function PlatformRoles() {
  useEffect(() => { document.title = "RD-Pro Control Center — Roles & Permissions"; }, []);
  const { hasPermission, permissions: myPermissions } = usePlatformAuth();
  const canManage = hasPermission("role.manage");

  const [roles, setRoles] = useState<PlatformRoleRow[]>([]);
  const [catalog, setCatalog] = useState<PlatformPermissionRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<PlatformRoleRow | null>(null);
  const [rolePermIds, setRolePermIds] = useState<Set<string>>(new Set());
  const [staffCount, setStaffCount] = useState(0);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "", level: 10 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, p] = await Promise.all([listRoles(), listPermissionCatalog()]);
    setRoles(r);
    setCatalog(p);
    if (r.length && !selectedRole) selectRole(r[0]);
  };

  useEffect(() => { load().catch((e) => toast.error(e.message ?? "Failed to load roles")); }, []);

  const selectRole = async (role: PlatformRoleRow) => {
    setSelectedRole(role);
    const [ids, staff] = await Promise.all([listRolePermissionIds(role.id), listStaffForRole(role.id)]);
    setRolePermIds(new Set(ids));
    setStaffCount(staff.length);
  };

  const grouped = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = s ? catalog.filter((p) => p.key.toLowerCase().includes(s) || p.resource.toLowerCase().includes(s)) : catalog;
    const map = new Map<string, PlatformPermissionRow[]>();
    for (const p of filtered) {
      if (!map.has(p.resource)) map.set(p.resource, []);
      map.get(p.resource)!.push(p);
    }
    return map;
  }, [catalog, search]);

  const togglePermission = async (perm: PlatformPermissionRow, checked: boolean) => {
    if (!selectedRole) return;
    if (checked && !myPermissions.includes(perm.key)) {
      toast.error(`You cannot grant "${perm.key}" — you don't hold it yourself.`);
      return;
    }
    try {
      if (checked) {
        await assignPermissionToRole(selectedRole.id, perm.id);
      } else {
        await removePermissionFromRole(selectedRole.id, perm.id);
      }
      await selectRole(selectedRole);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update permission");
    }
  };

  const setResourcePermissions = async (resourcePerms: PlatformPermissionRow[], select: boolean) => {
    if (!selectedRole) return;
    for (const perm of resourcePerms) {
      const has = rolePermIds.has(perm.id);
      if (select && !has && myPermissions.includes(perm.key)) {
        await assignPermissionToRole(selectedRole.id, perm.id).catch(() => {});
      } else if (!select && has) {
        await removePermissionFromRole(selectedRole.id, perm.id).catch(() => {});
      }
    }
    await selectRole(selectedRole);
  };

  const submitCreateRole = async () => {
    if (!newRole.name) { toast.error("Role name is required"); return; }
    setBusy(true);
    try {
      const created = await createRole(newRole);
      setCreateOpen(false);
      setNewRole({ name: "", description: "", level: 10 });
      await load();
      await selectRole(created);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create role");
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (role: PlatformRoleRow) => {
    const name = window.prompt("New role name", `${role.name} (copy)`);
    if (!name) return;
    try {
      const created = await duplicateRole(role.id, name);
      await load();
      await selectRole(created);
      toast.success("Role duplicated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate role");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground">Dynamic roles built from the controlled permission catalog.</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Role</Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="pt-6 space-y-1">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${selectedRole?.id === role.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                <span className="flex items-center gap-1.5">
                  {role.is_system && <Lock className="h-3 w-3" />}
                  {role.name}
                </span>
                <Badge variant="outline">L{role.level}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        {selectedRole && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedRole.name}
                  {selectedRole.is_system && <Badge variant="outline">System role</Badge>}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Level {selectedRole.level} · {staffCount} staff assigned · {rolePermIds.size} permissions
                </p>
              </div>
              {canManage && !selectedRole.is_system && (
                <Button size="sm" variant="outline" onClick={() => handleDuplicate(selectedRole)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicate
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage && !selectedRole.is_system && (
                <div className="grid grid-cols-2 gap-3 pb-2 border-b">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input
                      defaultValue={selectedRole.name}
                      onBlur={async (e) => {
                        if (e.target.value === selectedRole.name || !e.target.value) return;
                        try {
                          await updateRole(selectedRole.id, { name: e.target.value });
                          await load();
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : "Failed to rename role");
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Level</Label>
                    <Input
                      type="number"
                      defaultValue={selectedRole.level}
                      onBlur={async (e) => {
                        const level = Number(e.target.value);
                        if (level === selectedRole.level) return;
                        try {
                          await updateRole(selectedRole.id, { level });
                          await load();
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : "Failed to change level — cannot exceed your own level");
                        }
                      }}
                    />
                  </div>
                </div>
              )}
              <Input placeholder="Search permissions…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {[...grouped.entries()].map(([resource, perms]) => (
                  <div key={resource} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-sm capitalize">{resource}</h3>
                      {canManage && !selectedRole.is_system && (
                        <div className="space-x-2">
                          <button className="text-xs text-primary" onClick={() => setResourcePermissions(perms, true)}>Select all</button>
                          <button className="text-xs text-muted-foreground" onClick={() => setResourcePermissions(perms, false)}>Clear</button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {perms.map((perm) => {
                        const checked = rolePermIds.has(perm.id);
                        const delegable = myPermissions.includes(perm.key);
                        return (
                          <label key={perm.id} className={`flex items-center gap-2 text-sm ${!delegable && !checked ? "opacity-40" : ""}`}>
                            <Checkbox
                              checked={checked}
                              disabled={!canManage || selectedRole.is_system || (!delegable && !checked)}
                              onCheckedChange={(v) => togglePermission(perm, !!v)}
                            />
                            {perm.key}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Level (numeric seniority, used for approval authority)</Label>
              <Input type="number" value={newRole.level} onChange={(e) => setNewRole({ ...newRole, level: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">You cannot set a level higher than your own effective level.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreateRole} disabled={busy}>{busy ? "Creating…" : "Create Role"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
