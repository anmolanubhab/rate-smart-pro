import { supabase } from "@/integrations/supabase/client";
import type { PrintConfig } from "@/components/print/PrintDocument";
import type { PrintLanguage } from "@/components/print/printLabels";

export type PrintDocumentType =
  | "sales_invoice" | "purchase_invoice" | "delivery_challan"
  | "sales_order" | "purchase_order" | "quotation" | "packing_slip"
  | "debit_note" | "credit_note" | "payment_receipt";
export type PrintPageSize = "A4" | "A5" | "Letter" | "Thermal_80mm" | "Thermal_58mm";
export type PrintOrientation = "portrait" | "landscape";
export type PrintLogoPosition = "left" | "center" | "none";

export type BankDetails = {
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  branch?: string;
};

export type PrintProfile = {
  id: string;
  business_id: string;
  document_type: PrintDocumentType;
  name: string;
  is_default: boolean;
  page_size: PrintPageSize;
  orientation: PrintOrientation;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  show_header: boolean;
  show_footer: boolean;
  logo_position: PrintLogoPosition;
  show_signature: boolean;
  document_label: string;
  party_label: string;
  show_hsn: boolean;
  show_rate: boolean;
  show_gst_summary: boolean;
  show_amount: boolean;
  show_discount: boolean;
  show_transport_section: boolean;
  purpose_text: string | null;
  show_watermark: boolean;
  watermark_text: string | null;
  show_bank_details: boolean;
  bank_details: BankDetails | null;
  terms: string[];
  item_grid_mode: "product" | "ledger";
  show_party: boolean;
  show_mrp: boolean;
  show_discount_column: boolean;
  show_warehouse: boolean;
  language: PrintLanguage;
  show_qr_code: boolean;
};

/** The profile a print flow should actually use — seeds sane per-document
 *  defaults on first use, then returns the default (or first) profile. */
export async function fetchDefaultPrintProfile(businessId: string, documentType: PrintDocumentType): Promise<PrintProfile> {
  await supabase.rpc("ensure_default_print_profiles" as never, { _business_id: businessId } as never);
  const { data, error } = await supabase
    .from("print_profiles" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("document_type", documentType)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No print profile found for ${documentType}`);
  return data as unknown as PrintProfile;
}

/** All profiles for a document type, for the settings page. */
export async function fetchPrintProfiles(businessId: string, documentType: PrintDocumentType): Promise<PrintProfile[]> {
  await supabase.rpc("ensure_default_print_profiles" as never, { _business_id: businessId } as never);
  const { data, error } = await supabase
    .from("print_profiles" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("document_type", documentType)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PrintProfile[];
}

export type PrintProfileInput = Omit<PrintProfile, "id" | "business_id" | "is_default">;

export async function createPrintProfile(businessId: string, documentType: PrintDocumentType, input: Partial<PrintProfileInput> & { name: string; document_label: string }) {
  const { error } = await supabase.from("print_profiles" as never).insert({
    business_id: businessId, document_type: documentType, ...input,
  } as never);
  if (error) throw error;
}

export async function updatePrintProfile(id: string, patch: Partial<PrintProfileInput>) {
  const { error } = await supabase.from("print_profiles" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deletePrintProfile(id: string) {
  const { error } = await supabase.from("print_profiles" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function setDefaultPrintProfile(id: string) {
  const { error } = await supabase.rpc("set_default_print_profile" as never, { _profile_id: id } as never);
  if (error) throw error;
}

/** Translates a stored profile into the PrintDocument component's config shape. */
export function profileToPrintConfig(profile: PrintProfile): PrintConfig {
  return {
    documentLabel: profile.document_label,
    partyLabel: profile.party_label,
    showHsn: profile.show_hsn,
    showRate: profile.show_rate,
    showGst: profile.show_gst_summary,
    showAmount: profile.show_amount,
    showDiscount: profile.show_discount,
    showTransport: profile.show_transport_section,
    purpose: profile.purpose_text ?? undefined,
    terms: profile.terms,
    showHeader: profile.show_header,
    showFooter: profile.show_footer,
    logoPosition: profile.logo_position,
    showSignature: profile.show_signature,
    showWatermark: profile.show_watermark,
    watermarkText: profile.watermark_text,
    showBankDetails: profile.show_bank_details,
    bankDetails: profile.bank_details,
    showParty: profile.show_party,
    itemGridMode: profile.item_grid_mode,
    showMrp: profile.show_mrp,
    showDiscountColumn: profile.show_discount_column,
    showWarehouse: profile.show_warehouse,
    language: profile.language,
    showQrCode: profile.show_qr_code,
    layoutMode: profile.page_size.startsWith("Thermal_") ? "thermal" : "standard",
  };
}
