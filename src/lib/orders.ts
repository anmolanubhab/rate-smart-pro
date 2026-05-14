import { supabase } from "@/integrations/supabase/client";

export type OrderStatus = "draft" | "confirmed" | "cancelled" | "completed";

export interface OrderItem {
  id?: string;
  order_id?: string;
  user_id?: string;
  product_id: string | null;
  part_number: string;
  description: string;
  vehicle_model?: string | null;
  mrp: number;
  qty: number;
  discount_pct: number;
  net_rate: number;
  gst_pct: number;
  total: number;
  position?: number;
}

export interface Order {
  id: string;
  user_id: string;
  order_number: string;
  order_date: string;
  party_id: string | null;
  party_name: string | null;
  party_snapshot: any;
  billing_address: string | null;
  shipping_address: string | null;
  salesman: string | null;
  notes: string | null;
  subtotal: number;
  discount_total: number;
  cd_total: number;
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  status: OrderStatus;
  mode: "RD" | "CD" | null;
  created_at: string;
  updated_at: string;
}

export async function nextOrderNumber(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_order_number", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchOrders(userId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Order[];
}

export function computeItem(item: Partial<OrderItem>): OrderItem {
  const mrp = Number(item.mrp) || 0;
  const qty = Number(item.qty) || 0;
  const disc = Number(item.discount_pct) || 0;
  const gstPct = Number(item.gst_pct) || 0;
  const net = +(mrp * (1 - disc / 100)).toFixed(2);
  const lineNet = +(net * qty).toFixed(2);
  const total = +(lineNet * (1 + gstPct / 100)).toFixed(2);
  return {
    product_id: item.product_id ?? null,
    part_number: item.part_number ?? "",
    description: item.description ?? "",
    vehicle_model: item.vehicle_model ?? null,
    mrp,
    qty,
    discount_pct: disc,
    net_rate: net,
    gst_pct: gstPct,
    total,
    position: item.position,
  };
}

export interface OrderTotals {
  subtotal: number;
  discount_total: number;
  taxable: number;
  gst_total: number;
  grand_total: number;
}

export function computeTotals(items: OrderItem[], shipping = 0): OrderTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxable = 0;
  let gstTotal = 0;
  for (const it of items) {
    const gross = it.mrp * it.qty;
    const lineNet = it.net_rate * it.qty;
    subtotal += gross;
    discountTotal += gross - lineNet;
    taxable += lineNet;
    gstTotal += lineNet * (it.gst_pct / 100);
  }
  const grand = taxable + gstTotal + (shipping || 0);
  const r = (n: number) => +n.toFixed(2);
  return {
    subtotal: r(subtotal),
    discount_total: r(discountTotal),
    taxable: r(taxable),
    gst_total: r(gstTotal),
    grand_total: r(grand),
  };
}
