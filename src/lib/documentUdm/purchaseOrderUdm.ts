// Purchase Order -> DocumentUdm bridge (Phase 4 migration). Replicates
// CreatePurchaseOrder.tsx's pre-migration handlePrint() exactly: company
// fetched fresh from businesses, party (supplier) reused from already-loaded
// in-memory state (no fresh fetch — matches original behavior), items
// enriched with fetchProductWeights, hsn always null (POItem has no HSN
// field), totals rounded to match the original's `finalTotal`.

import { supabase } from "@/integrations/supabase/client";
import type { PurchaseOrder, POItem } from "@/lib/purchaseOrders";
import type { Party } from "@/lib/parties";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export async function buildPurchaseOrderUdm(po: PurchaseOrder, items: POItem[], supplier: Party | null): Promise<DocumentUdm> {
  const [{ data: biz }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", po.business_id).maybeSingle(),
    fetchDefaultPrintProfile(po.business_id, "purchase_order"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const weights = await fetchProductWeights(items.map((it) => it.product_id));

  const subtotal = Number(po.subtotal) || 0;
  const discount = Number(po.discount_total) || 0;
  const tax = Number(po.tax_total) || 0;

  return {
    kind: "document",
    documentTypeId: "purchase_order",
    status: po.status,
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
      number: po.po_number,
      numberLabel: "PO No",
      date: po.po_date,
    },
    items: items.map((it) => ({
      partNumber: it.part_number ?? "",
      description: it.description ?? "",
      hsn: null,
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
      gstPct: Number(it.gst_percent) || 0,
      amount: Number(it.total_amount) || 0,
      discountPct: it.discount_percent != null ? Number(it.discount_percent) : null,
      weight: it.product_id ? weights.get(it.product_id) ?? null : null,
    })),
    totals: {
      subtotal,
      discount,
      tax,
      grandTotal: Math.round(po.grand_total),
    },
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status: po.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
