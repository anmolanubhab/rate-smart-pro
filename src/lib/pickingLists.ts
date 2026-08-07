import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type PickingListStatus = "pending" | "picked" | "cancelled";

export interface PickingList {
  id: string;
  business_id: string;
  user_id: string;
  order_id: string;
  order_number?: string;
  party_id: string | null;
  party_name: string | null;
  picking_number: string;
  picking_date: string;
  status: PickingListStatus;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickingListItem {
  id: string;
  picking_list_id: string;
  order_item_id: string | null;
  part_number: string;
  description: string;
  rack: string | null;
  bin_id: string | null;
  qty_to_pick: number;
  qty_picked: number;
  position: number;
  bin?: { location_code: string | null } | null;
}

export async function nextPickingNumber(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_picking_number", { _business_id: businessId } as any);
  if (error || !data) return `PICK-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export async function fetchPickingLists(businessId: string): Promise<PickingList[]> {
  const { data, error } = await supabase
    .from("picking_lists" as never)
    .select("*, orders(order_number)")
    .eq("business_id", businessId)
    .order("picking_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({ ...row, order_number: row.orders?.order_number ?? null })) as unknown as PickingList[];
}

export async function fetchPickingListItems(pickingListId: string): Promise<PickingListItem[]> {
  const { data, error } = await supabase
    .from("picking_list_items" as never)
    .select("*, bin:warehouse_bins(location_code)")
    .eq("picking_list_id", pickingListId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PickingListItem[];
}

/**
 * Order items still pending dispatch for an approved order — the candidate
 * set a new Picking List is created from. Resolves each product's default
 * bin and returns candidates pre-sorted by that bin's location_code —
 * see the migration header comment for why this (not real route
 * optimization) is what "walk order" means here.
 */
export async function fetchPendingItemsForOrder(orderId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, product_id, part_number, description, rack, qty, dispatched_qty, pending_qty")
    .eq("order_id", orderId);
  if (error) throw error;
  const rows = ((data ?? []) as any[])
    .map((it) => ({
      order_item_id: it.id as string,
      product_id: it.product_id as string | null,
      part_number: it.part_number ?? "",
      description: it.description ?? "",
      rack: it.rack ?? null,
      pending_qty: it.pending_qty != null ? Number(it.pending_qty) : Number(it.qty) - Number(it.dispatched_qty ?? 0),
    }))
    .filter((it) => it.pending_qty > 0);

  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  const binByProduct = new Map<string, { bin_id: string; location_code: string | null }>();
  if (productIds.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id, default_bin_id, bin:warehouse_bins(id, location_code)")
      .in("id", productIds);
    ((products ?? []) as any[]).forEach((p) => {
      if (p.default_bin_id) binByProduct.set(p.id, { bin_id: p.default_bin_id, location_code: p.bin?.location_code ?? null });
    });
  }

  return rows
    .map((r) => ({ ...r, bin_id: binByProduct.get(r.product_id ?? "")?.bin_id ?? null, location_code: binByProduct.get(r.product_id ?? "")?.location_code ?? null }))
    .sort((a, b) => {
      // Products with no resolved bin sort last — nothing to walk to.
      if (a.location_code === b.location_code) return 0;
      if (a.location_code === null) return 1;
      if (b.location_code === null) return -1;
      return a.location_code.localeCompare(b.location_code);
    });
}

export interface CreatePickingListInput {
  userId: string;
  orderId: string;
  partyId: string | null;
  partyName: string | null;
  notes?: string | null;
  items: { order_item_id: string; part_number: string; description: string; rack: string | null; bin_id?: string | null; qty_to_pick: number }[];
}

export async function createPickingList(input: CreatePickingListInput): Promise<PickingList> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");
  if (!input.items.length) throw new Error("No pending items to pick for this order");

  const picking_number = await nextPickingNumber(businessId);
  const { data: row, error } = await supabase
    .from("picking_lists" as never)
    .insert({
      business_id: businessId,
      user_id: input.userId,
      created_by: input.userId,
      order_id: input.orderId,
      party_id: input.partyId,
      party_name: input.partyName,
      picking_number,
      notes: input.notes || null,
      status: "pending",
    } as never)
    .select()
    .single();
  if (error) throw error;
  const pickingList = row as unknown as PickingList;

  const rows = input.items.map((it, idx) => ({
    picking_list_id: pickingList.id,
    order_item_id: it.order_item_id,
    part_number: it.part_number,
    description: it.description,
    rack: it.rack,
    bin_id: it.bin_id ?? null,
    qty_to_pick: it.qty_to_pick,
    qty_picked: 0,
    position: idx,
  }));
  const { error: itemsErr } = await supabase.from("picking_list_items" as never).insert(rows as never);
  if (itemsErr) throw itemsErr;

  return pickingList;
}

export async function markItemPicked(itemId: string, qtyPicked: number): Promise<void> {
  const { error } = await supabase.from("picking_list_items" as never).update({ qty_picked: qtyPicked } as never).eq("id", itemId);
  if (error) throw error;
}

/** Marks the list 'picked' once every line has qty_picked >= qty_to_pick. */
export async function completePickingList(pickingListId: string, userId?: string): Promise<void> {
  const items = await fetchPickingListItems(pickingListId);
  const allPicked = items.every((it) => Number(it.qty_picked) >= Number(it.qty_to_pick));
  if (!allPicked) throw new Error("All items must be fully picked before completing this picking list");

  const { error } = await supabase
    .from("picking_lists" as never)
    .update({ status: "picked", ...(userId ? { updated_by: userId } : {}) } as never)
    .eq("id", pickingListId);
  if (error) throw error;
}

/** A picking list stays reversible until a Dispatch has been raised against its order. */
async function assertPickingListReversible(orderId: string): Promise<void> {
  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("dispatch_number")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (dispatch) {
    throw new Error(`This Picking List's order already has Dispatch ${(dispatch as any).dispatch_number}. Cancel the dispatch first.`);
  }
}

export async function cancelPickingList(id: string, reason: string, userId: string): Promise<void> {
  const { data: pl, error: le } = await supabase.from("picking_lists" as never).select("order_id, status").eq("id", id).single();
  if (le) throw le;
  if ((pl as any).status === "cancelled") throw new Error("Picking list already cancelled");
  await assertPickingListReversible((pl as any).order_id);

  const { error } = await supabase
    .from("picking_lists" as never)
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: reason || null, cancelled_by: userId, updated_by: userId } as never)
    .eq("id", id);
  if (error) throw error;
}

export interface BulkPickingListOrderInput {
  orderId: string;
  orderNumber: string;
  partyId: string | null;
  partyName: string | null;
  items: { order_item_id: string; part_number: string; description: string; rack: string | null; qty_to_pick: number }[];
}

/** Orders (from the given set) that already have a non-cancelled picking list — used to skip duplicates in a bulk create. */
export async function fetchOrdersWithOpenPickingList(orderIds: string[]): Promise<Set<string>> {
  if (!orderIds.length) return new Set();
  const { data, error } = await supabase
    .from("picking_lists" as never)
    .select("order_id")
    .in("order_id", orderIds)
    .neq("status", "cancelled");
  if (error) throw error;
  return new Set(((data ?? []) as any[]).map((r) => r.order_id as string));
}

/**
 * Creates one Picking List per order (the schema ties a picking list to a
 * single order — there's no multi-order picking_lists row). Orders that
 * already have an open picking list, or have no pending items, are skipped
 * rather than erroring the whole batch.
 */
export async function bulkCreatePickingLists(
  userId: string,
  orders: BulkPickingListOrderInput[],
): Promise<{ created: PickingList[]; skipped: { orderNumber: string; reason: string }[] }> {
  const existing = await fetchOrdersWithOpenPickingList(orders.map((o) => o.orderId));
  const created: PickingList[] = [];
  const skipped: { orderNumber: string; reason: string }[] = [];
  for (const o of orders) {
    if (existing.has(o.orderId)) {
      skipped.push({ orderNumber: o.orderNumber, reason: "already has an open picking list" });
      continue;
    }
    if (!o.items.length) {
      skipped.push({ orderNumber: o.orderNumber, reason: "no pending items" });
      continue;
    }
    const pl = await createPickingList({ userId, orderId: o.orderId, partyId: o.partyId, partyName: o.partyName, items: o.items });
    created.push(pl);
  }
  return { created, skipped };
}

export async function deletePickingList(id: string): Promise<void> {
  const { data: pl, error: le } = await supabase.from("picking_lists" as never).select("order_id").eq("id", id).single();
  if (le) throw le;
  await assertPickingListReversible((pl as any).order_id);

  const { error } = await supabase.from("picking_lists" as never).delete().eq("id", id);
  if (error) throw error;
}
