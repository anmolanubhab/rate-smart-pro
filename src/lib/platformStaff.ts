import { supabase } from "@/integrations/supabase/client";

// P5: the platform_staff_status enum carries five states. Only "active" can
// enter the console — PlatformGuard/PlatformLogin test `status !== "active"`,
// which stays correct for every non-active state.
export type PlatformStaffStatus = "active" | "suspended" | "invited" | "locked" | "inactive";

export const PLATFORM_STAFF_STATUSES: PlatformStaffStatus[] =
  ["active", "invited", "suspended", "locked", "inactive"];
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired" | "revoked";

export interface PlatformStaffRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  designation: string | null;
  phone: string | null;
  notes: string | null;
  department_id: string | null;
  manager_id: string | null;
  status: PlatformStaffStatus;
  last_active_at: string | null;
  last_login_at: string | null;
  failed_login_count: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformStaffInvitationRow {
  id: string;
  email: string;
  full_name: string | null;
  designation: string | null;
  department_id: string | null;
  manager_id: string | null;
  role_id: string;
  invited_by: string;
  status: InvitationStatus;
  invited_at: string;
  expires_at: string;
}

// platform_* tables are not in the generated Supabase types yet; cast to keep TS happy.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => any }).rpc(name, args);

export interface StaffFilters {
  departmentId?: string;
  teamId?: string;
  roleId?: string;
  managerId?: string;
  status?: PlatformStaffStatus;
  search?: string;
}

export async function listStaff(filters: StaffFilters = {}): Promise<PlatformStaffRow[]> {
  let q = tbl("platform_staff").select("*");
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.managerId) q = q.eq("manager_id", filters.managerId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.search) {
    const s = filters.search.trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  q = q.order("full_name", { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as PlatformStaffRow[];

  if (filters.roleId) {
    const { data: staffRoles, error: srErr } = await tbl("platform_staff_roles")
      .select("staff_id")
      .eq("role_id", filters.roleId);
    if (srErr) throw srErr;
    const ids = new Set((staffRoles ?? []).map((r: { staff_id: string }) => r.staff_id));
    rows = rows.filter((r) => ids.has(r.id));
  }
  if (filters.teamId) {
    const { data: staffTeams, error: stErr } = await tbl("platform_staff_teams")
      .select("staff_id")
      .eq("team_id", filters.teamId);
    if (stErr) throw stErr;
    const ids = new Set((staffTeams ?? []).map((r: { staff_id: string }) => r.staff_id));
    rows = rows.filter((r) => ids.has(r.id));
  }
  return rows;
}

export async function getStaffDetail(id: string) {
  const { data: staff, error } = await tbl("platform_staff").select("*").eq("id", id).single();
  if (error) throw error;

  const { data: roleRows, error: rolesErr } = await tbl("platform_staff_roles")
    .select("role_id, platform_roles(id,name,level)")
    .eq("staff_id", id);
  if (rolesErr) throw rolesErr;

  const { data: teamRows, error: teamsErr } = await tbl("platform_staff_teams")
    .select("team_id, platform_teams(id,name)")
    .eq("staff_id", id);
  if (teamsErr) throw teamsErr;

  return {
    staff: staff as PlatformStaffRow,
    roles: ((roleRows ?? []) as unknown as { platform_roles: { id: string; name: string; level: number } }[])
      .map((r) => r.platform_roles),
    teams: ((teamRows ?? []) as unknown as { platform_teams: { id: string; name: string } }[])
      .map((r) => r.platform_teams),
  };
}

export async function updateStaffProfile(id: string, patch: Partial<PlatformStaffRow>): Promise<void> {
  const { error } = await tbl("platform_staff").update(patch).eq("id", id);
  if (error) throw error;
}

export async function assignRole(staffId: string, roleId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await tbl("platform_staff_roles").insert({
    staff_id: staffId,
    role_id: roleId,
    assigned_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function removeRole(staffId: string, roleId: string): Promise<void> {
  const { error } = await tbl("platform_staff_roles").delete().eq("staff_id", staffId).eq("role_id", roleId);
  if (error) throw error;
}

export async function deactivateStaff(id: string): Promise<void> {
  const { error } = await tbl("platform_staff").update({ status: "suspended" }).eq("id", id);
  if (error) throw error;
}

export async function reactivateStaff(id: string): Promise<void> {
  const { error } = await tbl("platform_staff").update({ status: "active" }).eq("id", id);
  if (error) throw error;
}

// P5: clearing a lockout must also clear what caused it, otherwise the next
// failed attempt re-locks the account immediately.
export async function unlockStaff(id: string): Promise<void> {
  const { error } = await tbl("platform_staff")
    .update({ status: "active", failed_login_count: 0, locked_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function listStaffActivity(staffId: string, limit = 50) {
  const { data, error } = await tbl("platform_audit_logs")
    .select("*")
    .eq("entity_type", "platform_staff")
    .eq("entity_id", staffId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ── Invitations ──────────────────────────────────────────────────────────

export interface InviteStaffInput {
  email: string;
  role_id: string;
  full_name?: string;
  designation?: string;
  department_id?: string;
  manager_id?: string;
  expires_days?: number;
}

export async function inviteStaff(input: InviteStaffInput): Promise<{ outcome: string; invitation_id: string; token: string }> {
  const { data, error } = await rpc("invite_platform_staff", {
    _email: input.email,
    _role_id: input.role_id,
    _full_name: input.full_name ?? null,
    _designation: input.designation ?? null,
    _department_id: input.department_id ?? null,
    _manager_id: input.manager_id ?? null,
    _expires_days: input.expires_days ?? 7,
  });
  if (error) throw error;
  return data;
}

export async function resendInvite(invitationId: string) {
  const { data, error } = await rpc("resend_platform_staff_invitation", { _invitation_id: invitationId });
  if (error) throw error;
  return data;
}

export async function revokeInvite(invitationId: string): Promise<void> {
  const { error } = await rpc("revoke_platform_staff_invitation", { _invitation_id: invitationId });
  if (error) throw error;
}

export async function listInvitations(status?: InvitationStatus | InvitationStatus[]): Promise<PlatformStaffInvitationRow[]> {
  let q = tbl("platform_staff_invitations").select("*");
  if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
  q = q.order("invited_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PlatformStaffInvitationRow[];
}

export function invitationLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/platform/accept-invite?token=${token}`;
}

export async function getInvitationByToken(token: string) {
  const { data, error } = await rpc("get_platform_staff_invitation_by_token", { _token: token });
  if (error) throw error;
  return data as {
    found: boolean;
    status?: InvitationStatus;
    email?: string;
    full_name?: string | null;
    designation?: string | null;
    role_name?: string | null;
    department_name?: string | null;
    expires_at?: string;
  };
}

export async function acceptInvite(token: string): Promise<{ staff_id: string }> {
  const { data, error } = await rpc("accept_platform_staff_invitation", { _token: token });
  if (error) throw error;
  return data;
}
