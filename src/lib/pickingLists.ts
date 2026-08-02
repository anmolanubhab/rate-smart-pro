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
  qty_to_pick: number;
  qty_picked: number;
  position: number;
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
    .select("*")
    .eq("picking_list_id", pickingListId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PickingListItem[];
}

/** Order items still pending dispatch for an approved order — the candidate set a new Picking List is created from. */
export async function fetchPendingItemsForOrder(orderId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, part_number, description, rack, qty, dispatched_qty, pending_qty")
    .eq("order_id", orderId);
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((it) => ({
      order_item_id: it.id as string,
      part_number: it.part_number ?? "",
      description: it.description ?? "",
      rack: it.rack ?? null,
      pending_qty: it.pending_qty != null ? Number(it.pending_qty) : Number(it.qty) - Number(it.dispatched_qty ?? 0),
    }))
    .filter((it) => it.pending_qty > 0);
}

export interface CreatePickingListInput {
  userId: string;
  orderId: string;
  partyId: string | null;
  partyName: string | null;
  notes?: string | null;
  items: { order_item_id: string; part_number: string; description: string; rack: string | null; qty_to_pick: number }[];
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

export async function deletePickingList(id: string): Promise<void> {
  const { data: pl, error: le } = await supabase.from("picking_lists" as never).select("order_id").eq("id", id).single();
  if (le) throw le;
  await assertPickingListReversible((pl as any).order_id);

  const { error } = await supabase.from("picking_lists" as never).delete().eq("id", id);
  if (error) throw error;
}
