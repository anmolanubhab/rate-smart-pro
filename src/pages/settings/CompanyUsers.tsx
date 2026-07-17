import { supabase } from "@/integrations/supabase/client";
import type { BusinessRole } from "@/hooks/useBusiness";

// NOTE: business_user_invitations and the RPCs below were added in the
// Phase 1 migration (20260707000000_phase1_invitations_login_control.sql)
// and are not yet in the generated Supabase types — following the existing
// codebase convention (see original CompanyUsers.tsx), we cast with
// `as never` / `as any` at the call site instead of hand-editing the
// generated types.ts file.

export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired" | "revoked";

export type Invitation = {
  id: string;
  business_id: string;
  email: string | null;
  mobile: string | null;
  full_name: string | null;
  role: BusinessRole;
  department: string | null;
  notes: string | null;
  token: string;
  status: InvitationStatus;
  login_enabled: boolean;
  invited_by: string;
  invited_at: string;
  last_sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
};

export type LoginControlSettings = {
  login_enabled: boolean;
  allow_mobile_login: boolean;
  allow_desktop_login: boolean;
  require_password_change: boolean;
  require_2fa: boolean;
  single_session_only: boolean;
  office_only_login: boolean;
  registered_device_only: boolean;
  max_devices: number | null;
  office_hours_start: string | null;
  office_hours_end: string | null;
  allowed_days: string[] | null;
};

export const defaultLoginControl: LoginControlSettings = {
  login_enabled: true,
  allow_mobile_login: true,
  allow_desktop_login: true,
  require_password_change: false,
  require_2fa: false,
  single_session_only: false,
  office_only_login: false,
  registered_device_only: false,
  max_devices: null,
  office_hours_start: null,
  office_hours_end: null,
  allowed_days: null,
};

export async function listInvitations(businessId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("business_user_invitations" as never)
    .select("id, business_id, email, mobile, full_name, role, department, notes, token, status, login_enabled, invited_by, invited_at, last_sent_at, expires_at, accepted_at, accepted_user_id")
    .eq("business_id", businessId)
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Invitation[]) ?? [];
}

export async function sendInvitation(input: {
  business_id: string; email: string; mobile?: string; role: BusinessRole;
  department?: string; notes?: string; full_name?: string; login_enabled?: boolean;
}) {
  const { data, error } = await supabase.rpc("add_business_user_by_contact" as never, {
    _business_id: input.business_id,
    _email: input.email.trim() || null,
    _mobile: input.mobile?.trim() || null,
    _role: input.role,
    _department: input.department?.trim() || null,
    _notes: input.notes?.trim() || null,
    _full_name: input.full_name?.trim() || null,
    _login_enabled: input.login_enabled ?? true,
  } as never);
  if (error) throw error;
  return data as unknown as { outcome: "member_added" | "invited"; membership_id?: string; invitation_id?: string; token?: string; user_id?: string };
}

export async function resendInvitation(invitationId: string) {
  const { data, error } = await supabase.rpc("resend_invitation" as never, { _invitation_id: invitationId } as never);
  if (error) throw error;
  return data as unknown as { invitation_id: string; token: string };
}

export async function cancelInvitation(invitationId: string) {
  const { error } = await supabase.rpc("revoke_invitation" as never, { _invitation_id: invitationId } as never);
  if (error) throw error;
}

export async function deleteInvitation(invitationId: string) {
  const { error } = await supabase.rpc("delete_invitation" as never, { _invitation_id: invitationId } as never);
  if (error) throw error;
}

export function invitationLink(token: string): string {
  return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function getInvitationByToken(token: string) {
  const { data, error } = await supabase.rpc("get_invitation_by_token" as never, { _token: token } as never);
  if (error) throw error;
  return data as unknown as {
    found: boolean; status?: InvitationStatus; email?: string; full_name?: string;
    role?: BusinessRole; department?: string; business_name?: string; expires_at?: string;
  };
}

export async function acceptInvitation(token: string) {
  const { data, error } = await supabase.rpc("accept_invitation" as never, { _token: token } as never);
  if (error) throw error;
  return data as unknown as { business_id: string; membership_id?: string; already_member: boolean };
}

export async function rejectInvitation(token: string) {
  const { error } = await supabase.rpc("reject_invitation" as never, { _token: token } as never);
  if (error) throw error;
}

/** Option B — instant account creation with a system-generated temporary password. */
export async function createUserWithTempPassword(input: {
  business_id: string; email: string; full_name?: string; mobile?: string;
  role: BusinessRole; department?: string; notes?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("create-user-with-temp-password", {
    body: input,
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) throw error;
  return data as { membership_id: string; temp_password: string | null; existing_account: boolean };
}

/** Update login-control settings for an existing membership row. */
export async function updateLoginControl(membershipId: string, settings: Partial<LoginControlSettings>) {
  const { error } = await supabase.from("business_users").update(settings as never).eq("id", membershipId);
  if (error) throw error;
}
