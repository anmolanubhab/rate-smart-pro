// Voucher -> DocumentUdm bridge (Phase 3 migration): Payment, Receipt,
// Journal, and Contra vouchers only — Debit Note/Credit Note vouchers keep
// using VoucherDetail.tsx's existing engine-print path (they're Phase 4
// scope, migrated alongside the rest of Sales/Purchase return documents),
// and Sales/Purchase/Opening Balance vouchers aren't document types this
// roadmap covers. Replicates VoucherDetail.tsx's pre-migration
// handleEnginePrint() data-fetch shape (ledger item grid, no party) — Payment
// and Receipt share the same underlying print_profiles document_type
// ("payment_receipt", the only one that existed before this phase) while
// Journal/Contra get their own new document_type (this phase's migration).

import { supabase } from "@/integrations/supabase/client";
import type { Voucher } from "@/lib/voucherService";
import { fetchDefaultPrintProfile, type PrintDocumentType } from "@/lib/printProfiles";
import { profileToUdmSections, profileToUdmPageProfile } from "@/lib/documentUdm/fromPrintProfile";
import { resolveWatermark } from "@/lib/watermark";
import type { DocumentUdm, ReportUdm } from "@/lib/documentUdm/types";

export type Phase3VoucherType = "Payment" | "Receipt" | "Journal" | "Contra";

/** Registry key (src/lib/outputCenter/registry.ts) per voucher_type. */
export const VOUCHER_REGISTRY_ID: Record<Phase3VoucherType, string> = {
  Payment: "payment_voucher",
  Receipt: "receipt_voucher",
  Journal: "journal_voucher",
  Contra: "contra_voucher",
};

/** Underlying print_profiles.document_type per voucher_type — Payment and
 *  Receipt intentionally share one row (payment_receipt), matching the
 *  pre-migration ENGINE_PRINT_DOCUMENT_TYPE map exactly. */
const PRINT_PROFILE_DOCUMENT_TYPE: Record<Phase3VoucherType, PrintDocumentType> = {
  Payment: "payment_receipt",
  Receipt: "payment_receipt",
  Journal: "journal_voucher",
  Contra: "contra_voucher",
};

export function isPhase3VoucherType(voucherType: string): voucherType is Phase3VoucherType {
  return voucherType in VOUCHER_REGISTRY_ID;
}

export async function buildVoucherUdm(voucher: Voucher): Promise<DocumentUdm> {
  const voucherType = voucher.voucher_type as Phase3VoucherType;
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
