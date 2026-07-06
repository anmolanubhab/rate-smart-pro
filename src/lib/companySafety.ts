import { supabase } from "@/integrations/supabase/client";

/** Re-authenticates the current user with their password.
 *  Returns null on success, or an error message. Silently no-ops if there's no session. */
export async function verifyCurrentPassword(password: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return "No signed-in email on this account.";
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (error) return "Password is incorrect.";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Verification failed.";
  }
}

/** Aggregate transaction/master-data counts for the delete-impact screen. */
export async function fetchCompanyImpactCounts(businessId: string) {
  const tables = [
    "products", "parties", "orders", "order_items",
    "sales_invoices", "dispatches", "vouchers", "voucher_items",
    "inventory_movements", "purchase_orders", "purchase_invoices",
    "ledger_accounts", "business_users",
  ] as const;

  const out: Record<string, number> = {};
  await Promise.all(
    tables.map(async (t) => {
      const { count } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: dynamic table names
        .from(t as any)
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId);
      out[t] = count ?? 0;
    })
  );
  return out;
}

export type Preflight = {
  activeOwners: number;
  pendingApprovals: number;
  activeMembers: number;
  hasPendingDeleteRequest: boolean;
  deleteEligibleAt?: string;
};

export async function fetchDeletePreflight(businessId: string): Promise<Preflight> {
  const [{ count: owners }, { count: approvals }, { count: members }, { data: dr }] = await Promise.all([
    supabase.from("business_users").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).eq("role", "owner").eq("status", "active"),
    supabase.from("approval_requests").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "pending"),
    supabase.from("business_users").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "active"),
    supabase.from("company_delete_requests").select("id, eligible_at")
      .eq("business_id", businessId).eq("status", "pending").maybeSingle(),
  ]);
  return {
    activeOwners: owners ?? 0,
    pendingApprovals: approvals ?? 0,
    activeMembers: members ?? 0,
    hasPendingDeleteRequest: !!dr,
    deleteEligibleAt: dr?.eligible_at,
  };
}

/** Diff two flat objects and return only fields whose values changed. */
export function diffBusiness<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: (keyof T)[],
): Array<{ key: keyof T; old: unknown; next: unknown }> {
  const out: Array<{ key: keyof T; old: unknown; next: unknown }> = [];
  for (const k of keys) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    // eslint-disable-next-line eqeqeq
    if ((a ?? "") != (b ?? "")) out.push({ key: k, old: a, next: b });
  }
  return out;
}
