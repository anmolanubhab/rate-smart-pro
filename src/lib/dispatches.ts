import { supabase } from "@/integrations/supabase/client";

export interface Dispatch {
  id: string;
  user_id: string;
  order_id: string;
  party_id: string | null;
  dispatch_number: string;
  dispatch_date: string;
  notes: string | null;
  created_at: string;
}

export interface DispatchItemInput {
  order_item_id: string;
  dispatched_qty: number;
  rate: number;
}

export async function nextDispatchNumber(userId: string) {
  const { data, error } = await supabase.rpc("next_dispatch_number", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchDispatches(userId: string) {
  const { data, error } = await supabase
    .from("dispatches")
    .select("*, orders(order_number, party_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as any[];
}

export async function createDispatch(input: {
  userId: string;
  orderId: string;
  partyId: string | null;
  dispatchDate: string;
  notes?: string | null;
  items: DispatchItemInput[];
  packing?: {
    box_count?: number;
    case_count?: number;
    packing_remarks?: string | null;
    auto_packing_slip?: boolean;
  };
  transport?: {
    transporter?: string | null;
    lr_number?: string | null;
    vehicle_number?: string | null;
    eway_number?: string | null;
    dispatch_remarks?: string | null;
  };
}) {
  const items = input.items.filter((i) => Number(i.dispatched_qty) > 0);
  if (!items.length) throw new Error("Enter dispatch quantity for at least one item");

  const dispatch_number = await nextDispatchNumber(input.userId);
  let packing_slip_number: string | null = null;
  if (input.packing?.auto_packing_slip) {
    const { data, error } = await supabase.rpc("next_packing_slip_number", { _user_id: input.userId });
    if (error) throw error;
    packing_slip_number = data as string;
  }

  const { data: dispatch, error } = await supabase.from("dispatches").insert({
    user_id: input.userId,
    order_id: input.orderId,
    party_id: input.partyId,
    dispatch_number,
    dispatch_date: input.dispatchDate,
    notes: input.notes ?? null,
    packing_slip_number,
    box_count: input.packing?.box_count ?? 0,
    case_count: input.packing?.case_count ?? 0,
    packing_remarks: input.packing?.packing_remarks ?? null,
    transporter: input.transport?.transporter ?? null,
    lr_number: input.transport?.lr_number ?? null,
    vehicle_number: input.transport?.vehicle_number ?? null,
    eway_number: input.transport?.eway_number ?? null,
    dispatch_remarks: input.transport?.dispatch_remarks ?? null,
  } as any).select().single();
  if (error) throw error;

  const rows = items.map((it) => ({
    user_id: input.userId,
    dispatch_id: dispatch.id,
    order_item_id: it.order_item_id,
    dispatched_qty: it.dispatched_qty,
    rate: it.rate,
    total: +(it.dispatched_qty * it.rate).toFixed(2),
  }));
  const { error: e2 } = await supabase.from("dispatch_items").insert(rows);
  if (e2) {
    await supabase.from("dispatches").delete().eq("id", dispatch.id);
    throw e2;
  }
  return dispatch as Dispatch;
}

export async function fetchDispatchItems(dispatchId: string) {
  const { data, error } = await supabase
    .from("dispatch_items").select("*, order_items(part_number, description)")
    .eq("dispatch_id", dispatchId);
  if (error) throw error;
  return data as any[];
}
