// Compatibility shim over the Universal Template Engine (Locked Decision
// #13). The original bordered-A4/thermal JSX that used to live in this file
// has moved, unchanged, to src/components/print/templates/{classicTemplate,
// thermalTemplate}.tsx, rendered through the new Print Engine
// (printEngine/PrintSurface.tsx). This file now only adapts the legacy
// {config, company, party, meta, items, totals} prop bag into a DocumentUdm
// (via legacyPropsToUdm()) and delegates — every existing call site
// (~25 across Sales/Purchase/Vouchers) keeps compiling and rendering
// identically. Not deleted until every call site is migrated onto the
// Output Center directly (Phase 7 of the frozen roadmap).
//
// New code should build a DocumentUdm directly via an Output Center registry
// entry's getPrintPayload() and render through PrintSurface + a resolved
// template — never import this file.

import { legacyPropsToUdm } from "@/lib/documentUdm/legacyAdapters";
import { resolveTemplate } from "@/components/print/templates/registry";
import { PrintSurface } from "@/components/print/printEngine/PrintSurface";
import type { PrintLanguage } from "@/components/print/printLabels";

export type PrintItem = {
  partNumber: string;
  description: string;
  hsn?: string | null;
  qty: number;
  unit?: string | null;
  rate?: number | null;
  gstPct?: number | null;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  amount?: number | null;
  /** Optional item-grid columns (product mode only) — shown when the
   *  matching PrintConfig flag is enabled. */
  mrp?: number | null;
  discountPct?: number | null;
  warehouse?: string | null;
  weight?: number | null;
  /** Ledger grid mode only (itemGridMode: "ledger") — Dr/Cr amount for this line. */
  debit?: number | null;
  credit?: number | null;
};

export type PrintParty = {
  name: string;
  address?: string | null;
  mobile?: string | null;
  gstNo?: string | null;
};

export type PrintCompany = {
  name: string;
  addressLines: string[];
  gstin?: string | null;
  logoUrl?: string | null;
};

export type PrintTotals = {
  subtotal?: number;
  discount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  tax?: number;
  /** Signed Round Off adjustment (final - raw); omitted or 0 hides the line. */
  roundOff?: number;
  grandTotal?: number;
};

export type PrintMeta = {
  number: string;
  numberLabel?: string;
  date: string;
  time?: string | null;
  refNumber?: string | null;
  refLabel?: string;
  paymentMode?: string | null;
  placeOfSupply?: string | null;
  reverseCharge?: boolean;
  transporter?: string | null;
  vehicleNumber?: string | null;
  lrNumber?: string | null;
  ewayNumber?: string | null;
  distanceKm?: number | null;
  validUntil?: string | null;
  /** Voucher narration — shown when the party block is hidden (ledger-mode documents). */
  narration?: string | null;
  /** Text encoded into the QR image when showQrCode is on — e.g. a GST
   *  e-invoice signed QR payload, or a plain verification string. */
  qrCodeValue?: string | null;
  /** e-Invoice IRN/Ack details — text alongside the QR, not a replacement for it. */
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
};

export type PrintConfig = {
  /** Title shown in the top-right box, e.g. "TAX INVOICE", "DELIVERY CHALLAN", "SALES ORDER". */
  documentLabel: string;
  /** Label for the party block, e.g. "BILL TO" (default) or "DELIVER TO". */
  partyLabel?: string;
  /** Show HSN column in the item grid. */
  showHsn?: boolean;
  /** Show Rate column in the item grid. */
  showRate?: boolean;
  /** Show GST % column and the CGST/SGST/IGST (or flat Tax) summary rows. */
  showGst?: boolean;
  /** Show Amount column and the totals box; when false, renders a challan-style
   *  "received in good condition" signature block instead of a totals box. */
  showAmount?: boolean;
  /** Show Discount row in the totals box (only relevant when showAmount). */
  showDiscount?: boolean;
  /** Show a Transport Details block (transporter/vehicle/LR/e-way) instead of
   *  the invoice summary box in the top-right party row. */
  showTransport?: boolean;
  terms?: string[];
  /** Delivery-challan-style purpose-of-movement line, shown above the item grid. */
  purpose?: string;
  /** Show the company/logo/document-meta header block. Default true. */
  showHeader?: boolean;
  /** Show the footer (terms/totals or the challan signature block). Default true. */
  showFooter?: boolean;
  /** Where the logo renders in the header, or omit it entirely. Default "left". */
  logoPosition?: "left" | "center" | "none";
  /** Show the Authorized Signature line/block. Default true. */
  showSignature?: boolean;
  /** Diagonal overlay text, e.g. "DRAFT", "DUPLICATE", "CANCELLED", "PAID".
   *  @deprecated legacy call sites only — new code gets a typed watermark
   *  derived by src/lib/watermark.ts's resolveWatermark(), never a manual flag. */
  showWatermark?: boolean;
  watermarkText?: string | null;
  /** Small bank-details block in the footer area. */
  showBankDetails?: boolean;
  bankDetails?: { accountName?: string; accountNumber?: string; ifsc?: string; bankName?: string; branch?: string } | null;
  /** Show the party block (BILL TO/DELIVER TO/etc). Default true — ledger-mode
   *  documents (vouchers with no structural party) set this false. */
  showParty?: boolean;
  /** "product" (default): Part No/HSN/Qty/Rate/GST/Amount columns, the shape
   *  every invoice-like document uses. "ledger": Ledger Account/Debit/Credit
   *  columns for double-entry voucher documents (Debit Note, Credit Note,
   *  Payment Receipt) which have no per-line price or party. */
  itemGridMode?: "product" | "ledger";
  /** Optional item-grid columns (product mode only). Off by default so
   *  existing profiles keep their current printed layout. */
  showMrp?: boolean;
  showDiscountColumn?: boolean;
  showWarehouse?: boolean;
  showWeight?: boolean;
  /** Language for the engine's fixed chrome text (column headers, section
   *  titles). Per-document text (documentLabel, partyLabel, terms) is typed
   *  directly on the profile, so it can already be in any language. */
  language?: PrintLanguage;
  /** Render a QR code (from meta.qrCodeValue) — e.g. a GST e-invoice signed
   *  QR, or a plain verification string. */
  showQrCode?: boolean;
  /** "standard" (default): the bordered A4-style template. "thermal": a
   *  compact single-column receipt template for Thermal_80mm/58mm profiles.
   *  @deprecated legacy call sites only — new code sets templateId on the
   *  DocumentUdm directly (Locked Decision #13). */
  layoutMode?: "standard" | "thermal";
};

export default function PrintDocument({
  config,
  company,
  party,
  meta,
  items,
  totals,
  copyLabel,
  variant = "standalone",
}: {
  config: PrintConfig;
  company: PrintCompany;
  party: PrintParty;
  meta: PrintMeta;
  items: PrintItem[];
  totals?: PrintTotals;
  /** e.g. "DUPLICATE FOR TRANSPORTER" — shown as a banner when this instance
   *  is one page of a multi-copy print run. Omit for a single-copy print. */
  copyLabel?: string;
  /** "standalone" (default): this is the only print target on the page, so it
   *  carries its own `.invoice-print` positioning/visibility rules.
   *  "page": one page inside a `.print-copy-run` multi-copy container, which
   *  owns positioning/visibility itself — this renders as a plain block. */
  variant?: "standalone" | "page";
}) {
  const udm = legacyPropsToUdm({ config, company, party, meta, items, totals, copyLabel });
  const Template = resolveTemplate(udm.templateId);
  return (
    <PrintSurface udm={udm} variant={variant}>
      <Template udm={udm} />
    </PrintSurface>
  );
}
