// Purchase Invoice -> DocumentUdm bridge (Phase 2 migration). Replicates
// PurchaseInvoiceDetail.tsx's pre-migration handlePrint() data-fetch exactly
// (same company/party/meta/items/totals shape) so DocumentOutputCenter's
// Preview/Direct Print/PDF/Excel render pixel-identical output, now sourced
// from print_profiles instead of being hardcoded, plus a first-ever Excel
// export. Purchase Invoice has no draft state (posts immediately) — its
// status ("unpaid"/"partially_paid"/"paid"/"cancelled") only feeds the
// watermark's cancelled case.

import { supabase } from "@/integrations/supabase/client";
import { fetchInvoiceItems, type PurchaseInvoice, type PurchaseInvoiceItem } from "@/lib/purchaseInvoices";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export async function buildPurchaseInvoiceUdm(invoice: PurchaseInvoice & { supplier_name?: string | null }): Promise<DocumentUdm> {
  const [items, { data: biz }, { data: supplier }, profile] = await Promise.all([
    fetchInvoiceItems(invoice.id),
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", invoice.business_id).maybeSingle(),
    invoice.supplier_id
      ? supabase.from("parties").select("name, phone, address, gst").eq("id", invoice.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchDefaultPrintProfile(invoice.business_id, "purchase_invoice"),
  ]);

  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const weights = await fetchProductWeights(items.map((it: PurchaseInvoiceItem) => it.product_id));

  return {
    kind: "document",
    documentTypeId: "purchase_invoice",
    status: invoice.status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    party: {
      name: supplier?.name ?? invoice.supplier_name ?? "—",
      mobile: supplier?.phone ?? null,
      address: supplier?.address ?? null,
      gstNo: supplier?.gst ?? null,
    },
    header: {
      number: invoice.invoice_number,
      numberLabel: "Invoice No",
      date: invoice.invoice_date,
    },
    items: items.map((it: PurchaseInvoiceItem) => ({
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
      subtotal: invoice.subtotal,
      discount: invoice.discount_total,
      tax: invoice.tax_total,
      grandTotal: invoice.grand_total,
    },
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status: invoice.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
