// Sales Invoice -> DocumentUdm bridge (Phase 2 migration). This is the one
// place a sales_invoices row gets converted into UDM fields — replicates
// Invoices.tsx's pre-migration onPrint() data-fetch exactly (same company/
// party/meta/items/totals shape) so DocumentOutputCenter's Preview/Direct
// Print/PDF/Excel render pixel-identical output to the pre-migration flow,
// now sourced from the business's print_profiles row instead of being
// hardcoded, plus a real Excel export for the first time.

import { supabase } from "@/integrations/supabase/client";
import { fetchInvoiceItems, type SalesInvoice } from "@/lib/salesInvoices";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export async function buildSalesInvoiceUdm(inv: SalesInvoice): Promise<DocumentUdm> {
  const businessId = inv.business_id!;
  const [items, { data: biz }, profile, { data: einvoice }] = await Promise.all([
    fetchInvoiceItems(inv.id),
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    fetchDefaultPrintProfile(businessId, "sales_invoice"),
    supabase.from("einvoice_records").select("signed_qr_code, irn, ack_no, ack_date").eq("invoice_id", inv.id).eq("status", "generated").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const party = (inv.party_snapshot ?? {}) as { name?: string; phone?: string; address?: string; gst?: string };
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const weights = await fetchProductWeights(items.map((it) => it.product_id));

  const sections = profileToUdmSections(profile);
  if (einvoice?.signed_qr_code) sections.showQrCode = true;

  return {
    kind: "document",
    documentTypeId: "sales_invoice",
    status: inv.status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    party: {
      name: inv.party_name ?? party.name ?? "—",
      mobile: party.phone ?? null,
      address: inv.billing_address ?? party.address ?? null,
      gstNo: party.gst ?? null,
    },
    header: {
      number: inv.invoice_number,
      numberLabel: "Invoice No",
      date: inv.invoice_date,
      qrCodeValue: einvoice?.signed_qr_code ?? null,
      irn: einvoice?.irn ?? null,
      ackNo: einvoice?.ack_no ?? null,
      ackDate: einvoice?.ack_date ? new Date(einvoice.ack_date).toLocaleDateString("en-IN") : null,
    },
    items: items.map((it) => ({
      partNumber: it.part_number ?? "",
      description: it.description ?? it.name ?? "",
      hsn: it.hsn ?? null,
      qty: Number(it.qty) || 0,
      rate: Number(it.net_rate ?? it.rate) || 0,
      gstPct: Number(it.gst_pct) || 0,
      amount: Number(it.total) || 0,
      mrp: it.mrp != null ? Number(it.mrp) : null,
      discountPct: it.discount_pct != null ? Number(it.discount_pct) : null,
      weight: it.product_id ? weights.get(it.product_id) ?? null : null,
    })),
    totals: {
      subtotal: Number(inv.subtotal) || 0,
      discount: Number(inv.discount_total) || 0,
      cgst: items.reduce((s, it) => s + (Number(it.cgst_amount) || 0), 0),
      sgst: items.reduce((s, it) => s + (Number(it.sgst_amount) || 0), 0),
      igst: items.reduce((s, it) => s + (Number(it.igst_amount) || 0), 0),
      tax: Number(inv.gst_total) || 0,
      grandTotal: Number(inv.grand_total) || 0,
    },
    sections,
    watermark: resolveWatermark({ status: inv.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
