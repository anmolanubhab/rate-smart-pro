import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserPlus, Search, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import {
  listStaff, listInvitations, inviteStaff, resendInvite, revokeInvite, invitationLink,
  PLATFORM_STAFF_STATUSES,
  type PlatformStaffRow, type PlatformStaffInvitationRow, type PlatformStaffStatus,
} from "@/lib/platformStaff";
import StaffStatusBadge from "@/components/platform/StaffStatusBadge";
import { listRoles, type PlatformRoleRow } from "@/lib/platformRoles";
import { listDepartments, type PlatformDepartmentRow } from "@/lib/platformOrg";

export default function PlatformStaffDirectory() {
  useEffect(() => { document.title = "RD-Pro Control Center — Staff"; }, []);
  const navigate = useNavigate();
  const { hasPermission } = usePlatformAuth();

  const [tab, setTab] = useState<"staff" | "invitations">("staff");
  const [staff, setStaff] = useState<PlatformStaffRow[]>([]);
  const [invitations, setInvitations] = useState<PlatformStaffInvitationRow[]>([]);
  const [roles, setRoles] = useState<PlatformRoleRow[]>([]);
  const [departments, setDepartments] = useState<PlatformDepartmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlatformStaffStatus | "all">("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ email: "", full_name: "", designation: "", role_id: "", department_id: "" });

  const load = async () => {
    const [s, inv, r, d] = await Promise.all([
      listStaff(), listInvitations(), listRoles(), listDepartments(),
    ]);
    setStaff(s);
    setInvitations(inv);
    setRoles(r);
    setDepartments(d);
  };

  useEffect(() => { load().catch((e) => toast.error(e.message ?? "Failed to load staff")); }, []);

  const filteredStaff = useMemo(() => {
    const s = search.trim().toLowerCase();
    return staff.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!s) return true;
      return Boolean(row.full_name?.toLowerCase().includes(s) || row.email?.toLowerCase().includes(s));
    });
  }, [staff, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<PlatformStaffStatus, number>();
    for (const row of staff) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return counts;
  }, [staff]);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "—";
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "—";

  const submitInvite = async () => {
    if (!form.email || !form.role_id) { toast.error("Email and role are required"); return; }
    setBusy(true);
    try {
      const result = await inviteStaff({
        email: form.email,
        role_id: form.role_id,
        full_name: form.full_name || undefined,
        designation: form.designation || undefined,
        department_id: form.department_id || undefined,
      });
      toast.success("Invitation created — copy the link and share it.");
      if (result.token) {
        await navigator.clipboard.writeText(invitationLink(result.token)).catch(() => {});
        toast.info("Invite link copied to clipboard");
      }
      setInviteOpen(false);
      setForm({ email: "", full_name: "", designation: "", role_id: "", department_id: "" });
      await load();
      setTab("invitations");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to invite staff");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(invitationLink(token));
    toast.success("Link copied");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Platform Staff</h1>
          <p className="text-sm text-muted-foreground">Manage RD-Pro's internal team.</p>
        </div>
        {hasPermission("staff.manage") && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Invite Staff
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "staff" | "invitations")}>
        <TabsList>
          <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
          <TabsTrigger value="invitations">
            Pending Invitations ({invitations.filter((i) => i.status === "pending").length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "staff" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input placeholder="Search name or email…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-xs border ${statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  All ({staff.length})
                </button>
                {PLATFORM_STAFF_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-xs border capitalize ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {s} ({statusCounts.get(s) ?? 0})
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No staff found.</TableCell></TableRow>
                  )}
                  {filteredStaff.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/platform/staff/${row.id}`)}>
                      <TableCell>
                        <div className="font-medium">{row.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      </TableCell>
                      <TableCell>{row.designation ?? "—"}</TableCell>
                      <TableCell>{deptName(row.department_id)}</TableCell>
                      <TableCell><StaffStatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.last_active_at ? new Date(row.last_active_at).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "invitations" && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No invitations yet.</TableCell></TableRow>
                  )}
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="font-medium">{inv.full_name ?? inv.email}</div>
                        <div className="text-xs text-muted-foreground">{inv.email}</div>
                      </TableCell>
                      <TableCell>{roleName(inv.role_id)}</TableCell>
                      <TableCell><Badge variant="outline">{inv.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {inv.status === "pending" && hasPermission("staff.manage") && (
                          <>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              try {
                                const r = await resendInvite(inv.id);
                                await copyLink(r.token);
                                await load();
                              } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
                            }}>
                              <Copy className="h-3.5 w-3.5 mr-1" /> Resend
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                              try { await revokeInvite(inv.id); await load(); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
                            }}>
                              Revoke
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Platform Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@rdpro.app" />
            </div>
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Junior Support Executive" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} (level {r.level})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">You can only grant roles you yourself have the authority to delegate.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select department (optional)" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={submitInvite} disabled={busy}>{busy ? "Sending…" : "Send Invitation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
