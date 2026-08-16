// Business-scoping primitives for single-record service operations.
//
// WHY THIS EXISTS
// RD-Pro has two distinct security boundaries, and only one of them can live
// in the database:
//
//   Boundary A — membership. "May this user touch this company at all?"
//     Enforced by RLS (is_business_member / has_business_role). Correct, and
//     it blocks a non-member outright.
//
//   Boundary B — active business. "Of the companies this user DOES belong to,
//     which one is this operation being performed against?"
//     RLS cannot answer this: a user who owns two companies is a legitimate
//     member of both, so the database returns either row happily. Verified
//     live — with company A active, a raw client read AND updated company B's
//     order through RLS without error. Boundary B is therefore the service
//     layer's job, and this module is where it is expressed.
//
// Every single-record lookup on a business-owned table must go through here
// (or apply the same .eq("business_id", …) filter itself). A bare
// `.eq("id", id)` is the bug pattern: it was how /orders/edit/<other-company-
// order-id> loaded another company's order under the wrong letterhead.

import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

/**
 * Deliberately identical for "no such record" and "belongs to another
 * company". Distinguishing them would let a caller probe UUIDs to discover
 * that some other business holds one.
 */
export const RECORD_NOT_FOUND = "Record not found";

/**
 * Resolves the business a scoped operation must be confined to.
 *
 * Callers that carry their own context (portal identities, invoice generation,
 * anything acting on a specific company rather than "the current one") pass it
 * explicitly. Everything else falls back to the active business. A caller with
 * no resolvable business context is refused rather than silently querying
 * unscoped — that fallback is precisely what made the original bug reachable.
 */
export function requireBusinessScope(businessId?: string | null, notFoundMessage?: string): string {
  const biz = businessId ?? getActiveBusinessIdSync();
  // Modules pass their own wording (ORDER_NOT_FOUND, DISPATCH_NOT_FOUND) so a
  // missing business context is reported identically to a cross-business or
  // absent record within that module — one indistinguishable failure mode.
  if (!biz) throw new Error(notFoundMessage ?? RECORD_NOT_FOUND);
  return biz;
}

/**
 * Load one row of a business-owned table, confined to `businessId`
 * (default: the active business).
 *
 * @param notFoundMessage lets a module keep its own wording (ORDER_NOT_FOUND,
 *        INVOICE_NOT_FOUND) while sharing this implementation.
 */
export async function fetchScopedById<T>(
  table: string,
  id: string,
  businessId?: string | null,
  opts?: { select?: string; notFoundMessage?: string }
): Promise<T> {
  const notFound = opts?.notFoundMessage ?? RECORD_NOT_FOUND;
  const biz = businessId ?? getActiveBusinessIdSync();
  if (!biz) throw new Error(notFound);

  const { data, error } = await supabase
    .from(table as never)
    .select((opts?.select ?? "*") as never)
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(notFound);
  return data as T;
}

/**
 * Prove that `id` belongs to the scoped business before operating on its
 * children, for child tables that carry no business_id of their own
 * (order_items, price_list_items, dispatch_items …). Ownership is established
 * through the parent rather than duplicated onto every child row.
 *
 * Returns nothing on success; throws the not-found message otherwise.
 */
export async function assertOwnedByBusiness(
  table: string,
  id: string,
  businessId?: string | null,
  notFoundMessage?: string
): Promise<void> {
  const notFound = notFoundMessage ?? RECORD_NOT_FOUND;
  const biz = businessId ?? getActiveBusinessIdSync();
  if (!biz) throw new Error(notFound);

  const { data, error } = await supabase
    .from(table as never)
    .select("id")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(notFound);
}
