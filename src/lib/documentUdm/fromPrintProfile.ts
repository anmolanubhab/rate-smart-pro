// Splits printProfiles.ts's existing profileToPrintConfig() into two
// UDM-shaped pieces — section flags and page profile — plus reads the new
// template_id column. This is the one place a stored PrintProfile row gets
// translated into UDM fields; registry entries' getPrintPayload() call these
// instead of duplicating the mapping.

import type { PrintProfile } from "@/lib/printProfiles";
import type { UdmSectionFlags, UdmPageProfile } from "@/lib/documentUdm/types";

export function profileToUdmSections(profile: PrintProfile): UdmSectionFlags {
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
    showBankDetails: profile.show_bank_details,
    bankDetails: profile.bank_details,
    showParty: profile.show_party,
    itemGridMode: profile.item_grid_mode,
    showMrp: profile.show_mrp,
    showDiscountColumn: profile.show_discount_column,
    showWarehouse: profile.show_warehouse,
    showWeight: profile.show_weight,
    language: profile.language,
    showQrCode: profile.show_qr_code,
  };
}

export function profileToUdmPageProfile(profile: PrintProfile): UdmPageProfile {
  return {
    pageSize: profile.page_size,
    orientation: profile.orientation,
    marginTopMm: profile.margin_top_mm,
    marginBottomMm: profile.margin_bottom_mm,
    marginLeftMm: profile.margin_left_mm,
    marginRightMm: profile.margin_right_mm,
  };
}

/** printPageStyle.ts's contentWidthMm()/applyPrintPageStyle() predate the UDM
 *  and take PrintProfile's snake_case column names directly — left unchanged
 *  since they're pure, already-generalized engine-layer math (see Locked
 *  Decision #15). This is the one small adapter that lets printEngine call
 *  them from a UdmPageProfile without rewriting either side. */
export function udmPageProfileToLegacy(pageProfile: UdmPageProfile) {
  return {
    page_size: pageProfile.pageSize,
    orientation: pageProfile.orientation,
    margin_top_mm: pageProfile.marginTopMm,
    margin_bottom_mm: pageProfile.marginBottomMm,
    margin_left_mm: pageProfile.marginLeftMm,
    margin_right_mm: pageProfile.marginRightMm,
  };
}
