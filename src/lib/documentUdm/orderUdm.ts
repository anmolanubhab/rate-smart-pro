// Sales Order -> DocumentUdm bridge (Phase 4 migration). CreateOrder.tsx was
// a pure toggle-mode page (its own inline DocumentGridPrintTable, never read
// print_profiles) — this is the first time Sales Order gets a real,
// business-configurable print profile. Takes the page's live component
// state directly, same pattern as quotationUdm.ts. "Rack" (UI-only, never
// persisted) is carried in the UDM's `warehouse` column.

import { supabase } from "@/integrations/supabase/client";
import type { Party } from "@/lib/parties";
import type { OrderItem, OrderStatus } from "@/lib/orders";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export type OrderRow = OrderItem & { hsn?: string; rack?: string };

export interface OrderPrintInput {
  businessId: string;
  orderNumber: string;
  orderDate: string;
  refNo?: string | null;
  status: OrderStatus;
  party: Party | null;
  items: OrderRow[];
  unitLabel?: (unitId: string | null | undefined) => string;
}

export async function buildOrderUdm(input: OrderPrintInput): Promise<DocumentUdm> {
  const { businessId, orderNumber, orderDate, refNo, status, party, items, unitLabel } = input;

  const [{ data: biz }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    fetchDefaultPrintProfile(businessId, "sales_order"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];

  const taxable = items.reduce((s, it) => s + (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const subtotal = items.reduce((s, it) => s + (Number(it.mrp) || 0) * (Number(it.qty) || 0), 0);
  const gstTotal = items.reduce((s, it) => s + (Number(it.total) || 0) - (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const grandTotal = taxable + gstTotal;

  return {
    kind: "document",
    documentTypeId: "sales_order",
    status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    party: {
      name: party?.name ?? "—",
      mobile: party?.phone ?? null,
      address: party?.billing_address ?? party?.address ?? null,
      gstNo: party?.gst ?? null,
    },
    header: {
      number: orderNumber,
      numberLabel: "Voucher No",
      date: orderDate,
      refNumber: refNo ?? null,
      refLabel: "Order Received By",
    },
    items: items.map((it) => ({
      partNumber: it.part_number ?? "",
      description: it.description ?? "",
      hsn: it.hsn ?? null,
      qty: Number(it.qty) || 0,
      unit: unitLabel?.(it.unit_id) ?? undefined,
      rate: Number(it.net_rate) || 0,
      gstPct: Number(it.gst_pct) || 0,
      amount: Number(it.total) || 0,
      mrp: Number(it.mrp) || 0,
      discountPct: it.discount_pct != null ? Number(it.discount_pct) : null,
      warehouse: it.rack || null,
    })),
    totals: {
      subtotal,
      discount: subtotal - taxable,
      tax: gstTotal,
      grandTotal: Math.round(grandTotal),
    },
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
