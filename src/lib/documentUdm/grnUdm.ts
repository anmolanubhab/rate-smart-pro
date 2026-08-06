// GRN (Goods Receipt Note) -> DocumentUdm bridge (Phase 4 migration, fix +
// first migration). PurchaseGRN.tsx's print was broken before this: its
// editable DocumentGridTable is print:hidden with no
// DocumentGridPrintTable counterpart, so printing produced a page with the
// title, raw form inputs, and the 4-box totals summary, but NO line items
// at all. GRN also never read print_profiles.
//
// GRN carries no pricing (ordered/received/damaged/accepted/pending/short/
// excess qty only — no rate/gst/amount fields exist on GRNLine), so the
// UDM's `qty` column is set to accepted_qty (what actually entered stock —
// the single most meaningful number for a receipt document) and the fuller
// ordered/received/damaged breakdown is appended to the description text,
// since PrintItem has no multi-qty-column concept to hold all seven values
// as separate columns.

import { supabase } from "@/integrations/supabase/client";
import type { GRNLine, GRNStatus } from "@/lib/goodsReceipts";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export interface GRNPrintInput {
  businessId: string;
  grnNumber: string;
  grnDate: string;
  remarks?: string | null;
  status: GRNStatus;
  supplierId: string | null;
  items: GRNLine[];
  unitLabel?: (unitId: string | null | undefined) => string;
}

export async function buildGRNUdm(input: GRNPrintInput): Promise<DocumentUdm> {
  const { businessId, grnNumber, grnDate, remarks, status, supplierId, items, unitLabel } = input;

  const [{ data: biz }, { data: supplier }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    supplierId
      ? supabase.from("parties").select("name, phone, address, gst").eq("id", supplierId).maybeSingle()
      : Promise.resolve({ data: null as { name?: string; phone?: string; address?: string; gst?: string } | null }),
    fetchDefaultPrintProfile(businessId, "grn"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];

  return {
    kind: "document",
    documentTypeId: "grn",
    status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    party: {
      name: supplier?.name ?? "—",
      mobile: supplier?.phone ?? null,
      address: supplier?.address ?? null,
      gstNo: supplier?.gst ?? null,
    },
    header: {
      number: grnNumber,
      numberLabel: "GRN No",
      date: grnDate,
      narration: remarks ?? null,
    },
    items: items.map((it) => ({
      partNumber: it.part_number ?? "",
      description: `${it.product_name}  (Ordered ${it.ordered_qty} · Received ${it.received_qty} · Damaged ${it.damaged_qty})`,
      qty: Number(it.accepted_qty) || 0,
      unit: unitLabel?.(it.unit_id) ?? undefined,
    })),
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
