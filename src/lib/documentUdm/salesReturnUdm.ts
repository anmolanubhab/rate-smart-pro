// Sales Return / Credit Note -> DocumentUdm bridge (Phase 4 migration).
// CreateSalesReturn.tsx was a pure toggle-mode page (its own inline
// DocumentGridPrintTable, never read print_profiles) — this is the first
// time Sales Return gets a real, business-configurable print profile, using
// the new dedicated "sales_return" print_profiles document_type (kept
// separate from "credit_note", which is VoucherDetail.tsx's ledger-mode
// Credit Note voucher print — a different document, see the migration's
// comment). Batch number (UI-only per line) is carried in the UDM's
// `warehouse` column, same simplification as Quotation/Sales Order's Rack.

import { supabase } from "@/integrations/supabase/client";
import type { Party } from "@/lib/parties";
import type { SalesReturnItem, SalesReturnStatus } from "@/lib/salesReturns";
import type { ProductBatch } from "@/lib/productBatches";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export interface SalesReturnPrintInput {
  businessId: string;
  returnNumber: string;
  returnDate: string;
  reason?: string | null;
  status: SalesReturnStatus;
  party: Party | null;
  items: SalesReturnItem[]; // already filtered to qty > 0
  batchesByProduct: Record<string, ProductBatch[]>;
}

export async function buildSalesReturnUdm(input: SalesReturnPrintInput): Promise<DocumentUdm> {
  const { businessId, returnNumber, returnDate, reason, status, party, items, batchesByProduct } = input;

  const [{ data: biz }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    fetchDefaultPrintProfile(businessId, "sales_return"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];

  const taxable = items.reduce((s, it) => s + (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const subtotal = items.reduce((s, it) => s + (Number(it.mrp) || 0) * (Number(it.qty) || 0), 0);
  const gstTotal = items.reduce((s, it) => s + (Number(it.total) || 0) - (Number(it.net_rate) || 0) * (Number(it.qty) || 0), 0);
  const grandTotal = taxable + gstTotal;

  return {
    kind: "document",
    documentTypeId: "sales_return",
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
      number: returnNumber,
      numberLabel: "Return No",
      date: returnDate,
      narration: reason ?? null,
    },
    items: items.map((it) => {
      const batchLabel = it.batch_id && it.product_id ? batchesByProduct[it.product_id]?.find((b) => b.id === it.batch_id)?.batch_number : null;
      return {
        partNumber: it.part_number ?? "",
        description: it.description ?? "",
        hsn: it.hsn ?? null,
        qty: Number(it.qty) || 0,
        rate: Number(it.net_rate) || 0,
        gstPct: Number(it.gst_pct) || 0,
        amount: Number(it.total) || 0,
        discountPct: it.discount_pct != null ? Number(it.discount_pct) : null,
        warehouse: batchLabel ?? null,
      };
    }),
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
