// Dispatch (Delivery Challan + Packing Slip) -> DocumentUdm bridges (Phase 4
// migration). Replicates Dispatch.tsx's pre-migration printChallan()/
// printPackingSlip() exactly — same dispatch_items query, same company/party
// fetch, same meta fields (challan gets transport details, packing slip
// gets a synthesized purpose string from box/case/remarks instead).

import { supabase } from "@/integrations/supabase/client";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export interface DispatchLike {
  id: string;
  dispatch_number: string;
  dispatch_date: string;
  status?: string | null;
  warehouse_id?: string | null;
  transporter?: string | null;
  transport_name?: string | null;
  vehicle_number?: string | null;
  lr_number?: string | null;
  eway_number?: string | null;
  box_count?: number | null;
  case_count?: number | null;
  packing_remarks?: string | null;
  orders?: { order_number?: string | null; party_id?: string | null; party_name?: string | null } | null;
}

async function fetchDispatchBasics(d: DispatchLike, businessId: string, warehouseName: (id: string | null | undefined) => string | null) {
  const [{ data: items }, { data: biz }, { data: party }] = await Promise.all([
    supabase.from("dispatch_items").select("part_number, product_name, dispatched_qty, order_items(part_number, description)").eq("dispatch_id", d.id),
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number").eq("id", businessId).maybeSingle(),
    d.orders?.party_id
      ? supabase.from("parties").select("name, address, phone, gst").eq("id", d.orders.party_id).maybeSingle()
      : Promise.resolve({ data: null as { name?: string; address?: string; phone?: string; gst?: string } | null }),
  ]);

  return {
    company: {
      name: biz?.business_name ?? "—",
      addressLines: [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[],
      gstin: biz?.gst_number ?? null,
    },
    party: {
      name: party?.name ?? d.orders?.party_name ?? "—",
      address: party?.address ?? null,
      mobile: party?.phone ?? null,
      gstNo: party?.gst ?? null,
    },
    items: ((items ?? []) as { part_number?: string | null; product_name?: string | null; dispatched_qty?: number | null; order_items?: { part_number?: string | null; description?: string | null } | null }[]).map((it) => ({
      partNumber: it.part_number ?? it.order_items?.part_number ?? "",
      description: it.product_name ?? it.order_items?.description ?? "",
      qty: Number(it.dispatched_qty) || 0,
      warehouse: warehouseName(d.warehouse_id),
    })),
  };
}

export async function buildDeliveryChallanUdm(d: DispatchLike, businessId: string, warehouseName: (id: string | null | undefined) => string | null): Promise<DocumentUdm> {
  const [basics, profile] = await Promise.all([
    fetchDispatchBasics(d, businessId, warehouseName),
    fetchDefaultPrintProfile(businessId, "delivery_challan"),
  ]);
  return {
    kind: "document",
    documentTypeId: "delivery_challan",
    status: d.status,
    company: basics.company,
    party: basics.party,
    header: {
      number: d.dispatch_number,
      numberLabel: "Challan No",
      date: d.dispatch_date,
      refNumber: d.orders?.order_number ?? null,
      refLabel: "Order No",
      transporter: d.transporter ?? d.transport_name ?? null,
      vehicleNumber: d.vehicle_number ?? null,
      lrNumber: d.lr_number ?? null,
      ewayNumber: d.eway_number ?? null,
    },
    items: basics.items,
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status: d.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}

export async function buildPackingSlipUdm(d: DispatchLike, businessId: string, warehouseName: (id: string | null | undefined) => string | null): Promise<DocumentUdm> {
  const [basics, profile] = await Promise.all([
    fetchDispatchBasics(d, businessId, warehouseName),
    fetchDefaultPrintProfile(businessId, "packing_slip"),
  ]);
  const packingParts = [
    d.box_count ? `Boxes: ${d.box_count}` : null,
    d.case_count ? `Cases: ${d.case_count}` : null,
    d.packing_remarks || null,
  ].filter(Boolean);
  const sections = profileToUdmSections(profile);
  if (packingParts.length) sections.purpose = packingParts.join(" · ");

  return {
    kind: "document",
    documentTypeId: "packing_slip",
    status: d.status,
    company: basics.company,
    party: basics.party,
    header: {
      number: d.dispatch_number,
      numberLabel: "Packing Slip No",
      date: d.dispatch_date,
      refNumber: d.orders?.order_number ?? null,
      refLabel: "Order No",
    },
    items: basics.items,
    sections,
    watermark: resolveWatermark({ status: d.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
