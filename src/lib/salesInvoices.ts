import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchOrder, fetchOrderItems, computeTotals } from "@/lib/orders";

export interface SalesInvoice {
  id: string;
  user_id: string;
  business_id: string | null;
  invoice_number: string;
  invoice_date: string;
  order_id: string | null;
  party_id: string | null;
  party_name: string | null;
  party_snapshot: any;
  billing_address: string | null;
  shipping_address: string | null;
  salesman: string | null;
  notes: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  status: "draft" | "posted" | "cancelled";
  voucher_id: string | null;
  created_at: string;
}

export async function nextInvoiceNumber(userId: string) {
  const { data, error } = await supabase.rpc("next_invoice_number", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchInvoices(userId: string) {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  const { data, error } = await supabase
    .from("sales_invoices")
    .select("*")
    .eq("business_id", biz)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SalesInvoice[];
}

export async function fetchInvoiceItems(invoiceId: string) {
  const { data, error } = await supabase
    .from("sales_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Generate an invoice from a sales order. Requires the order to exist and not already be invoiced. */
export async function generateInvoiceFromOrder(opts: {
  userId: string;
  businessId: string | null;
  orderId: string;
  requireApproval?: boolean;
}): Promise<SalesInvoice> {
  const order = await fetchOrder(opts.orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") throw new Error("Cannot invoice a cancelled order");
  if ((order as any).invoice_id) throw new Error("Order already invoiced");
  if (opts.requireApproval && order.status !== "approved" && order.status !== "completed") {
    throw new Error("Order must be approved before invoicing");
  }

  const items = await fetchOrderItems(opts.orderId);
  if (!items.length) throw new Error("Order has no items");
  const totals = computeTotals(items as any, order.shipping_charges || 0);

  const invoice_number = await nextInvoiceNumber(opts.userId);
  const status = opts.requireApproval ? "draft" : "posted";

  const { data: inv, error } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: opts.userId,
      business_id: opts.businessId,
      invoice_number,
      invoice_date: new Date().toISOString().slice(0, 10),
      order_id: opts.orderId,
      party_id: order.party_id,
      party_name: order.party_name,
      party_snapshot: order.party_snapshot,
      billing_address: order.billing_address,
      shipping_address: order.shipping_address,
      salesman: order.salesman,
      notes: order.notes,
      remarks: `Generated from ${order.order_number}`,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      shipping_charges: order.shipping_charges || 0,
      grand_total: totals.grand_total,
      status,
    })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map((it: any, idx) => ({
    user_id: opts.userId,
    invoice_id: inv.id,
    product_id: it.product_id,
    part_number: it.part_number,
    description: it.description,
    vehicle_model: it.vehicle_model,
    mrp: it.mrp,
    rate: it.net_rate,
    qty: it.qty,
    discount_pct: it.discount_pct,
    net_rate: it.net_rate,
    gst_pct: it.gst_pct,
    total: it.total,
    position: idx,
  }));
  const { error: e2 } = await supabase.from("sales_invoice_items").insert(rows);
  if (e2) {
    await supabase.from("sales_invoices").delete().eq("id", inv.id);
    throw e2;
  }

  // Link invoice on order + mark invoiced
  await supabase
    .from("orders")
    .update({
      invoice_id: inv.id,
      invoiced_at: new Date().toISOString(),
      status: "invoiced",
    } as any)
    .eq("id", opts.orderId);

  return inv as SalesInvoice;
}

export async function postInvoice(invoiceId: string) {
  const { error } = await supabase
    .from("sales_invoices")
    .update({ status: "posted" })
    .eq("id", invoiceId);
  if (error) throw error;
}

export async function cancelInvoice(invoiceId: string) {
  const { error } = await supabase
    .from("sales_invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId);
  if (error) throw error;
}

export async function deleteInvoice(invoiceId: string) {
  // Delete line items first (FK constraint)
  const { error: e1 } = await supabase
    .from("sales_invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);
  if (e1) throw e1;

  // Reset linked order status back to "approved" if it was invoiced
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("order_id")
    .eq("id", invoiceId)
    .single();

  if (inv?.order_id) {
    await supabase
      .from("orders")
      .update({ invoice_id: null, invoiced_at: null, status: "approved" } as any)
      .eq("id", inv.order_id)
      .eq("status", "invoiced"); // only reset if still marked invoiced
  }

  // Delete the invoice itself
  const { error: e2 } = await supabase
    .from("sales_invoices")
    .delete()
    .eq("id", invoiceId);
  if (e2) throw e2;
}
