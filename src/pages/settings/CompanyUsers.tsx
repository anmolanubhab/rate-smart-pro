import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness, type BusinessRole } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Search, Clock, X, Copy, RefreshCw, Trash2, Info, KeyRound, Mail,
  ShieldCheck, Smartphone, Monitor, Lock, Banknote,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { ownerMinimumViolation, diffBusiness } from "@/lib/companySafety";
import { isOwner, canGranular, type FinancialRights } from "@/lib/permissions";
import { DASHBOARD_FOCUS_OPTIONS, type DashboardFocus } from "@/lib/dashboardFocus";
import { usePermissionMode } from "@/lib/permissionMode";
import {
  listInvitations, sendInvitation, resendInvitation, cancelInvitation, deleteInvitation,
  invitationLink, createUserWithTempPassword,
  type Invitation, type LoginControlSettings, defaultLoginControl,
} from "@/lib/userAccess";
import { useFormatDate } from "@/lib/dateFormat";
import {
  PermissionMatrixEditor, emptyPermissionMatrix, type PermissionMatrix,
} from "@/components/settings/PermissionMatrixEditor";

// Mirrors the live public.business_role enum exactly — "operator" and
// "purchase" were never valid DB values (assigning them errors on insert).
const ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant", "salesman", "staff", "store_manager", "viewer"];
const ROLE_LABELS: Record<BusinessRole, string> = {
  owner: "Owner", admin: "Admin", manager: "Manager", accountant: "Accountant",
  salesman: "Sales", staff: "Staff", store_manager: "Store", viewer: "Viewer",
};

const defaultFinancialRights: Required<FinancialRights> = {
  can_edit_locked_voucher: false, can_backdate_voucher: false, can_delete_voucher: false,
  can_change_gst: false, can_change_rate: false, can_change_discount: false,
  can_change_cost_price: false, can_view_profit: false,
};

type MemberForm = {
  full_name: string; username: string; email: string; mobile: string;
  role: BusinessRole; department: string; status: "active" | "inactive"; notes: string;
  financial_rights: FinancialRights;
  dashboard_focus: DashboardFocus | null;
} & LoginControlSettings;
const emptyMember: MemberForm = {
  full_name: "", username: "", email: "", mobile: "",
  role: "viewer", department: "", status: "active", notes: "",
  financial_rights: { ...defaultFinancialRights },
  dashboard_focus: null,
  ...defaultLoginControl,
};

type AddForm = {
  full_name: string; email: string; mobile: string; role: BusinessRole; department: string; notes: string;
};
const emptyAdd: AddForm = { full_name: "", email: "", mobile: "", role: "viewer", department: "", notes: "" };

const STATUS_BADGE: Record<Invitation["status"], { label: string; variant: "default" | "outline" | "secondary" | "destructive" }> = {
  pending: { label: "Pending", variant: "outline" },
  accepted: { label: "Accepted", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
  revoked: { label: "Cancelled", variant: "secondary" },
};

export default function CompanyUsers() {
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const fd = useFormatDate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"invite" | "temp">("invite");
  const [detailsInvite, setDetailsInvite] = useState<Invitation | null>(null);
  const [tempResult, setTempResult] = useState<{ email: string; temp_password: string | null; existing_account: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMember);
  const [addForm, setAddForm] = useState<AddForm>(emptyAdd);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const canManage = canGranular(role, "team.manage", permissions);
  const permissionMode = usePermissionMode();

  // ── Per-user permission overrides ──
  const [permTarget, setPermTarget] = useState<{ id: string; role: BusinessRole; full_name: string | null } | null>(null);
  const [permValue, setPermValue] = useState<PermissionMatrix>(emptyPermissionMatrix());
  const [permHasOverride, setPermHasOverride] = useState(false);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);

  // ── Per-business role templates ──
  const [templateRole, setTemplateRole] = useState<BusinessRole>("manager");
  const [templateValue, setTemplateValue] = useState<PermissionMatrix>(emptyPermissionMatrix());
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [applyingToAll, setApplyingToAll] = useState(false);

  useEffect(() => { document.title = "Company Users — RD Pro"; }, []);

  const list = useQuery({
    queryKey: ["company-users", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_users")
        .select("id, user_id, role, status, full_name, username, email, mobile, department, notes, created_at, login_enabled, allow_mobile_login, allow_desktop_login, require_password_change, require_2fa, single_session_only, office_only_login, registered_device_only, max_devices, financial_rights, dashboard_focus")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const invites = useQuery({
    queryKey: ["company-user-invitations", business?.id],
    enabled: !!business,
    queryFn: () => listInvitations(business!.id),
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
  const pendingInvites = useMemo(
    () => filterBy((invites.data ?? []).filter((r) => r.status === "pending"), ["email", "mobile", "department", "full_name"]),
    [invites.data, search]
  );
  const closedInvites = useMemo(
    () => (invites.data ?? []).filter((r) => r.status !== "pending"),
    [invites.data]
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["company-users", business?.id] });
    qc.invalidateQueries({ queryKey: ["company-user-invitations", business?.id] });
  };

  // ── Add User ──
  const startAdd = () => { setAddForm(emptyAdd); setAddMode("invite"); setTempResult(null); setAddOpen(true); };

  const submitAdd = async () => {
    if (!business) return;
    if (!addForm.email.trim()) { toast.error("Enter an email address"); return; }
    setAdding(true);
    try {
      if (addMode === "invite") {
        const result = await sendInvitation({
          business_id: business.id, email: addForm.email, mobile: addForm.mobile,
          role: addForm.role, department: addForm.department, notes: addForm.notes,
          full_name: addForm.full_name,
        });
        if (result.outcome === "member_added") {
          await logAudit({ business_id: business.id, action: "USER_ADDED", entity_type: "business_user", entity_id: result.membership_id, new_value: addForm });
          toast.success("This person already had an account — added to the company directly.");
        } else {
          await logAudit({ business_id: business.id, action: "USER_INVITED", entity_type: "business_user_invitation", entity_id: result.invitation_id, new_value: addForm });
          toast.success("Invitation created. Copy the link or share it — email sending needs the invitation Edge Function deployed.");
        }
        invalidateAll();
        setAddOpen(false);
      } else {
        const result = await createUserWithTempPassword({
          business_id: business.id, email: addForm.email, full_name: addForm.full_name,
          mobile: addForm.mobile, role: addForm.role, department: addForm.department, notes: addForm.notes,
        });
        await logAudit({ business_id: business.id, action: "USER_CREATED_TEMP_PASSWORD", entity_type: "business_user", entity_id: result.membership_id, new_value: { email: addForm.email, role: addForm.role } });
        setTempResult({ email: addForm.email, temp_password: result.temp_password, existing_account: result.existing_account });
        invalidateAll();
        // keep dialog open to show the one-time temp password
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not add user");
    } finally {
      setAdding(false);
    }
  };

  const doResend = async (inv: Invitation) => {
    if (!business) return;
    try {
      await resendInvitation(inv.id);
      await logAudit({ business_id: business.id, action: "USER_INVITE_RESENT", entity_type: "business_user_invitation", entity_id: inv.id });
      toast.success("Invitation resent — link refreshed");
      invalidateAll();
    } catch (e: any) { toast.error(e.message ?? "Could not resend"); }
  };

  const doCancel = async (inv: Invitation) => {
    if (!business) return;
    if (!confirm(`Cancel the invitation for ${inv.email}?`)) return;
    try {
      await cancelInvitation(inv.id);
      await logAudit({ business_id: business.id, action: "USER_INVITE_CANCELLED", entity_type: "business_user_invitation", entity_id: inv.id });
      toast.success("Invitation cancelled");
      invalidateAll();
    } catch (e: any) { toast.error(e.message ?? "Could not cancel"); }
  };

  const doDelete = async (inv: Invitation) => {
    if (!confirm(`Delete this ${inv.status} invitation record?`)) return;
    try {
      await deleteInvitation(inv.id);
      toast.success("Invitation deleted");
      invalidateAll();
    } catch (e: any) { toast.error(e.message ?? "Could not delete"); }
  };

  const copyLink = async (inv: Invitation) => {
    try {
      await navigator.clipboard.writeText(invitationLink(inv.token));
      toast.success("Invitation link copied");
    } catch { toast.error("Could not copy link"); }
  };

  // ── Edit existing membership (role/status/details/login control) ──
  const startEdit = (r: (typeof activeRows)[number]) => {
    setEditingId(r.id);
    setMemberForm({
      full_name: r.full_name ?? "", username: r.username ?? "", email: r.email ?? "",
      mobile: r.mobile ?? "", role: r.role as BusinessRole, department: r.department ?? "",
      status: (r.status === "inactive" ? "inactive" : "active"),
      notes: r.notes ?? "",
      login_enabled: r.login_enabled ?? true,
      allow_mobile_login: r.allow_mobile_login ?? true,
      allow_desktop_login: r.allow_desktop_login ?? true,
      require_password_change: r.require_password_change ?? false,
      require_2fa: r.require_2fa ?? false,
      single_session_only: r.single_session_only ?? false,
      office_only_login: r.office_only_login ?? false,
      registered_device_only: r.registered_device_only ?? false,
      max_devices: r.max_devices ?? null,
      financial_rights: { ...defaultFinancialRights, ...(r.financial_rights ?? {}) },
      dashboard_focus: (r.dashboard_focus ?? null) as DashboardFocus | null,
      office_hours_start: null,
      office_hours_end: null,
      allowed_days: null,
    });
    setEditOpen(true);
  };

  const isSelf = (r: { user_id: string }) => r.user_id === user?.id;

  const saveEdit = async () => {
    if (!business || !editingId) return;
    const original = list.data?.find((r) => r.id === editingId);
    const losesOwnerStatus = original && isOwner(original.role) && original.status === "active"
      && (!isOwner(memberForm.role) || memberForm.status !== "active" || !memberForm.login_enabled);
    if (losesOwnerStatus) {
      const err = ownerMinimumViolation(list.data ?? [], editingId);
      if (err) { toast.error(err); return; }
    }
    if (original && isSelf(original) && (memberForm.role !== original.role || memberForm.status !== original.status || memberForm.login_enabled !== original.login_enabled)) {
      toast.error("You cannot change your own role, status, or login access.");
      return;
    }
    const { error } = await supabase.from("business_users").update({
      full_name: memberForm.full_name || null, username: memberForm.username || null,
      email: memberForm.email || null, mobile: memberForm.mobile || null,
      role: memberForm.role, department: memberForm.department || null,
      status: memberForm.status, notes: memberForm.notes || null,
      login_enabled: memberForm.login_enabled,
      allow_mobile_login: memberForm.allow_mobile_login,
      allow_desktop_login: memberForm.allow_desktop_login,
      require_password_change: memberForm.require_password_change,
      require_2fa: memberForm.require_2fa,
      single_session_only: memberForm.single_session_only,
      office_only_login: memberForm.office_only_login,
      registered_device_only: memberForm.registered_device_only,
      max_devices: memberForm.max_devices,
      financial_rights: memberForm.financial_rights,
      dashboard_focus: memberForm.dashboard_focus,
    } as never).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    const diffKeys: (keyof MemberForm)[] = [
      "full_name", "username", "email", "mobile", "role", "department", "status", "notes",
      "login_enabled", "allow_mobile_login", "allow_desktop_login", "require_password_change",
      "require_2fa", "single_session_only", "office_only_login", "registered_device_only", "max_devices",
      "dashboard_focus",
    ];
    const changes = original ? diffBusiness(original, memberForm, diffKeys) : [];
    await logAudit({
      business_id: business.id, action: "USER_UPDATED", entity_type: "business_user", entity_id: editingId,
      old_value: Object.fromEntries(changes.map((c) => [c.key, c.old])),
      new_value: Object.fromEntries(changes.map((c) => [c.key, c.next])),
    });
    toast.success("User updated");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["company-users", business.id] });
  };

  const toggleStatus = async (r: { id: string; status: string; role: string; user_id: string }) => {
    if (isSelf(r)) { toast.error("You cannot disable your own account."); return; }
    const next = r.status === "active" ? "inactive" : "active";
    if (next === "inactive") {
      const err = ownerMinimumViolation(list.data ?? [], r.id);
      if (err) { toast.error(err); return; }
    }
    const { error } = await supabase.from("business_users").update({ status: next }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: next === "inactive" ? "USER_DISABLED" : "USER_ENABLED", entity_type: "business_user", entity_id: r.id, new_value: { status: next, role: r.role } });
    qc.invalidateQueries({ queryKey: ["company-users", business?.id] });
  };

  // Per the spec: never delete a user's account -- this only removes
  // their membership in THIS company. The person and their auth account
  // are untouched, and they keep membership in any other company.
  const removeMembership = async (r: { id: string; user_id: string }) => {
    if (isSelf(r)) { toast.error("You cannot remove your own membership."); return; }
    const err = ownerMinimumViolation(list.data ?? [], r.id);
    if (err) { toast.error(err); return; }
    if (!confirm("Remove this user's membership from this company? (Their account itself is not deleted, and any access to other companies is unaffected.)")) return;
    const { error } = await supabase.from("business_users").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "USER_REMOVED", entity_type: "business_user", entity_id: r.id });
    qc.invalidateQueries({ queryKey: ["company-users", business?.id] });
  };

  // ── Per-user permission overrides ──
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  const openPermissions = async (r: { id: string; role: string; full_name: string | null }) => {
    setPermTarget({ id: r.id, role: r.role as BusinessRole, full_name: r.full_name });
    setPermLoading(true);
    try {
      const [{ data: effective, error: effErr }, { data: override, error: ovErr }] = await Promise.all([
        supabase.rpc("get_effective_permissions", { _business_user_id: r.id }),
        supabase.from("user_permissions").select("business_user_id").eq("business_user_id", r.id).maybeSingle(),
      ]);
      if (effErr) throw effErr;
      if (ovErr) throw ovErr;
      setPermValue((effective as PermissionMatrix) ?? emptyPermissionMatrix());
      setPermHasOverride(!!override);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load permissions");
      setPermTarget(null);
      return;
    } finally {
      setPermLoading(false);
    }
  };

  const copyRoleTemplateInto = async (roleToCopy: string, setter: (v: PermissionMatrix) => void) => {
    if (!business) return;
    try {
      const { data, error } = await supabase.rpc("get_role_template", { _business_id: business.id, _role: roleToCopy });
      if (error) throw error;
      setter((data as PermissionMatrix) ?? emptyPermissionMatrix());
    } catch (e: any) {
      toast.error(e.message ?? "Could not load role template");
    }
  };

  const savePermissions = async () => {
    if (!business || !permTarget) return;
    setPermSaving(true);
    try {
      const { error } = await supabase.rpc("save_user_permissions", {
        _business_user_id: permTarget.id,
        _permissions: permValue,
      });
      if (error) throw error;
      await logAudit({
        business_id: business.id, action: "USER_PERMISSIONS_UPDATED",
        entity_type: "business_user", entity_id: permTarget.id, new_value: permValue,
      });
      toast.success("Permissions updated");
      setPermHasOverride(true);
      setPermTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save permissions");
    } finally {
      setPermSaving(false);
    }
  };

  const resetPermissions = async () => {
    if (!business || !permTarget) return;
    setPermSaving(true);
    try {
      const { error } = await supabase.rpc("reset_user_permissions", { _business_user_id: permTarget.id });
      if (error) throw error;
      const { data: template, error: tErr } = await supabase.rpc("get_role_template", { _business_id: business.id, _role: permTarget.role });
      if (tErr) throw tErr;
      setPermValue((template as PermissionMatrix) ?? emptyPermissionMatrix());
      setPermHasOverride(false);
      await logAudit({ business_id: business.id, action: "USER_PERMISSIONS_RESET", entity_type: "business_user", entity_id: permTarget.id });
      toast.success("Reset to role default");
    } catch (e: any) {
      toast.error(e.message ?? "Could not reset permissions");
    } finally {
      setPermSaving(false);
    }
  };

  // ── Per-business role templates ──
  const loadTemplate = async (r: BusinessRole) => {
    if (!business) return;
    setTemplateRole(r);
    setTemplateLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_role_template", { _business_id: business.id, _role: r });
      if (error) throw error;
      setTemplateValue((data as PermissionMatrix) ?? emptyPermissionMatrix());
    } catch (e: any) {
      toast.error(e.message ?? "Could not load role template");
    } finally {
      setTemplateLoading(false);
    }
  };

  const upsertRoleTemplate = async (targetRole: BusinessRole, permissions: PermissionMatrix) => {
    if (!business) return;
    const { error } = await supabase.from("permission_templates").upsert(
      {
        business_id: business.id, role: targetRole,
        name: `${ROLE_LABELS[targetRole]} (Custom)`, permissions, is_system: false,
      } as never,
      { onConflict: "business_id,role" },
    );
    if (error) throw error;
    await logAudit({
      business_id: business.id, action: "ROLE_TEMPLATE_UPDATED",
      entity_type: "permission_template", entity_id: targetRole, new_value: permissions,
    });
  };

  const saveTemplate = async () => {
    if (!business) return;
    setTemplateSaving(true);
    try {
      await upsertRoleTemplate(templateRole, templateValue);
      toast.success(`${ROLE_LABELS[templateRole]} template updated for this company`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save role template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const saveCurrentAsRoleTemplate = async () => {
    if (!permTarget) return;
    setSavingAsTemplate(true);
    try {
      await upsertRoleTemplate(permTarget.role, permValue);
      toast.success(`${ROLE_LABELS[permTarget.role]} template updated from ${permTarget.full_name || "this user"}'s permissions`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save role template");
    } finally {
      setSavingAsTemplate(false);
    }
  };

  const applyTemplateToAllUsers = async () => {
    if (!business) return;
    const usersOfRole = (list.data ?? []).filter((r) => r.role === templateRole && r.status === "active");
    if (usersOfRole.length === 0) {
      toast.error(`No active ${ROLE_LABELS[templateRole]} users found`);
      return;
    }
    if (!confirm(
      `Apply these permissions directly to ${usersOfRole.length} ${ROLE_LABELS[templateRole]} user(s) as their individual permissions? ` +
      `Each gets a personal override — future template changes won't affect them unless reset.`
    )) return;
    setApplyingToAll(true);
    let ok = 0, failed = 0;
    for (const u of usersOfRole) {
      const { error } = await supabase.rpc("save_user_permissions", { _business_user_id: u.id, _permissions: templateValue });
      if (error) failed++; else ok++;
    }
    await logAudit({
      business_id: business.id, action: "ROLE_TEMPLATE_APPLIED_TO_USERS",
      entity_type: "business_role", entity_id: templateRole, new_value: { role: templateRole, applied: ok, failed },
    });
    if (failed > 0) toast.error(`Applied to ${ok} user(s), ${failed} failed`);
    else toast.success(`Applied to ${ok} ${ROLE_LABELS[templateRole]} user(s)`);
    setApplyingToAll(false);
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

        <Tabs
          defaultValue="active"
          className="w-full"
          onValueChange={(v) => { if (v === "templates") loadTemplate(templateRole); }}
        >
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="active">Active Users ({activeRows.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending Invitations ({pendingInvites.length})</TabsTrigger>
              <TabsTrigger value="disabled">Disabled Users ({disabledRows.length})</TabsTrigger>
              <TabsTrigger value="history">Invitation History ({closedInvites.length})</TabsTrigger>
              {canManage && permissionMode === "role_based" && <TabsTrigger value="templates">Role Templates</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="active" className="mt-0">
            <MembersTable rows={activeRows} canManage={canManage} isSelf={isSelf} onEdit={startEdit} onToggle={toggleStatus} onRemove={removeMembership} onPermissions={openPermissions} disableAction="Disable" />
          </TabsContent>

          <TabsContent value="disabled" className="mt-0">
            <MembersTable rows={disabledRows} canManage={canManage} isSelf={isSelf} onEdit={startEdit} onToggle={toggleStatus} onRemove={removeMembership} onPermissions={openPermissions} disableAction="Enable" />
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
                    <TableHead>Expires</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        <div>{r.email || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.mobile || ""}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{ROLE_LABELS[r.role as BusinessRole] ?? r.role}</Badge></TableCell>
                      <TableCell className="text-sm">{r.department || "—"}</TableCell>
                      <TableCell className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {fd(r.invited_at)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fd(r.expires_at)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {canManage && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => copyLink(r)}><Copy className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy invite link</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => doResend(r)}><RefreshCw className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger>
                              <TooltipContent>Resend / refresh link</TooltipContent>
                            </Tooltip>
                            <Button size="sm" variant="ghost" onClick={() => setDetailsInvite(r)}><Info className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doCancel(r)}>
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingInvites.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No pending invitations</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedInvites.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell><Badge variant="outline">{ROLE_LABELS[r.role as BusinessRole] ?? r.role}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fd(r.invited_at)}</TableCell>
                      <TableCell className="text-right">
                        {canManage && r.status !== "pending" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => doDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {closedInvites.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No invitation history yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {canManage && permissionMode === "role_based" && (
            <TabsContent value="templates" className="mt-0 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                  Customize what each role can do in this company. Users with no individual permission override
                  automatically follow their role's template.
                </p>
                <Select value={templateRole} onValueChange={(v) => loadTemplate(v as BusinessRole)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {templateLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : (
                <>
                  <PermissionMatrixEditor
                    value={templateValue}
                    onChange={setTemplateValue}
                    roleOptions={roleOptions}
                    onCopyFromRole={(r) => copyRoleTemplateInto(r, setTemplateValue)}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={applyTemplateToAllUsers}
                      disabled={applyingToAll || templateSaving || isOwner(templateRole)}
                    >
                      {applyingToAll ? "Applying…" : `Apply to all current ${ROLE_LABELS[templateRole]} users`}
                    </Button>
                    <Button onClick={saveTemplate} disabled={templateSaving || isOwner(templateRole)}>
                      {templateSaving ? "Saving…" : `Save ${ROLE_LABELS[templateRole]} Template`}
                    </Button>
                  </div>
                  {isOwner(templateRole) && (
                    <p className="text-xs text-muted-foreground text-right">Owner permissions cannot be restricted.</p>
                  )}
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Add user — Option A (invitation) or Option B (temporary password) */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) setTempResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Company User</DialogTitle></DialogHeader>

          {tempResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600"><ShieldCheck className="h-5 w-5" /><span className="font-medium">Account created</span></div>
              {tempResult.temp_password ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Share this temporary password with <span className="font-medium">{tempResult.email}</span>.
                    It's shown only once — the user will be required to change it on first login.
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted font-mono text-sm">
                    <KeyRound className="h-4 w-4 shrink-0" />
                    <span className="flex-1 break-all">{tempResult.temp_password}</span>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tempResult.temp_password!); toast.success("Copied"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{tempResult.email}</span> already had an RD-Pro account and has been added
                  to this company directly — they can log in with their existing password.
                </p>
              )}
              <DialogFooter><Button onClick={() => setAddOpen(false)}>Done</Button></DialogFooter>
            </div>
          ) : (
            <>
              <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "invite" | "temp")}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="invite"><Mail className="h-3.5 w-3.5 mr-1.5" />Send Invitation</TabsTrigger>
                  <TabsTrigger value="temp"><KeyRound className="h-3.5 w-3.5 mr-1.5" />Temporary Password</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-sm text-muted-foreground">
                {addMode === "invite"
                  ? "A secure invite link is generated. If they already have an RD-Pro account (any company), they're added immediately instead — no duplicate account is created."
                  : "Creates the account instantly with a system-generated temporary password. The user must change it on first login."}
              </p>
              <div className="space-y-4">
                <Field label="Full Name"><Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} /></Field>
                <Field label="Email"><Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="name@example.com" /></Field>
                <Field label="Mobile"><Input value={addForm.mobile} onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })} placeholder="+91…" /></Field>
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
                <Button onClick={submitAdd} disabled={adding}>
                  {adding ? "Working…" : addMode === "invite" ? "Send Invitation" : "Create User"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Invitation details */}
      <Dialog open={!!detailsInvite} onOpenChange={(v) => !v && setDetailsInvite(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invitation Details</DialogTitle></DialogHeader>
          {detailsInvite && (
            <div className="space-y-2 text-sm">
              <Row label="Email" value={detailsInvite.email} />
              <Row label="Full name" value={detailsInvite.full_name || "—"} />
              <Row label="Mobile" value={detailsInvite.mobile || "—"} />
              <Row label="Role" value={ROLE_LABELS[detailsInvite.role] ?? detailsInvite.role} />
              <Row label="Department" value={detailsInvite.department || "—"} />
              <Row label="Status" value={STATUS_BADGE[detailsInvite.status].label} />
              <Row label="Invited" value={new Date(detailsInvite.invited_at).toLocaleString()} />
              <Row label="Last sent" value={new Date(detailsInvite.last_sent_at).toLocaleString()} />
              <Row label="Expires" value={new Date(detailsInvite.expires_at).toLocaleString()} />
              {detailsInvite.notes && <Row label="Notes" value={detailsInvite.notes} />}
              <Separator className="my-2" />
              <div className="flex items-center gap-2">
                <Input readOnly value={invitationLink(detailsInvite.token)} className="text-xs" />
                <Button size="sm" variant="outline" onClick={() => copyLink(detailsInvite)}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailsInvite(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit existing membership */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
            <Field label="Dashboard Focus">
              <Select
                value={memberForm.dashboard_focus ?? "none"}
                onValueChange={(v) => setMemberForm({ ...memberForm, dashboard_focus: v === "none" ? null : (v as DashboardFocus) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  {DASHBOARD_FOCUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
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

          <Separator className="my-2" />
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Lock className="h-4 w-4" /> Login &amp; Access Control</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <ToggleRow icon={ShieldCheck} label="Login Enabled" checked={memberForm.login_enabled} onChange={(v) => setMemberForm({ ...memberForm, login_enabled: v })} />
            <ToggleRow icon={Smartphone} label="Allow Mobile Login" checked={memberForm.allow_mobile_login} onChange={(v) => setMemberForm({ ...memberForm, allow_mobile_login: v })} />
            <ToggleRow icon={Monitor} label="Allow Desktop Login" checked={memberForm.allow_desktop_login} onChange={(v) => setMemberForm({ ...memberForm, allow_desktop_login: v })} />
            <ToggleRow icon={KeyRound} label="Require Password Change" checked={memberForm.require_password_change} onChange={(v) => setMemberForm({ ...memberForm, require_password_change: v })} />
            <ToggleRow icon={ShieldCheck} label="Require Two-Factor Auth" checked={memberForm.require_2fa} onChange={(v) => setMemberForm({ ...memberForm, require_2fa: v })} note="Enforcement lands in a later phase — flag is stored now." />
            <ToggleRow icon={Lock} label="Single Session Only" checked={memberForm.single_session_only} onChange={(v) => setMemberForm({ ...memberForm, single_session_only: v })} />
            <ToggleRow icon={Lock} label="Office-Only Login" checked={memberForm.office_only_login} onChange={(v) => setMemberForm({ ...memberForm, office_only_login: v })} note="Enforcement lands with Session Management (later phase)." />
            <ToggleRow icon={Lock} label="Registered Device Only" checked={memberForm.registered_device_only} onChange={(v) => setMemberForm({ ...memberForm, registered_device_only: v })} note="Enforcement lands with Session Management (later phase)." />
            <Field label="Maximum Devices">
              <Input type="number" min={0} value={memberForm.max_devices ?? ""} placeholder="No limit"
                onChange={(e) => setMemberForm({ ...memberForm, max_devices: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </div>

          <Separator className="my-2" />
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Financial Rights</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <ToggleRow icon={Lock} label="Can Edit Locked Voucher"
              checked={!!memberForm.financial_rights.can_edit_locked_voucher}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_edit_locked_voucher: v } })} />
            <ToggleRow icon={Trash2} label="Can Delete Voucher"
              checked={!!memberForm.financial_rights.can_delete_voucher}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_delete_voucher: v } })} />
            <ToggleRow icon={Banknote} label="Can View Profit"
              checked={!!memberForm.financial_rights.can_view_profit}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_view_profit: v } })} />
            <ToggleRow icon={Clock} label="Can Backdate Voucher"
              checked={!!memberForm.financial_rights.can_backdate_voucher}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_backdate_voucher: v } })}
              note="Only needed beyond the normal backdating window (Settings → Accounting Lock) — owner/admin always have it; ordinary backdated entry within the window never needs this." />
            <ToggleRow icon={Banknote} label="Can Change GST"
              checked={!!memberForm.financial_rights.can_change_gst}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_change_gst: v } })}
              note="Enforcement lands in a later phase — flag is stored now." />
            <ToggleRow icon={Banknote} label="Can Change Rate"
              checked={!!memberForm.financial_rights.can_change_rate}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_change_rate: v } })}
              note="Enforcement lands in a later phase — flag is stored now." />
            <ToggleRow icon={Banknote} label="Can Change Discount"
              checked={!!memberForm.financial_rights.can_change_discount}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_change_discount: v } })}
              note="Enforcement lands in a later phase — flag is stored now." />
            <ToggleRow icon={Banknote} label="Can Change Cost Price"
              checked={!!memberForm.financial_rights.can_change_cost_price}
              onChange={(v) => setMemberForm({ ...memberForm, financial_rights: { ...memberForm.financial_rights, can_change_cost_price: v } })}
              note="Enforcement lands in a later phase — flag is stored now." />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-user permission override */}
      <Dialog open={!!permTarget} onOpenChange={(v) => !v && setPermTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissions — {permTarget?.full_name || "User"} ({permTarget ? ROLE_LABELS[permTarget.role] : ""})</DialogTitle>
          </DialogHeader>
          {permLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <>
              {permissionMode === "role_based" ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="text-sm font-medium">Follow role template</p>
                    <p className="text-xs text-muted-foreground">
                      {permHasOverride
                        ? "Off — this user has a custom override that no longer follows their role's template."
                        : "On — this user follows their role's template. Editing and saving switches this off."}
                    </p>
                  </div>
                  <Switch
                    checked={!permHasOverride}
                    disabled={permSaving}
                    onCheckedChange={(checked) => { if (checked) resetPermissions(); else setPermHasOverride(true); }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Set exactly what {permTarget?.full_name || "this user"} can do. Their role is just a label —
                  it doesn't grant or limit anything on its own.
                </p>
              )}
              <PermissionMatrixEditor
                value={permValue}
                onChange={setPermValue}
                roleOptions={roleOptions}
                onCopyFromRole={(r) => copyRoleTemplateInto(r, setPermValue)}
              />
            </>
          )}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={saveCurrentAsRoleTemplate}
              disabled={savingAsTemplate || permSaving || permLoading || !permTarget || isOwner(permTarget.role)}
            >
              {savingAsTemplate ? "Saving…" : `Save as ${permTarget ? ROLE_LABELS[permTarget.role] : ""} template`}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPermTarget(null)} disabled={permSaving}>Cancel</Button>
              <Button onClick={savePermissions} disabled={permSaving || permLoading}>
                {permSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MembersTable({
  rows, canManage, isSelf, onEdit, onToggle, onRemove, onPermissions, disableAction,
}: {
  rows: any[]; canManage: boolean; isSelf: (r: { user_id: string }) => boolean;
  onEdit: (r: any) => void; onToggle: (r: any) => void;
  onRemove: (r: any) => void; onPermissions: (r: any) => void; disableAction: "Disable" | "Enable";
}) {
  const fd = useFormatDate();
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
            <TableHead>Login</TableHead>
            <TableHead>Added</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium flex items-center gap-1.5">
                  {r.full_name || "—"}
                  {isSelf(r) && <Badge variant="outline" className="text-[10px]">You</Badge>}
                </div>
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
              <TableCell>
                {r.login_enabled === false
                  ? <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                  : <Badge variant="outline" className="text-[10px]">Enabled</Badge>}
              </TableCell>
              <TableCell className="text-xs">{fd(r.created_at)}</TableCell>
              <TableCell className="text-right space-x-1">
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>Edit</Button>
                    {!isOwner(r.role) && !isSelf(r) && (
                      <Button size="sm" variant="ghost" onClick={() => onPermissions(r)}>Permissions</Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" variant="ghost" onClick={() => onToggle(r)} disabled={isSelf(r)}>
                            {disableAction}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {isSelf(r) && <TooltipContent>You can't disable your own account</TooltipContent>}
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRemove(r)} disabled={isSelf(r)}>Remove</Button>
                        </span>
                      </TooltipTrigger>
                      {isSelf(r) && <TooltipContent>You can't remove your own membership</TooltipContent>}
                    </Tooltip>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No users found</TableCell></TableRow>
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

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);

const ToggleRow = ({ icon: Icon, label, checked, onChange, note }: {
  icon: any; label: string; checked: boolean; onChange: (v: boolean) => void; note?: string;
}) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <div>{label}</div>
        {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
      </div>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);
