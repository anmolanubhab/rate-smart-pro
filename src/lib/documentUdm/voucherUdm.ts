// Voucher -> DocumentUdm bridge. Payment/Receipt/Journal/Contra were
// migrated in Phase 3; Debit Note/Credit Note were promised as "Phase 4
// scope, migrated alongside the rest of Sales/Purchase return documents"
// but that never actually happened during Phase 4 (Sales/Purchase Return
// got their own new print_profiles document_types instead) — closed here
// in Phase 7 hardening, since VoucherDetail.tsx's old
// handleEnginePrint/PrintCopyDialog/MultiCopyPrintRun path was otherwise the
// last real per-document gap left in the whole roadmap. Sales/Purchase/
// Opening Balance vouchers still aren't covered — no dedicated document
// layout ever existed for them (VoucherDetail.tsx's own on-screen ledger
// table already prints reasonably via a plain window.print(), unlike GRN's
// hidden grid, so there's nothing broken to fix there). Replicates
// VoucherDetail.tsx's pre-migration handleEnginePrint() data-fetch shape
// (ledger item grid, no party) — Payment and Receipt share the same
// underlying print_profiles document_type ("payment_receipt", the only one
// that existed before Phase 3) while Journal/Contra/Debit Note/Credit Note
// each have their own document_type.

import { supabase } from "@/integrations/supabase/client";
import type { Voucher } from "@/lib/voucherService";
import { fetchDefaultPrintProfile, type PrintDocumentType } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm, ReportUdm } from "@/lib/documentUdm/types";

export type EngineVoucherType = "Payment" | "Receipt" | "Journal" | "Contra" | "Debit Note" | "Credit Note";

/** Registry key (src/lib/outputCenter/registry.ts) per voucher_type. */
export const VOUCHER_REGISTRY_ID: Record<EngineVoucherType, string> = {
  Payment: "payment_voucher",
  Receipt: "receipt_voucher",
  Journal: "journal_voucher",
  Contra: "contra_voucher",
  "Debit Note": "debit_note",
  "Credit Note": "credit_note",
};

/** Underlying print_profiles.document_type per voucher_type — Payment and
 *  Receipt intentionally share one row (payment_receipt), matching the
 *  pre-migration ENGINE_PRINT_DOCUMENT_TYPE map exactly. */
const PRINT_PROFILE_DOCUMENT_TYPE: Record<EngineVoucherType, PrintDocumentType> = {
  Payment: "payment_receipt",
  Receipt: "payment_receipt",
  Journal: "journal_voucher",
  Contra: "contra_voucher",
  "Debit Note": "debit_note",
  "Credit Note": "credit_note",
};

export function isEngineVoucherType(voucherType: string): voucherType is EngineVoucherType {
  return voucherType in VOUCHER_REGISTRY_ID;
}

export async function buildVoucherUdm(voucher: Voucher): Promise<DocumentUdm> {
  const voucherType = voucher.voucher_type as EngineVoucherType;
  const documentTypeId = VOUCHER_REGISTRY_ID[voucherType];
  const printProfileDocType = PRINT_PROFILE_DOCUMENT_TYPE[voucherType];

  const [{ data: biz }, profile] = await Promise.all([
    supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", voucher.business_id).maybeSingle(),
    fetchDefaultPrintProfile(voucher.business_id, printProfileDocType),
  ]);
  const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];

  return {
    kind: "document",
    documentTypeId,
    status: voucher.status,
    company: {
      name: biz?.business_name ?? "—",
      addressLines,
      gstin: biz?.gst_number ?? null,
      logoUrl: biz?.logo_url ?? null,
    },
    header: {
      number: voucher.voucher_no,
      numberLabel: "Voucher No",
      date: voucher.voucher_date,
      narration: voucher.narration || null,
    },
    items: (voucher.items ?? []).map((it) => ({
      partNumber: "",
      description: it.ledger_name || it.ledger_account_id,
      qty: 0,
      debit: Number(it.debit) || 0,
      credit: Number(it.credit) || 0,
    })),
    sections: profileToUdmSections(profile),
    watermark: resolveWatermark({ status: voucher.status, copyLabel: null, isReprint: false }),
    pageProfile: profileToUdmPageProfile(profile),
    templateId: profile.template_id,
  };
}

/** VoucherList.tsx's Print/Export buttons act on the whole loaded table (a
 *  report of vouchers), not a single voucher document — same rows/columns
 *  exportCSV() already used, now routed through the shared tabular
 *  PDF/Excel pipeline instead of a hand-rolled CSV builder. */
export function buildVoucherRegisterUdm(vouchers: Voucher[]): ReportUdm {
  return {
    kind: "report",
    documentTypeId: "voucher_register",
    title: "Voucher Register",
    subtitle: `${vouchers.length} voucher${vouchers.length === 1 ? "" : "s"}`,
    columns: [
      { key: "voucher_no", label: "Voucher No" },
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "narration", label: "Narration" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
    rows: vouchers.map((v) => ({
      voucher_no: v.voucher_no,
      date: v.voucher_date,
      type: v.voucher_type,
      narration: v.narration ?? "",
      amount: v.total_debit ?? 0,
      status: v.status,
    })),
  };
}
