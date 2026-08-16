import { supabase } from "@/integrations/supabase/client";
import { adjustProductBatchQty, receiveProductBatch } from "@/lib/productBatches";
import { deleteProductSerial, createProductSerialsBulk } from "@/lib/productSerials";
import { fetchProductUnits, toStockQty, type ProductUnit } from "@/lib/units";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { requireBusinessScope, assertOwnedByBusiness } from "@/lib/businessScope";
import type { ProductTrackingType } from "@/lib/products";
import type { GRNBatchSerialResult } from "@/components/inventory/GRNBatchSerialDialog";

/** Same wording for absent and foreign-company — a UUID probe reveals nothing. */
export const GRN_NOT_FOUND = "Goods receipt not found";

export type GRNStatus = "draft" | "received" | "closed" | "cancelled";

export interface GoodsReceipt {
  id: string;
  business_id: string;
  grn_number: string;
  purchase_order_id: string | null;
  supplier_id: string | null;
  warehouse_id: string | null;
  grn_date: string;
  status: GRNStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined, read-only
  po_number?: string | null;
  supplier_name?: string | null;
  warehouse_name?: string | null;
}

export interface GoodsReceiptItem {
  id: string;
  goods_receipt_id: string;
  purchase_order_item_id: string | null;
  product_id: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  shortage_qty: number;
  accepted_qty: number;
  pending_qty: number;
  short_qty: number;
  excess_qty: number;
  quality_remarks: string | null;
  qc_status: string | null;
  qc_reason_category: string | null;
  unit_id: string | null;
  stock_accepted_qty: number | null;
  stock_shortage_qty: number | null;
  stock_received_qty: number | null;
  bin_id: string | null;
  // joined, read-only
  product_name?: string;
  part_number?: string;
  tracking_type?: ProductTrackingType;
  batch_numbers?: string[];
  serial_numbers?: string[];
}

export async function fetchGoodsReceipts(businessId: string): Promise<GoodsReceipt[]> {
  const { data, error } = await supabase
    .from("goods_receipts")
    .select("*, purchase_orders(po_number), parties(name), warehouses(warehouse_name)")
    .eq("business_id", businessId)
    .order("grn_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    po_number: r.purchase_orders?.po_number ?? null,
    supplier_name: r.parties?.name ?? null,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
  })) as GoodsReceipt[];
}

export async function fetchGoodsReceipt(id: string, businessId?: string | null): Promise<GoodsReceipt> {
  const biz = requireBusinessScope(businessId, GRN_NOT_FOUND);
  const { data, error } = await supabase
    .from("goods_receipts")
    .select("*, purchase_orders(po_number), parties(name), warehouses(warehouse_name)")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(GRN_NOT_FOUND);
  const r = data as any;
  return {
    ...r,
    po_number: r.purchase_orders?.po_number ?? null,
    supplier_name: r.parties?.name ?? null,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
  } as GoodsReceipt;
}

/**
 * Cancel a GRN, reversing everything grn_apply_stock() applied on receipt:
 * - Decrements products.stock by each item's accepted_qty.
 * - Reverses batch qty top-ups (goods_receipt_item_batches) and deletes
 *   serials this GRN created (goods_receipt_item_serials) -- serials are
 *   newly minted by receiving, unlike dispatch which flips existing ones,
 *   so cancelling deletes them rather than reverting a status.
 * - Recomputes the linked PO's status from its remaining non-cancelled GRNs.
 * Blocks if a non-cancelled Purchase Invoice was generated from this GRN --
 * cancel that first (same "block, don't cascade" stance as the delete-time
 * DB trigger, kept consistent between delete and cancel).
 */
export async function cancelGRN(grnId: string, businessId?: string | null): Promise<void> {
  // Cancelling a GRN reverses received stock, so ownership is proven first —
  // otherwise a raw GRN UUID moved another company's inventory.
  await assertOwnedByBusiness("goods_receipts", grnId, businessId, GRN_NOT_FOUND);

  const { data: linkedInvoice } = await supabase
    .from("purchase_invoices")
    .select("invoice_number")
    .eq("goods_receipt_id", grnId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (linkedInvoice) {
    throw new Error(`This GRN is linked to Purchase Invoice ${(linkedInvoice as any).invoice_number}. Cancel the invoice first.`);
  }

  const { data: grn, error: grnErr } = await supabase
    .from("goods_receipts")
    .select("status, purchase_order_id")
    .eq("id", grnId)
    .single();
  if (grnErr) throw grnErr;
  if (!grn) throw new Error("GRN not found.");
  if (grn.status === "cancelled") throw new Error("GRN already cancelled.");

  const { data: rawItems, error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .select(`
      product_id, accepted_qty, damaged_qty, shortage_qty,
      goods_receipt_item_batches(batch_id, qty),
      goods_receipt_item_serials(serial_id)
    `)
    .eq("goods_receipt_id", grnId);
  if (itemsErr) throw itemsErr;

  for (const item of (rawItems ?? []) as any[]) {
    if (item.product_id) {
      const heldQty = Number(item.damaged_qty ?? 0) + Number(item.shortage_qty ?? 0);
      if (Number(item.accepted_qty) > 0 || heldQty > 0) {
        const { data: product } = await supabase.from("products").select("stock, stock_on_hold").eq("id", item.product_id).single();
        const stockBefore = Number(product?.stock) || 0;
        const holdBefore = Number((product as any)?.stock_on_hold) || 0;
        // Mirrors the rest of this function: a plain balance update, no
        // inventory_movements row (this GRN-cancel path has never logged
        // movements even for the accepted-qty reversal above it).
        await supabase.from("products").update({
          stock: Math.max(0, stockBefore - Number(item.accepted_qty)),
          stock_on_hold: Math.max(0, holdBefore - heldQty),
        } as any).eq("id", item.product_id);
      }
    }
    for (const b of item.goods_receipt_item_batches ?? []) {
      await adjustProductBatchQty(b.batch_id, -Number(b.qty));
    }
    for (const s of item.goods_receipt_item_serials ?? []) {
      await deleteProductSerial(s.serial_id);
    }
  }

  if (grn.purchase_order_id) {
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("qty")
      .eq("purchase_order_id", grn.purchase_order_id);
    const totalOrdered = (poItems ?? []).reduce((s: number, r: any) => s + Number(r.qty), 0);

    const { data: otherGrns } = await supabase
      .from("goods_receipts")
      .select("id")
      .eq("purchase_order_id", grn.purchase_order_id)
      .eq("status", "received")
      .neq("id", grnId);
    const otherGrnIds = (otherGrns ?? []).map((g: any) => g.id);

    let totalAccepted = 0;
    if (otherGrnIds.length) {
      const { data: otherItems } = await supabase
        .from("goods_receipt_items")
        .select("accepted_qty")
        .in("goods_receipt_id", otherGrnIds);
      totalAccepted = (otherItems ?? []).reduce((s: number, r: any) => s + Number(r.accepted_qty), 0);
    }

    // "ordered" is the resting state for a confirmed PO with zero goods
    // received -- we don't know the exact pre-receipt status (draft/
    // pending_approval/approved/ordered), so this is the closest reasonable
    // rollback rather than leaving it incorrectly at "received".
    const newStatus =
      totalAccepted >= totalOrdered && totalOrdered > 0 ? "received"
      : totalAccepted > 0 ? "partially_received"
      : "ordered";

    await supabase.from("purchase_orders").update({ status: newStatus } as any).eq("id", grn.purchase_order_id);
  }

  const { error: updErr } = await supabase.from("goods_receipts").update({ status: "cancelled" }).eq("id", grnId);
  if (updErr) throw updErr;
}

export async function fetchGoodsReceiptItems(goodsReceiptId: string, businessId?: string | null): Promise<GoodsReceiptItem[]> {
  // goods_receipt_items ownership runs through the parent GRN.
  await assertOwnedByBusiness("goods_receipts", goodsReceiptId, businessId, GRN_NOT_FOUND);
  const { data, error } = await supabase
    .from("goods_receipt_items")
    .select(`*, products(name, part_number, tracking_type),
      goods_receipt_item_batches(product_batches(batch_number)),
      goods_receipt_item_serials(product_serials(serial_number))`)
    .eq("goods_receipt_id", goodsReceiptId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    product_name: r.products?.name ?? "Unknown Product",
    part_number: r.products?.part_number ?? "N/A",
    tracking_type: (r.products?.tracking_type as ProductTrackingType) ?? "none",
    batch_numbers: (r.goods_receipt_item_batches ?? []).map((b: any) => b.product_batches?.batch_number).filter(Boolean),
    serial_numbers: (r.goods_receipt_item_serials ?? []).map((s: any) => s.product_serials?.serial_number).filter(Boolean),
  })) as GoodsReceiptItem[];
}

// ─── Line shape shared by the create/edit page and saveGRN() ──────────────────

export interface GRNLine {
  id?: string;
  purchase_order_item_id: string | null;
  product_id: string;
  product_name: string;
  part_number: string;
  tracking_type: ProductTrackingType;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  /** Physical-verification shortage within received_qty — distinct from short_qty (ordered vs received PO gap). */
  shortage_qty: number;
  accepted_qty: number;
  pending_qty: number;
  short_qty: number;
  excess_qty: number;
  quality_remarks: string;
  qc_reason_category: string | null;
  unit_id: string | null;
  stock_accepted_qty: number | null;
  stock_shortage_qty: number | null;
  stock_received_qty: number | null;
  /** Put-away bin. Null = auto (product's default bin, else the warehouse's Unassigned bin). */
  bin_id: string | null;
  tracking?: GRNBatchSerialResult;
}

/**
 * Pending items for a PO, capped to what's actually still owed — same
 * "ordered minus already-received-across-all-received-GRNs" computation
 * PurchaseGRN.tsx already did inline, extracted here so saveGRN() can
 * reuse it for the "received qty can't exceed pending" guard instead of
 * trusting whatever the client sends.
 */
export async function fetchPendingPOItemsForGRN(poId: string): Promise<GRNLine[]> {
  const { data: priorReceipts } = await supabase
    .from("goods_receipt_items")
    .select("product_id, accepted_qty, goods_receipts!inner(purchase_order_id, status)")
    .eq("goods_receipts.purchase_order_id", poId)
    .eq("goods_receipts.status", "received");

  const receivedMap = new Map<string, number>();
  (priorReceipts ?? []).forEach((r: any) => {
    receivedMap.set(r.product_id, (receivedMap.get(r.product_id) ?? 0) + Number(r.accepted_qty ?? 0));
  });

  const { data: poItems, error } = await supabase
    .from("purchase_order_items")
    .select(`id, product_id, qty, unit_id, product:products(name, part_number, tracking_type)`)
    .eq("purchase_order_id", poId);
  if (error) throw error;

  const productIds = [...new Set((poItems ?? []).map((i: any) => i.product_id).filter(Boolean))];
  const puByProduct: Record<string, ProductUnit[]> = {};
  await Promise.all(
    productIds.map(async (pid: string) => {
      try { puByProduct[pid] = await fetchProductUnits(pid); } catch { puByProduct[pid] = []; }
    }),
  );

  return (poItems ?? [])
    .map((item: any): GRNLine => {
      const ordered = Number(item.qty);
      const alreadyReceived = receivedMap.get(item.product_id) ?? 0;
      const remaining = Math.max(0, ordered - alreadyReceived);
      const pu = puByProduct[item.product_id] ?? [];
      return {
        purchase_order_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product?.name || "Unknown Product",
        part_number: item.product?.part_number || "N/A",
        tracking_type: (item.product?.tracking_type as ProductTrackingType) ?? "none",
        ordered_qty: remaining,
        received_qty: remaining,
        damaged_qty: 0,
        shortage_qty: 0,
        accepted_qty: remaining,
        pending_qty: 0,
        short_qty: 0,
        excess_qty: 0,
        quality_remarks: "",
        qc_reason_category: null,
        unit_id: item.unit_id ?? null,
        stock_accepted_qty: pu.length ? toStockQty(remaining, item.unit_id, pu) : null,
        stock_shortage_qty: null,
        stock_received_qty: pu.length ? toStockQty(remaining, item.unit_id, pu) : null,
        bin_id: null,
      };
    })
    .filter((it) => it.ordered_qty > 0);
}

// ─── Activity log ───────────────────────────────────────────────────────────
// Mirrors po_activity_logs / logPOActivity / fetchPOActivityLogs in
// src/lib/purchaseOrders.ts — same shape, scoped to goods_receipt_id.

export interface GRNActivityLog {
  id: string;
  user_id: string;
  goods_receipt_id: string;
  action: string;
  description: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function logGRNActivity(input: {
  userId: string;
  goodsReceiptId: string;
  action: string;
  description?: string;
  oldData?: any;
  newData?: any;
}): Promise<void> {
  await supabase.from("grn_activity_logs" as any).insert({
    user_id: input.userId,
    goods_receipt_id: input.goodsReceiptId,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  });
}

export async function fetchGRNActivityLogs(goodsReceiptId: string): Promise<GRNActivityLog[]> {
  const { data, error } = await supabase
    .from("grn_activity_logs" as any)
    .select("*")
    .eq("goods_receipt_id", goodsReceiptId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as GRNActivityLog[];
}

// ─── Save / Delete ──────────────────────────────────────────────────────────

export interface SaveGRNInput {
  userId: string;
  id?: string;
  grn_number: string;
  purchase_order_id: string | null;
  supplier_id: string;
  warehouse_id: string;
  grn_date: string;
  remarks: string | null;
  status: "draft" | "received";
  items: GRNLine[];
}

/** Reverses the batch/serial records a set of GRN items created — used by
 *  both deleteGRN() and saveGRN()'s re-edit path. Deliberately does NOT
 *  touch products.stock/stock_on_hold: those are only ever written by
 *  grn_item_apply_hold_stock() once status='received', so a draft (the
 *  only thing either caller ever operates on) never touched them either. */
async function reverseGRNItemTracking(goodsReceiptId: string): Promise<void> {
  const { data: rawItems, error } = await supabase
    .from("goods_receipt_items")
    .select(`goods_receipt_item_batches(batch_id, qty), goods_receipt_item_serials(serial_id)`)
    .eq("goods_receipt_id", goodsReceiptId);
  if (error) throw error;
  for (const item of (rawItems ?? []) as any[]) {
    for (const b of item.goods_receipt_item_batches ?? []) {
      await adjustProductBatchQty(b.batch_id, -Number(b.qty));
    }
    for (const s of item.goods_receipt_item_serials ?? []) {
      await deleteProductSerial(s.serial_id);
    }
  }
}

/**
 * Create-or-update a GRN. Only ever allowed to *edit* while the existing
 * row is still 'draft' -- once posted ('received'), the record is locked
 * (matches the Draft-editable/Posted-locked convention already used for
 * Sales Return/Orders/PO this session; use cancelGRN() to reverse a posted
 * GRN instead of re-saving it).
 *
 * Items are always deleted and freshly reinserted, exactly like
 * savePurchaseOrder()/saveOrder() already do -- this isn't a new pattern,
 * and it's *why* posting a draft works at all without touching the
 * existing grn_item_apply_hold_stock trigger: that trigger only fires
 * AFTER INSERT, so flipping status to 'received' on the header and then
 * freshly inserting the (possibly-edited) item rows is what makes it fire
 * and apply stock, with zero changes to the trigger itself.
 */
export async function saveGRN(input: SaveGRNInput): Promise<GoodsReceipt> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  // Received qty must never exceed what the PO still actually owes --
  // re-derive the true pending ceiling server-side rather than trusting
  // whatever the client computed, in case another GRN was posted against
  // the same PO in the meantime.
  if (input.purchase_order_id) {
    // fetchPendingPOItemsForGRN only counts *other* GRNs already in
    // 'received' status against this PO -- a draft (create or re-edit,
    // doesn't matter which) was never 'received', so its own qty was
    // never subtracted out of this ceiling in the first place. No special
    // casing needed between create and edit.
    const pending = await fetchPendingPOItemsForGRN(input.purchase_order_id);
    const pendingByProduct = new Map(pending.map((p) => [p.product_id, p.ordered_qty]));
    for (const it of input.items) {
      const ceiling = pendingByProduct.get(it.product_id);
      if (ceiling !== undefined && Number(it.received_qty) > ceiling + 1e-6) {
        throw new Error(`${it.part_number}: received qty (${it.received_qty}) can't exceed the PO's pending qty (${ceiling}).`);
      }
    }
  }

  let grnId = input.id;
  if (grnId) {
    const { data: existing, error: existingErr } = await supabase
      .from("goods_receipts")
      .select("status")
      .eq("id", grnId)
      .single();
    if (existingErr) throw existingErr;
    if (existing.status !== "draft") {
      throw new Error("Only a draft GRN can be edited. Cancel it and create a new one instead.");
    }

    await reverseGRNItemTracking(grnId);
    await supabase.from("goods_receipt_items").delete().eq("goods_receipt_id", grnId);

    const { error } = await supabase
      .from("goods_receipts")
      .update({
        grn_number: input.grn_number,
        purchase_order_id: input.purchase_order_id,
        supplier_id: input.supplier_id,
        warehouse_id: input.warehouse_id,
        grn_date: input.grn_date,
        remarks: input.remarks,
        status: input.status,
      })
      .eq("id", grnId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("goods_receipts")
      .insert({
        business_id: businessId,
        grn_number: input.grn_number,
        purchase_order_id: input.purchase_order_id,
        supplier_id: input.supplier_id,
        warehouse_id: input.warehouse_id,
        grn_date: input.grn_date,
        status: input.status,
        remarks: input.remarks,
        created_by: input.userId,
      })
      .select()
      .single();
    if (error) throw error;
    grnId = data.id;
  }

  // Stock (available + on-hold), inventory_movements logging, QC status,
  // and PO status/qty rollup are all handled server-side by the
  // grn_item_apply_hold_stock trigger the moment each row lands --
  // unchanged, not duplicated here.
  // Inserted one row at a time (not a single bulk insert) so each item's
  // returned id can be matched back to it exactly -- a bulk insert's
  // RETURNING order isn't guaranteed to match input order, and ordering by
  // created_at doesn't disambiguate rows inserted in the same statement.
  for (const item of input.items) {
    const { data: inserted, error: itemError } = await supabase
      .from("goods_receipt_items")
      .insert({
        goods_receipt_id: grnId!,
        purchase_order_item_id: item.purchase_order_item_id,
        product_id: item.product_id,
        ordered_qty: item.ordered_qty,
        received_qty: item.received_qty,
        damaged_qty: item.damaged_qty,
        shortage_qty: item.shortage_qty,
        accepted_qty: item.accepted_qty,
        pending_qty: item.pending_qty,
        short_qty: item.short_qty,
        excess_qty: item.excess_qty,
        quality_remarks: item.quality_remarks || null,
        qc_reason_category: item.qc_reason_category || null,
        unit_id: item.unit_id,
        stock_accepted_qty: item.stock_accepted_qty,
        stock_shortage_qty: item.stock_shortage_qty,
        stock_received_qty: item.stock_received_qty,
        bin_id: item.bin_id ?? null,
      })
      .select("id, product_id")
      .single();
    if (itemError) throw itemError;
    if (!inserted || !item.tracking || item.accepted_qty <= 0) continue;

    // The GRN put-away trigger resolves the actual bin (explicit pick ->
    // product default -> warehouse unassigned) and writes it back onto this
    // row after the INSERT completes -- read it back so batch/serial
    // records land in the bin the stock actually went to, not just
    // whatever (possibly null/auto) bin_id the client sent.
    const { data: resolvedItem } = await supabase
      .from("goods_receipt_items").select("bin_id").eq("id", inserted.id).single();
    const resolvedBinId = (resolvedItem as any)?.bin_id ?? item.bin_id ?? null;

    if (item.tracking_type === "batch" && item.tracking.batch) {
      const batchId = await receiveProductBatch(businessId, {
        product_id: item.product_id,
        warehouse_id: input.warehouse_id,
        bin_id: resolvedBinId,
        batch_number: item.tracking.batch.batch_number,
        mfg_date: item.tracking.batch.mfg_date,
        expiry_date: item.tracking.batch.expiry_date,
        qty: item.accepted_qty,
        notes: null,
      });
      await supabase.from("goods_receipt_item_batches" as never).insert({
        business_id: businessId,
        goods_receipt_item_id: inserted.id,
        batch_id: batchId,
        qty: item.accepted_qty,
      } as never);
    } else if (item.tracking_type === "serial" && item.tracking.serial_numbers?.length) {
      const serialIds = await createProductSerialsBulk(
        businessId,
        { product_id: item.product_id, warehouse_id: input.warehouse_id, bin_id: resolvedBinId, status: "in_stock", received_at: input.grn_date, notes: null },
        item.tracking.serial_numbers,
      );
      const rows = serialIds.map((serial_id) => ({
        business_id: businessId,
        goods_receipt_item_id: inserted.id,
        serial_id,
      }));
      if (rows.length) await supabase.from("goods_receipt_item_serials" as never).insert(rows as never);
    }
  }

  return fetchGoodsReceipt(grnId!);
}

/**
 * Hard delete — allowed for a draft GRN or an already-cancelled one (a
 * posted/received GRN has live stock applied via the trigger; use
 * cancelGRN() to reverse that first, matching the Draft-delete/Posted-cancel
 * convention used everywhere else, and mirroring deletePurchaseInvoice()
 * which likewise only unlocks once status is 'cancelled'). The existing
 * prevent_grn_delete_with_active_documents trigger blocks this at the DB
 * level if a live Purchase Invoice still references the GRN -- not
 * duplicated here.
 *
 * Only a draft's batch/serial records need reversing here
 * (receiveProductBatch() bumps real product_batches.qty unconditionally
 * regardless of GRN status, so a draft can already hold live batch
 * inventory). A cancelled GRN already had that same reversal done by
 * cancelGRN() at cancel-time -- redoing it here would double-decrement
 * batch qty.
 */
export async function deleteGRN(grnId: string, businessId?: string | null): Promise<void> {
  const biz = requireBusinessScope(businessId, GRN_NOT_FOUND);
  const { data: grn, error: fetchErr } = await supabase
    .from("goods_receipts")
    .select("status")
    .eq("id", grnId)
    .eq("business_id", biz)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!grn) throw new Error(GRN_NOT_FOUND);
  if (grn.status !== "draft" && grn.status !== "cancelled") {
    throw new Error("Only a draft or cancelled GRN can be deleted directly. Cancel it first.");
  }

  if (grn.status === "draft") {
    await reverseGRNItemTracking(grnId);
  }
  await supabase.from("goods_receipt_items").delete().eq("goods_receipt_id", grnId);
  const { error } = await supabase.from("goods_receipts").delete().eq("id", grnId);
  if (error) throw error;
}

/**
 * Clone a GRN as a new draft — mirrors duplicatePurchaseOrder(). Does NOT
 * carry over batch/serial selections (those are tied to specific physical
 * receipts); the user re-confirms tracking details when they post the
 * clone, same as a genuinely new receipt would require.
 */
export async function duplicateGRN(id: string, userId: string): Promise<GoodsReceipt> {
  const original = await fetchGoodsReceipt(id);
  const items = await fetchGoodsReceiptItems(id);
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const { data: grnNo } = await supabase.rpc("next_grn_number", { _business_id: businessId } as any);
  const grnNumber = (grnNo as string) || `GRN-${Date.now().toString().slice(-6)}`;

  const { data, error } = await supabase
    .from("goods_receipts")
    .insert({
      business_id: businessId,
      grn_number: grnNumber,
      purchase_order_id: original.purchase_order_id,
      supplier_id: original.supplier_id,
      warehouse_id: original.warehouse_id,
      grn_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      remarks: original.remarks,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  const cloned = data as GoodsReceipt;

  if (items.length) {
    const rows = items.map((it) => ({
      goods_receipt_id: cloned.id,
      purchase_order_item_id: it.purchase_order_item_id,
      product_id: it.product_id,
      ordered_qty: it.ordered_qty,
      received_qty: it.received_qty,
      damaged_qty: it.damaged_qty,
      shortage_qty: it.shortage_qty,
      accepted_qty: it.accepted_qty,
      pending_qty: it.pending_qty,
      short_qty: it.short_qty,
      excess_qty: it.excess_qty,
      quality_remarks: it.quality_remarks,
      qc_reason_category: it.qc_reason_category,
      unit_id: it.unit_id,
      stock_accepted_qty: it.stock_accepted_qty,
      stock_shortage_qty: it.stock_shortage_qty,
      stock_received_qty: it.stock_received_qty,
    }));
    const { error: itemsErr } = await supabase.from("goods_receipt_items").insert(rows);
    if (itemsErr) throw itemsErr;
  }

  await logGRNActivity({ userId, goodsReceiptId: cloned.id, action: "duplicated", description: `From ${original.grn_number}` });

  return cloned;
}
