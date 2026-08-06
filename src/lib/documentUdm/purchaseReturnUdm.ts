// Purchase Return / Debit Note -> DocumentUdm bridge (Phase 4 migration,
// new capability). Before this, Purchase Return had no document-level print
// at all — only ReturnsListPanel's row, which links to the linked Debit Note
// voucher's own ledger-mode print (no party, no line items). This uses the
// new dedicated "purchase_return" print_profiles document_type (kept
// separate from "debit_note", which is VoucherDetail.tsx's ledger-mode Debit
// Note voucher print — a different document, same reasoning as
// sales_return/credit_note, see salesReturnUdm.ts and the migration's
// comment).
//
// Unlike Sales/Purchase Invoice or Sales Return, ReturnsListPanel's list
// query only selects header fields (no line items) — so this bridge takes
// just a returnId and fetches everything itself (return row, items,
// supplier, business, profile) rather than receiving already-loaded state.

import { supabase } from "@/integrations/supabase/client";
import { fetchDefaultPrintProfile } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm } from "@/lib/documentUdm/types";

interface PurchaseReturnRow {
  return_number: string;
  return_date: string;
  reason: string | null;
  status: string;
  supplier_id: string;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
}

interface PurchaseReturnItemRow {
  part_number: string | null;
  description: string | null;
  qty: number;
  rate: number;
  gst_pct: number;
  line_total: number;
}

export async function buildPurchaseReturnUdm(businessId: string, returnId: string): Promise<DocumentUdm> {
  const { data: ret, error: retErr } = await supabase
    .from("purchase_returns" as never)
    .select("return_number, return_date, reason, status, supplier_id, taxable_amount, gst_amount, total_amount")
    .eq("id", returnId)
    .single();
  if (retErr) throw retErr;
  const returnRow = ret as unknown as PurchaseReturnRow;

  const [{ data: biz }, { data: supplier }, { data: itemRows }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
    supabase.from("parties").select("name, phone, address, billing_address, gst").eq("id", returnRow.supplier_id).maybeSingle(),
    supabase.from("purchase_return_items" as never).select("part_number, description, qty, rate, gst_pct, line_total").eq("return_id", returnId),
    fetchDefaultPrintProfile(businessId, "purchase_return"),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const items = (itemRows ?? []) as unknown as PurchaseReturnItemRow[];

  return {
    kind: "document",
    documentTypeId: "purchase_return",
    status: returnRow.status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    party: {
      name: supplier?.name ?? "—",
      mobile: supplier?.phone ?? null,
      address: supplier?.billing_address ?? supplier?.address ?? null,
      gstNo: supplier?.gst ?? null,
    },
    header: {
      number: returnRow.return_number,
      numberLabel: "Return No",
      date: returnRow.return_date,
      narration: returnRow.reason ?? null,
    },
    items: items.map((it) => ({
      partNumber: it.part_number ?? "",
      description: it.description ?? "",
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
      gstPct: Number(it.gst_pct) || 0,
      amount: Number(it.line_total) || 0,
    })),
    totals: {
      subtotal: Number(returnRow.taxable_amount) || 0,
      discount: 0,
      tax: Number(returnRow.gst_amount) || 0,
      grandTotal: Number(returnRow.total_amount) || 0,
    },
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status: returnRow.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}
