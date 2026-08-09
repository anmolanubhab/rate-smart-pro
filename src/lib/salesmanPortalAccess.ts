import { supabase } from "@/integrations/supabase/client";

// NOTE: portal_users.salesman_id, salesman_portal_invitations, and the RPCs
// below were added in supabase/migrations/20260808090000_salesman_portal_identity.sql
// and are not yet in the generated Supabase types — following the existing
// codebase convention (see src/lib/userAccess.ts), we cast with `as never`/`as any`
// at the call site instead of hand-editing the generated types.ts file.

export type SalesmanPortalStatus = "none" | "invited" | "active";

export type SalesmanPortalAccess = {
  salesman_id: string;
  status: SalesmanPortalStatus;
  email: string | null;
  invitation_id: string | null;
  expires_at: string | null;
};

/** Bulk-fetch portal access status for every salesman in a business, one query each. */
export async function fetchSalesmanPortalAccess(businessId: string): Promise<Record<string, SalesmanPortalAccess>> {
  const [{ data: portalRows, error: portalErr }, { data: inviteRows, error: inviteErr }] = await Promise.all([
    supabase
      .from("portal_users" as never)
      .select("salesman_id, status")
      .eq("business_id", businessId)
      .eq("role", "salesman"),
    supabase
      .from("salesman_portal_invitations" as never)
      .select("id, salesman_id, email, status, expires_at")
      .eq("business_id", businessId)
      .eq("status", "pending"),
  ]);
  if (portalErr) throw portalErr;
  if (inviteErr) throw inviteErr;

  const map: Record<string, SalesmanPortalAccess> = {};
  for (const row of (portalRows as unknown as { salesman_id: string; status: string }[]) ?? []) {
    map[row.salesman_id] = {
      salesman_id: row.salesman_id,
      status: row.status === "active" ? "active" : "none",
      email: null,
      invitation_id: null,
      expires_at: null,
    };
  }
  for (const row of (inviteRows as unknown as { id: string; salesman_id: string; email: string; expires_at: string }[]) ?? []) {
    if (map[row.salesman_id]) continue; // already active, shouldn't normally coexist
    map[row.salesman_id] = {
      salesman_id: row.salesman_id,
      status: "invited",
      email: row.email,
      invitation_id: row.id,
      expires_at: row.expires_at,
    };
  }
  return map;
}

export async function inviteSalesmanToPortal(salesmanId: string, email: string) {
  const { data, error } = await supabase.rpc("invite_salesman_to_portal" as never, {
    _salesman_id: salesmanId,
    _email: email.trim(),
  } as never);
  if (error) throw error;
  return data as unknown as { outcome: "invited" | "access_granted"; invitation_id?: string; token?: string; portal_user_id?: string };
}

export async function resendSalesmanInvitation(invitationId: string) {
  const { data, error } = await supabase.rpc("resend_salesman_invitation" as never, { _invitation_id: invitationId } as never);
  if (error) throw error;
  return data as unknown as { invitation_id: string; token: string };
}

export async function revokeSalesmanInvitation(invitationId: string) {
  const { error } = await supabase.rpc("revoke_salesman_invitation" as never, { _invitation_id: invitationId } as never);
  if (error) throw error;
}

export function salesmanInvitationLink(token: string): string {
  return `${window.location.origin}/salesman/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function getSalesmanInvitationByToken(token: string) {
  const { data, error } = await supabase.rpc("get_salesman_invitation_by_token" as never, { _token: token } as never);
  if (error) throw error;
  return data as unknown as {
    found: boolean; status?: string; email?: string; salesman_name?: string;
    business_name?: string; expires_at?: string;
  };
}

export async function acceptSalesmanInvitation(token: string) {
  const { data, error } = await supabase.rpc("accept_salesman_invitation" as never, { _token: token } as never);
  if (error) throw error;
  return data as unknown as { business_id: string; portal_user_id: string };
}
