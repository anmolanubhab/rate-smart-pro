// Quotation -> DocumentUdm bridge (Phase 4 migration). CreateQuotation.tsx
// was a pure toggle-mode page (its own inline DocumentGridPrintTable, never
// read print_profiles) — this is the first time Quotation gets a real,
// business-configurable print profile. Takes the page's live component
// state directly (no DB round-trip required to print an unsaved draft,
// matching the old window.print() behavior which never required a save
// first either). "Rack" (UI-only, never persisted) is carried in the
// UDM's `warehouse` column since there's no dedicated rack field on
// PrintItem — see Locked Decision notes on this being a labeling
// simplification, not a data loss.

import { supabase } from "@/integrations/supabase/client";
import type { Party } from "@/lib/parties";
import type { OrderItem } from "@/lib/orders";
import type { QuotationStatus } from "@/lib/quotations";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export type QuotationRow = OrderItem & { hsn?: string; rack?: string };

export interface QuotationPrintInput {
  businessId: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil?: string | null;
  refNo?: string | null;
  status: QuotationStatus;
  party: Party | null;
  items: QuotationRow[];
  unitLabel?: (unitId: string | null | undefined) => string;
}

export async function buildQuotationUdm(input: QuotationPrintInput): Promise<DocumentUdm> {
  const { businessId, quotationNumber, quotationDate, validUntil, refNo, status, party, items, unitLabel } = input;

  const [{ data: biz }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    fetchDefaultPrintProfile(businessId, "quotation"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];

  const subtotal = items.reduce((s, it) => s + (Number(it.mrp) || 0) * (Number(it.qty) || 0), 0);
  const taxable = items.reduce((s, it) => s + (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const gstTotal = items.reduce((s, it) => s + (Number(it.total) || 0) - (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const grandTotal = taxable + gstTotal;

  return {
    kind: "document",
    documentTypeId: "quotation",
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
      number: quotationNumber,
      numberLabel: "Quotation No",
      date: quotationDate,
      refNumber: refNo ?? null,
      validUntil: validUntil ?? null,
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
