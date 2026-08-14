/**
 * effectiveTransactions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single TS entrypoint for the "Effective Transaction / Stock Movement / Ledger
 * Posting" mechanism (Tally-style voucher lifecycle redesign, Phase 0).
 *
 * Backing DB objects (see supabase/migrations/20260814091000_document_lifecycle_ssot.sql
 * and 20260814093000_effective_views.sql):
 *   - vw_document_lifecycle / vw_document_lifecycle_min: normalized draft/posted/cancelled
 *     status across all 11 source document types.
 *   - vw_effective_stock_movements: inventory_movements filtered to only rows whose
 *     source document is currently posted (or has no tracked source at all).
 *   - vw_effective_voucher_postings: voucher_items filtered to status='posted'.
 *   - effective_stock_on_hand() / reconcile_effective_stock() / check_movement_integrity():
 *     read-only RPCs.
 *
 * Phase 0 ships this module dark -- nothing in the app calls it yet. Phase 1 wires
 * cancelDocument() in documentLifecycle.ts on top of the lifecycle view; Phase 4
 * (a later session) repoints report screens onto fetchEffectiveStockOnHand().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Matches the doc_type branches in vw_document_lifecycle. */
export type DocType =
  | "sales_invoice"
  | "purchase_invoice"
  | "sales_return"
  | "purchase_return"
  | "payment_entry"
  | "supplier_payment"
  | "dispatch"
  | "goods_receipt"
  | "inventory_adjustment"
  | "stock_take_sheet"
  | "voucher";

export type LifecycleStatus = "draft" | "posted" | "cancelled";

export interface DocumentLifecycle {
  docType: DocType;
  docId: string;
  businessId: string;
  docNumber: string | null;
  docDate: string | null;
  lifecycleStatus: LifecycleStatus;
  voucherId: string | null;
  partyId: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelledReason: string | null;
}

export interface EffectiveStockRow {
  productId: string;
  warehouseId: string | null;
  qty: number;
  value: number;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Fetches the normalized lifecycle row for one document. Returns null if the
 *  document doesn't exist (or isn't visible under RLS). */
export async function fetchDocumentLifecycle(
  docType: DocType,
  docId: string
): Promise<DocumentLifecycle | null> {
  const { data, error } = await supabase
    .from("vw_document_lifecycle" as any)
    .select("*")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  return {
    docType: row.doc_type,
    docId: row.doc_id,
    businessId: row.business_id,
    docNumber: row.doc_number ?? null,
    docDate: row.doc_date ?? null,
    lifecycleStatus: row.lifecycle_status,
    voucherId: row.voucher_id ?? null,
    partyId: row.party_id ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelledBy: row.cancelled_by ?? null,
    cancelledReason: row.cancelled_reason ?? null,
  };
}

/** Wraps the effective_stock_on_hand() RPC -- the SSOT for "what does this
 *  product's stock actually add up to right now", excluding movements
 *  attached to a draft or cancelled document. */
export async function fetchEffectiveStockOnHand(params: {
  businessId: string;
  productId?: string;
  warehouseId?: string;
  asOf?: string; // date, YYYY-MM-DD
}): Promise<EffectiveStockRow[]> {
  const { data, error } = await supabase.rpc("effective_stock_on_hand" as any, {
    _business_id: params.businessId,
    _product_id: params.productId ?? null,
    _warehouse_id: params.warehouseId ?? null,
    _as_of: params.asOf ?? null,
  });

  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    productId: row.product_id,
    warehouseId: row.warehouse_id ?? null,
    qty: Number(row.qty ?? 0),
    value: Number(row.value ?? 0),
  }));
}

/** Diagnostic: products where the legacy products.stock cache disagrees with
 *  the effective-stock SSOT. Read-only; does not correct anything. */
export async function fetchStockReconciliation(businessId: string): Promise<
  Array<{
    productId: string;
    productName: string;
    productsStock: number;
    effectiveQty: number;
    drift: number;
    cause: string;
  }>
> {
  const { data, error } = await supabase.rpc("reconcile_effective_stock" as any, {
    _business_id: businessId,
  });

  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    productsStock: Number(row.products_stock ?? 0),
    effectiveQty: Number(row.effective_qty ?? 0),
    drift: Number(row.drift ?? 0),
    cause: row.cause,
  }));
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** True if a document currently contributes to effective stock/ledger figures.
 *  Pure and unit-testable -- no I/O. */
export function isEffective(lifecycle: Pick<DocumentLifecycle, "lifecycleStatus">): boolean {
  return lifecycle.lifecycleStatus === "posted";
}
