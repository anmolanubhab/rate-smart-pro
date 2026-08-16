import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { requireBusinessScope, assertOwnedByBusiness } from "@/lib/businessScope";

/** Same wording for absent and foreign-company — a UUID probe reveals nothing. */
export const SALES_RETURN_NOT_FOUND = "Sales return not found";
import { computeItem, computeTotals, type OrderItem } from "@/lib/orders";
import { cancelSalesReturn as cancelSalesReturnBase } from "@/lib/returns";
import { deleteVoucher } from "@/lib/voucherService";

export type SalesReturnStatus = "draft" | "posted" | "cancelled";

// Same line-item shape as OrderItem — computeItem/computeTotals are reused
// as-is (mirrors how QuotationItem extends OrderItem in src/lib/quotations.ts).
export type SalesReturnItem = OrderItem & {
  id?: string;
  sales_invoice_item_id: string;
  hsn?: string | null;
  batch_id?: string | null;
  reason?: string | null;
  remarks?: string | null;
  // display-only, populated from fetchInvoiceReturnContext — not persisted
  invoiced_qty?: number;
  already_returned_qty?: number;
  available_qty?: number;
  tracking_type?: "none" | "batch" | "serial";
};

export interface SalesReturn {
  id: string;
  business_id: string;
  user_id: string;
  return_number: string;
  return_date: string;
  sales_invoice_id: string;
  party_id: string;
  party_name?: string | null;
  invoice_number?: string | null;
  created_by_name?: string | null;
  warehouse_id: string | null;
  reason: string | null;
  notes: string | null;
  discount_amount: number;
  round_off: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  status: SalesReturnStatus;
  voucher_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function nextSalesReturnNumber(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_sales_return_number", { _business_id: businessId } as any);
  if (error || !data) return `CN-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export async function fetchSalesReturnById(id: string, businessId?: string | null): Promise<SalesReturn> {
  const biz = requireBusinessScope(businessId, SALES_RETURN_NOT_FOUND);
  const { data, error } = await supabase
    .from("sales_returns" as never).select("*")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(SALES_RETURN_NOT_FOUND);
  return data as unknown as SalesReturn;
}

export async function fetchSalesReturnItems(returnId: string, businessId?: string | null): Promise<SalesReturnItem[]> {
  // sales_return_items ownership runs through the parent return.
  await assertOwnedByBusiness("sales_returns", returnId, businessId, SALES_RETURN_NOT_FOUND);
  const { data, error } = await supabase
    .from("sales_return_items" as never)
    .select("*")
    .eq("return_id", returnId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SalesReturnItem[];
}

export async function fetchSalesReturns(businessId: string): Promise<SalesReturn[]> {
  const { data, error } = await supabase
    .from("sales_returns" as never)
    .select("*, parties(name), sales_invoices(invoice_number)")
    .eq("business_id", businessId)
    .order("return_date", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];

  // sales_returns.user_id has no FK to profiles, so it can't be embedded in
  // the query above — resolve creator names with a separate lookup instead.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const namesById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
    for (const p of (profiles ?? []) as any[]) {
      namesById[p.id] = p.full_name || p.email || p.id;
    }
  }

  return rows.map((r) => ({
    ...r,
    party_name: r.parties?.name ?? null,
    invoice_number: r.sales_invoices?.invoice_number ?? null,
    created_by_name: namesById[r.user_id] ?? null,
  })) as unknown as SalesReturn[];
}

/**
 * Already-returned qty per sales_invoice_item_id, counting only POSTED
 * returns. Deliberately NOT the shared fetchSalesReturnedQty() in
 * src/lib/returns.ts — that one sums every sales_return_items row
 * regardless of status, which was fine when every return posted
 * immediately (no draft/cancelled rows existed to over-count), but would
 * now wrongly count draft-in-progress and cancelled returns against a
 * line's availability.
 */
async function fetchPostedReturnedQty(invoiceItemIds: string[]): Promise<Record<string, number>> {
  if (!invoiceItemIds.length) return {};
  const { data, error } = await supabase
    .from("sales_return_items" as never)
    .select("sales_invoice_item_id, qty, sales_returns!inner(status)")
    .in("sales_invoice_item_id", invoiceItemIds)
    .eq("sales_returns.status", "posted");
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    out[row.sales_invoice_item_id] = (out[row.sales_invoice_item_id] ?? 0) + Number(row.qty);
  }
  return out;
}

export interface ReturnableInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  grand_total: number;
  paid_amount: number;
  salesman: string | null;
  remarks: string | null;
  dispatch_id: string | null;
}

/** Posted invoices for a party that still have returnable qty on at least one line — enforces "different party's invoice can't be picked" (by construction, caller passes the selected party) and "fully-returned invoice can't be picked again". */
export async function fetchInvoicesForParty(businessId: string, partyId: string): Promise<ReturnableInvoice[]> {
  const { data, error } = await supabase
    .from("sales_invoices")
    .select("id, invoice_number, invoice_date, grand_total, paid_amount, salesman, remarks, dispatch_id")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "posted")
    .order("invoice_date", { ascending: false });
  if (error) throw error;
  const invoices = (data ?? []) as ReturnableInvoice[];
  if (!invoices.length) return [];

  const { data: items, error: itemsErr } = await supabase
    .from("sales_invoice_items")
    .select("id, invoice_id, qty")
    .in("invoice_id", invoices.map((i) => i.id));
  if (itemsErr) throw itemsErr;

  const returned = await fetchPostedReturnedQty(((items ?? []) as any[]).map((it) => it.id));
  const remainingByInvoice = new Map<string, number>();
  for (const it of (items ?? []) as any[]) {
    const rem = Number(it.qty) - (returned[it.id] ?? 0);
    remainingByInvoice.set(it.invoice_id, (remainingByInvoice.get(it.invoice_id) ?? 0) + Math.max(0, rem));
  }
  return invoices.filter((i) => (remainingByInvoice.get(i.id) ?? 0) > 0);
}

export interface InvoiceReturnContext {
  invoice: ReturnableInvoice & { party_id: string; party_name: string | null };
  warehouse_id: string | null;
  warehouse_name: string | null;
  transport_name: string | null;
  lr_number: string | null;
  lines: SalesReturnItem[];
}

/** "Auto-load everything on invoice select" — header context + the full return-candidate item grid. */
export async function fetchInvoiceReturnContext(invoiceId: string): Promise<InvoiceReturnContext> {
  const { data: inv, error: invErr } = await supabase
    .from("sales_invoices")
    .select("id, invoice_number, invoice_date, grand_total, paid_amount, salesman, remarks, dispatch_id, party_id, party_name")
    .eq("id", invoiceId)
    .single();
  if (invErr) throw invErr;

  let warehouse_id: string | null = null, warehouse_name: string | null = null, transport_name: string | null = null, lr_number: string | null = null;
  if ((inv as any).dispatch_id) {
    const { data: disp } = await supabase
      .from("dispatches")
      .select("warehouse_id, transport_name, lr_number, warehouses(warehouse_name)")
      .eq("id", (inv as any).dispatch_id)
      .maybeSingle();
    if (disp) {
      warehouse_id = (disp as any).warehouse_id ?? null;
      warehouse_name = (disp as any).warehouses?.warehouse_name ?? null;
      transport_name = (disp as any).transport_name ?? null;
      lr_number = (disp as any).lr_number ?? null;
    }
  }

  const { data: items, error: itemsErr } = await supabase
    .from("sales_invoice_items")
    .select("id, product_id, part_number, description, vehicle_model, hsn, mrp, net_rate, rate, gst_pct, discount_pct, unit_id, qty, products(tracking_type)")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (itemsErr) throw itemsErr;

  const returned = await fetchPostedReturnedQty(((items ?? []) as any[]).map((it) => it.id));
  const lines: SalesReturnItem[] = ((items ?? []) as any[]).map((it) => {
    const already = returned[it.id] ?? 0;
    const invoicedQty = Number(it.qty) || 0;
    const availableQty = Math.max(0, invoicedQty - already);
    return {
      ...computeItem({
        product_id: it.product_id,
        part_number: it.part_number ?? "",
        description: it.description ?? "",
        vehicle_model: it.vehicle_model,
        mrp: Number(it.mrp) || 0,
        qty: 0, // return qty starts at 0 — user enters how much is coming back
        discount_pct: Number(it.discount_pct) || 0,
        gst_pct: Number(it.gst_pct) || 0,
        unit_id: it.unit_id ?? null,
      }),
      // computeItem recomputes net_rate from mrp/discount — override with the
      // invoice line's own net_rate so a return doesn't drift from what was
      // actually billed.
      net_rate: Number(it.net_rate ?? it.rate) || 0,
      rate: Number(it.net_rate ?? it.rate) || 0,
      sales_invoice_item_id: it.id,
      hsn: it.hsn ?? null,
      batch_id: null,
      invoiced_qty: invoicedQty,
      already_returned_qty: already,
      available_qty: availableQty,
      tracking_type: it.products?.tracking_type ?? "none",
    };
  });

  return { invoice: inv as any, warehouse_id, warehouse_name, transport_name, lr_number, lines };
}

export interface SaveSalesReturnInput {
  userId: string;
  id?: string;
  return_date: string;
  sales_invoice_id: string;
  party_id: string;
  warehouse_id?: string | null;
  reason?: string | null;
  notes?: string | null;
  items: SalesReturnItem[];
}

/** Create-or-update, always status='draft' — zero stock/voucher side effects. Mirrors saveQuotation()'s optional-id shape in src/lib/quotations.ts. */
export async function saveSalesReturnDraft(input: SaveSalesReturnInput): Promise<SalesReturn> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  let returnId = input.id;
  const validItems = input.items.filter((it) => it.sales_invoice_item_id && Number(it.qty) > 0);

  if (!returnId) {
    const number = await nextSalesReturnNumber(businessId);
    const { data, error } = await supabase
      .from("sales_returns" as never)
      .insert({
        business_id: businessId,
        user_id: input.userId,
        created_by: input.userId,
        return_number: number,
        return_date: input.return_date,
        sales_invoice_id: input.sales_invoice_id,
        party_id: input.party_id,
        warehouse_id: input.warehouse_id ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        status: "draft",
      } as never)
      .select()
      .single();
    if (error) throw error;
    returnId = (data as any).id;
    await logReturnActivity({ userId: input.userId, returnId: returnId!, businessId, action: "created", description: `Return ${number} created as draft` });
  } else {
    const { data: existing, error: fe } = await supabase.from("sales_returns" as never).select("status").eq("id", returnId).single();
    if (fe) throw fe;
    if ((existing as any).status !== "draft") {
      throw new Error("Only draft returns can be edited. Cancel a posted return and create a new one instead.");
    }
    const { error } = await supabase
      .from("sales_returns" as never)
      .update({
        updated_by: input.userId,
        return_date: input.return_date,
        sales_invoice_id: input.sales_invoice_id,
        party_id: input.party_id,
        warehouse_id: input.warehouse_id ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
      } as never)
      .eq("id", returnId)
      .eq("status", "draft");
    if (error) throw error;
    await supabase.from("sales_return_items" as never).delete().eq("return_id", returnId);
    await logReturnActivity({ userId: input.userId, returnId, businessId, action: "edited", description: "Draft updated" });
  }

  if (validItems.length) {
    const rows = validItems.map((it, idx) => ({
      return_id: returnId,
      sales_invoice_item_id: it.sales_invoice_item_id,
      business_id: businessId,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      qty: it.qty,
      rate: it.net_rate,
      discount_pct: it.discount_pct,
      gst_pct: it.gst_pct,
      hsn: it.hsn ?? null,
      unit_id: it.unit_id ?? null,
      batch_id: it.batch_id ?? null,
      reason: it.reason ?? null,
      remarks: it.remarks ?? null,
      line_total: it.total,
      position: idx,
    }));
    const { error } = await supabase.from("sales_return_items" as never).insert(rows as never);
    if (error) throw error;
  }

  return fetchSalesReturnById(returnId!);
}

/** Posts an already-saved draft: stock reversal (+ batch qty for batch-tracked lines), inventory_movements, Credit Note voucher — all inside post_sales_return (SECURITY DEFINER). */
export async function postSalesReturn(returnId: string, businessId?: string | null): Promise<void> {
  // Posting a return puts stock back and creates a Credit Note voucher, so
  // ownership is proven before the RPC runs.
  await assertOwnedByBusiness("sales_returns", returnId, businessId, SALES_RETURN_NOT_FOUND);
  const { error } = await supabase.rpc("post_sales_return" as never, { _return_id: returnId } as never);
  if (error) throw error;
}

/** Cancel a posted return — thin wrapper around the shared cancelReturn() in src/lib/returns.ts (already RLS-fixed and batch-aware), adding the activity-log entry. */
export async function cancelSalesReturn(returnId: string, userId?: string): Promise<void> {
  await cancelSalesReturnBase(returnId, userId);
  const businessId = getActiveBusinessIdSync();
  if (businessId) {
    await logReturnActivity({ userId, returnId, businessId, action: "cancelled", description: "Return cancelled" });
  }
}

/**
 * Draft: delete directly. Cancelled: also delete directly (audit trail
 * already captured the cancel). Posted: blocked — must Cancel first.
 * post_sales_return() creates a linked Credit Note voucher alongside the
 * sales_returns row -- deleting only the return row left that voucher
 * (status='cancelled') orphaned forever in Voucher Center / Voucher List /
 * the Financial Adjustment tab, so the linked voucher is deleted first.
 */
export async function deleteSalesReturn(id: string, userId?: string, businessId?: string | null): Promise<void> {
  // Deleting also removes the linked Credit Note voucher, so ownership is
  // established before anything is touched.
  const biz = requireBusinessScope(businessId, SALES_RETURN_NOT_FOUND);
  const { data: ret, error: le } = await supabase
    .from("sales_returns" as never).select("status, voucher_id")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (le) throw le;
  if (!ret) throw new Error(SALES_RETURN_NOT_FOUND);
  if ((ret as any).status === "posted") {
    throw new Error("This return is posted. Cancel it first, then delete.");
  }
  if ((ret as any).voucher_id && userId) {
    try {
      await deleteVoucher(userId, (ret as any).voucher_id);
    } catch (e: any) {
      console.error("deleteSalesReturn: could not delete linked voucher:", e.message);
    }
  }
  const { data: deleted, error } = await supabase.from("sales_returns" as never).delete().eq("id", id).select("id");
  if (error) throw error;
  if (!deleted || deleted.length === 0) {
    throw new Error("Could not delete return — no permission or it no longer exists.");
  }
}

/** Mirrors duplicateOrder()/duplicateQuotation() — clones as a new draft, never straight to posted. */
export async function duplicateSalesReturn(id: string, userId: string): Promise<SalesReturn> {
  const original = await fetchSalesReturnById(id);
  const items = await fetchSalesReturnItems(id);
  return saveSalesReturnDraft({
    userId,
    return_date: new Date().toISOString().slice(0, 10),
    sales_invoice_id: original.sales_invoice_id,
    party_id: original.party_id,
    warehouse_id: original.warehouse_id,
    reason: `Duplicated from ${original.return_number}`,
    notes: original.notes,
    items: items.map((it) => ({ ...it, id: undefined })),
  });
}

export interface ReturnActivityLog {
  id: string;
  return_id: string;
  business_id: string;
  user_id: string | null;
  action: string;
  description: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function logReturnActivity(input: {
  userId?: string;
  returnId: string;
  businessId: string;
  action: string;
  description?: string;
  oldData?: any;
  newData?: any;
}) {
  await supabase.from("sales_return_activity_logs" as never).insert({
    return_id: input.returnId,
    business_id: input.businessId,
    user_id: input.userId ?? null,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  } as never);
}

export async function fetchReturnActivityLog(returnId: string): Promise<ReturnActivityLog[]> {
  const { data, error } = await supabase
    .from("sales_return_activity_logs" as never)
    .select("*")
    .eq("return_id", returnId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ReturnActivityLog[];
}

export interface InvoiceReturnStatus {
  returnedQty: number;
  invoicedQty: number;
  status: "none" | "partial" | "full";
}

/** For the Invoices list's "Returned" column — computed, not stored (avoids the denormalization-drift bug class fixed earlier today). */
export async function fetchReturnedQtyByInvoice(invoiceIds: string[]): Promise<Record<string, InvoiceReturnStatus>> {
  if (!invoiceIds.length) return {};
  const { data: items, error } = await supabase
    .from("sales_invoice_items")
    .select("id, invoice_id, qty")
    .in("invoice_id", invoiceIds);
  if (error) throw error;

  const returned = await fetchPostedReturnedQty(((items ?? []) as any[]).map((it) => it.id));
  const out: Record<string, InvoiceReturnStatus> = {};
  for (const it of (items ?? []) as any[]) {
    const cur = out[it.invoice_id] ?? { returnedQty: 0, invoicedQty: 0, status: "none" as const };
    cur.invoicedQty += Number(it.qty) || 0;
    cur.returnedQty += returned[it.id] ?? 0;
    out[it.invoice_id] = cur;
  }
  for (const key of Object.keys(out)) {
    const r = out[key];
    r.status = r.returnedQty <= 0 ? "none" : r.returnedQty >= r.invoicedQty ? "full" : "partial";
  }
  return out;
}
