// Master print engine — one shared layout (Header / Party Block / Item Grid /
// Tax Summary / Totals / Footer) for every printable document in RD-Pro.
// A new document type is a new PrintConfig preset, not a new component: set
// which sections/columns apply (showGst, showAmount, showTransport, ...) and
// this renders them. Reuses the existing `.invoice-print` print.css target
// so every document keeps the same A4 print behavior.
//
// `layoutMode: "thermal"` renders a second, compact receipt-style branch for
// Thermal_80mm/58mm profiles instead of the bordered A4 template — same
// config/data shape, different chrome, still one component.

import QrCodeImage from "@/components/print/QrCodeImage";
import { getPrintLabels, type PrintLanguage } from "@/components/print/printLabels";

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
  /** Diagonal overlay text, e.g. "DRAFT", "DUPLICATE", "CANCELLED", "PAID". */
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
   *  compact single-column receipt template for Thermal_80mm/58mm profiles. */
  layoutMode?: "standard" | "thermal";
};

const DEFAULT_TERMS = ["Goods once sold will not be taken back.", "E. & O.E."];

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
  const {
    documentLabel,
    partyLabel = "BILL TO",
    showHsn = false,
    showRate = false,
    showGst = false,
    showAmount = false,
    showDiscount = false,
    showTransport = false,
    terms = DEFAULT_TERMS,
    purpose,
    showHeader = true,
    showFooter = true,
    logoPosition = "left",
    showSignature = true,
    showWatermark = false,
    watermarkText,
    showBankDetails = false,
    bankDetails,
    showParty = true,
    itemGridMode = "product",
    showMrp = false,
    showDiscountColumn = false,
    showWarehouse = false,
    showWeight = false,
    language = "en",
    showQrCode = false,
    layoutMode = "standard",
  } = config;

  const L = getPrintLabels(language);
  const t = totals ?? {};
  const isInterstate = (t.igst ?? 0) > 0;
  const hasGstSplit = showGst && (t.cgst != null || t.sgst != null || t.igst != null);
  const fmt = (n?: number | null) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isLedger = itemGridMode === "ledger";
  const colCount = isLedger
    ? 4 /* Sr, Ledger, Debit, Credit */
    : 3 + (showHsn ? 1 : 0) + (showWarehouse ? 1 : 0) + 1 /* qty */
      + (showMrp ? 1 : 0) + (showDiscountColumn ? 1 : 0) + (showWeight ? 1 : 0) + (showRate ? 1 : 0) + (showGst ? 1 : 0) + (showAmount ? 1 : 0);
  const totalDebit = isLedger ? items.reduce((s, it) => s + (Number(it.debit) || 0), 0) : 0;
  const totalCredit = isLedger ? items.reduce((s, it) => s + (Number(it.credit) || 0), 0) : 0;

  const TaxSummaryRows = () =>
    hasGstSplit ? (
      isInterstate ? (
        <>
          <div className="col-span-6">{L.igst}</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.igst)}</div>
        </>
      ) : (
        <>
          <div className="col-span-6">{L.cgst}</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.cgst)}</div>
          <div className="col-span-6">{L.sgst}</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.sgst)}</div>
        </>
      )
    ) : showGst ? (
      <>
        <div className="col-span-6">{L.tax}</div>
        <div className="col-span-6 text-right tabular-nums">{fmt(t.tax)}</div>
      </>
    ) : null;

  if (layoutMode === "thermal") {
    return (
      <div
        id={variant === "standalone" ? "invoice-print" : undefined}
        className={variant === "standalone" ? "invoice-print bg-white text-black font-sans relative" : "bg-white text-black font-sans relative"}
      >
        {showWatermark && watermarkText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-10">
            <span className="text-[40px] font-black uppercase tracking-widest text-black/10 -rotate-45 whitespace-nowrap">
              {watermarkText}
            </span>
          </div>
        )}
        <div className="text-[9px] leading-snug">
          {showHeader && (
            <div className="text-center border-b border-dashed border-black pb-1 mb-1">
              {logoPosition !== "none" && company.logoUrl && (
                <img src={company.logoUrl} alt="Company Logo" className="h-8 mx-auto object-contain mb-1" />
              )}
              <div className="text-[12px] font-extrabold">{company.name}</div>
              <div>{company.addressLines.filter(Boolean).join(", ")}</div>
              {company.gstin && <div>GSTIN: {company.gstin}</div>}
              {copyLabel && <div className="font-bold uppercase">{copyLabel}</div>}
              <div className="mt-1 font-bold">{documentLabel}</div>
              <div className="flex justify-between mt-0.5">
                <span>{meta.numberLabel ?? L.number}: {meta.number || "—"}</span>
                <span>{L.date}: {meta.date || "—"}</span>
              </div>
              {meta.refNumber && <div>{meta.refLabel ?? L.refNo}: {meta.refNumber}</div>}
            </div>
          )}

          {showParty ? (
            <div className="border-b border-dashed border-black pb-1 mb-1">
              <div className="font-bold">{partyLabel}: {party.name || "—"}</div>
              {party.mobile && <div>{L.mobile}: {party.mobile}</div>}
              {party.gstNo && <div>{L.gstNo}: {party.gstNo}</div>}
            </div>
          ) : meta.narration ? (
            <div className="border-b border-dashed border-black pb-1 mb-1">
              <div className="font-bold">{L.narration}</div>
              <div className="whitespace-pre-wrap">{meta.narration}</div>
            </div>
          ) : null}

          {purpose && <div className="mb-1">{L.purposeOfMovement}: {purpose}</div>}

          <div className="border-b border-dashed border-black pb-1 mb-1">
            {items.length ? (
              items.map((it, idx) =>
                isLedger ? (
                  <div key={`${it.description}-${idx}`} className="flex justify-between py-0.5">
                    <span>{it.description}</span>
                    <span className="tabular-nums">{it.debit ? `Dr ${fmt(it.debit)}` : it.credit ? `Cr ${fmt(it.credit)}` : ""}</span>
                  </div>
                ) : (
                  <div key={`${it.partNumber}-${idx}`} className="py-0.5">
                    <div className="font-semibold">{it.description || it.partNumber}</div>
                    <div className="flex justify-between">
                      <span className="tabular-nums">
                        {fmt(it.qty)} {it.unit ?? ""} {showRate ? `x ${fmt(it.rate)}` : ""}
                        {showWeight && it.weight != null ? ` · ${fmt(it.weight)} kg` : ""}
                      </span>
                      {showAmount && <span className="tabular-nums font-semibold">{fmt(it.amount)}</span>}
                    </div>
                  </div>
                )
              )
            ) : (
              <div className="text-center py-1">{L.noItems}</div>
            )}
            {isLedger && items.length > 0 && (
              <div className="flex justify-between font-bold border-t border-dashed border-black mt-1 pt-1">
                <span>{L.total}</span>
                <span className="tabular-nums">{fmt(totalDebit)} / {fmt(totalCredit)}</span>
              </div>
            )}
          </div>

          {showFooter && showAmount && (
            <div className="border-b border-dashed border-black pb-1 mb-1">
              <div className="flex justify-between"><span>{L.subtotal}</span><span className="tabular-nums">{fmt(t.subtotal)}</span></div>
              {showDiscount && (
                <div className="flex justify-between"><span>{L.discount}</span><span className="tabular-nums">{fmt(t.discount)}</span></div>
              )}
              {hasGstSplit ? (
                isInterstate ? (
                  <div className="flex justify-between"><span>{L.igst}</span><span className="tabular-nums">{fmt(t.igst)}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between"><span>{L.cgst}</span><span className="tabular-nums">{fmt(t.cgst)}</span></div>
                    <div className="flex justify-between"><span>{L.sgst}</span><span className="tabular-nums">{fmt(t.sgst)}</span></div>
                  </>
                )
              ) : showGst ? (
                <div className="flex justify-between"><span>{L.tax}</span><span className="tabular-nums">{fmt(t.tax)}</span></div>
              ) : null}
              <div className="flex justify-between font-extrabold text-[11px] border-t border-dashed border-black mt-1 pt-1">
                <span>{L.grandTotal}</span><span className="tabular-nums">{fmt(t.grandTotal)}</span>
              </div>
            </div>
          )}

          {showQrCode && meta.qrCodeValue && (
            <div className="flex justify-center py-1">
              <QrCodeImage value={meta.qrCodeValue} sizePx={70} />
            </div>
          )}

          {showFooter && showAmount && (
            <div className="text-center">{L.thankYou}</div>
          )}
          {showFooter && showSignature && !showAmount && (
            <div className="text-center mt-2">
              {L.forCompany} {company.name}
              <div className="mt-2">{L.authorizedSignatory}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={variant === "standalone" ? "invoice-print" : undefined}
      className={variant === "standalone" ? "invoice-print bg-white text-black font-sans relative" : "bg-white text-black font-sans relative"}
    >
      {showWatermark && watermarkText && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-10">
          <span className="text-[90px] font-black uppercase tracking-widest text-black/10 -rotate-45 whitespace-nowrap">
            {watermarkText}
          </span>
        </div>
      )}
      <div className="border-2 border-black">
        {/* ── Header: company + document meta ───────────────────────────── */}
        {showHeader && (
        <div className="p-3 border-b-2 border-black">
          <div className={`flex items-start gap-3 ${logoPosition === "center" ? "flex-col items-center text-center" : "justify-between"}`}>
            <div className={`flex items-start gap-3 ${logoPosition === "center" ? "flex-col items-center text-center" : ""}`}>
              {logoPosition !== "none" && (
                <div className="h-14 w-14 border border-black flex items-center justify-center overflow-hidden">
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="Company Logo" className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-[10px] font-semibold tracking-wide">LOGO</div>
                  )}
                </div>
              )}
              <div>
                <div className="text-[18px] font-extrabold leading-tight tracking-wide">{company.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug">
                  {company.addressLines.filter(Boolean).map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
                {company.gstin && (
                  <div className="mt-1 text-[11px]">
                    <span className="font-semibold">GSTIN:</span> <span className="font-semibold">{company.gstin}</span>
                  </div>
                )}
                {copyLabel && (
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide">{copyLabel}</div>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[12px] font-semibold border border-black px-3 py-1 inline-block">{documentLabel}</div>
              <div className="mt-2 text-[11px] leading-snug">
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">{meta.numberLabel ?? L.number}</span>
                  <span className="w-40 text-left">{meta.number || "—"}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">{L.date}</span>
                  <span className="w-40 text-left">{meta.date || "—"}</span>
                </div>
                {meta.time && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{L.time}</span>
                    <span className="w-40 text-left">{meta.time}</span>
                  </div>
                )}
                {meta.refNumber && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{meta.refLabel ?? L.refNo}</span>
                    <span className="w-40 text-left">{meta.refNumber}</span>
                  </div>
                )}
                {meta.paymentMode && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{L.payment}</span>
                    <span className="w-40 text-left">{meta.paymentMode}</span>
                  </div>
                )}
                {meta.placeOfSupply && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{L.placeOfSupply}</span>
                    <span className="w-40 text-left">{meta.placeOfSupply}</span>
                  </div>
                )}
                {meta.reverseCharge && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{L.reverseCharge}</span>
                    <span className="w-40 text-left">{L.yes}</span>
                  </div>
                )}
              </div>
              {showQrCode && meta.qrCodeValue && (
                <div className="mt-2 flex justify-end">
                  <QrCodeImage value={meta.qrCodeValue} sizePx={80} />
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── Party block + (transport details or totals-preview box), or a
             narration strip for ledger-mode documents with no structural party ── */}
        {showParty ? (
        <div className="grid grid-cols-2 border-b-2 border-black">
          <div className="p-3 border-r-2 border-black">
            <div className="text-[12px] font-bold">{partyLabel}</div>
            <div className="mt-1 text-[12px] font-semibold">{party.name || "—"}</div>
            <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
            <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
              <div className="col-span-4 font-semibold">{L.mobile}</div>
              <div className="col-span-8">{party.mobile || "—"}</div>
              <div className="col-span-4 font-semibold">{L.gstNo}</div>
              <div className="col-span-8">{party.gstNo || "—"}</div>
            </div>
          </div>

          <div className="p-3">
            {showTransport ? (
              <>
                <div className="text-[12px] font-bold">{L.transportDetails}</div>
                <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
                  <div className="col-span-5 font-semibold">{L.transporter}</div><div className="col-span-7">{meta.transporter || "—"}</div>
                  <div className="col-span-5 font-semibold">{L.vehicleNo}</div><div className="col-span-7">{meta.vehicleNumber || "—"}</div>
                  <div className="col-span-5 font-semibold">{L.lrNo}</div><div className="col-span-7">{meta.lrNumber || "—"}</div>
                  <div className="col-span-5 font-semibold">{L.ewayBillNo}</div><div className="col-span-7">{meta.ewayNumber || "—"}</div>
                </div>
              </>
            ) : (
              <>
                <div className="text-[12px] font-bold">{L.shipTo}</div>
                <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
                {showAmount && (
                  <div className="mt-3 border border-black p-2">
                    <div className="text-[10px] font-semibold tracking-wider">{L.summary}</div>
                    <div className="mt-1 text-[11px] grid grid-cols-12 gap-y-1">
                      <div className="col-span-6">{L.subtotal}</div>
                      <div className="col-span-6 text-right tabular-nums">{fmt(t.subtotal)}</div>
                      {showDiscount && (
                        <>
                          <div className="col-span-6">{L.discount}</div>
                          <div className="col-span-6 text-right tabular-nums">{fmt(t.discount)}</div>
                        </>
                      )}
                      <TaxSummaryRows />
                      <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                        <div className="font-bold uppercase">{L.grandTotal}</div>
                        <div className="font-extrabold text-[14px] tabular-nums">{fmt(t.grandTotal)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        ) : meta.narration ? (
          <div className="p-3 border-b-2 border-black">
            <div className="text-[12px] font-bold">{L.narration}</div>
            <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{meta.narration}</div>
          </div>
        ) : null}

        {/* ── Item grid ───────────────────────────────────────────────── */}
        <div className="p-3">
          {purpose && (
            <div className="text-[11px] mb-2"><span className="font-semibold">{L.purposeOfMovement}:</span> {purpose}</div>
          )}
          <table className="w-full border border-black text-[11px]">
            <thead className="bg-white">
              {isLedger ? (
                <tr className="border-b border-black">
                  <th className="p-1.5 text-left w-8">{L.sr}</th>
                  <th className="p-1.5 text-left">{L.ledgerAccount}</th>
                  <th className="p-1.5 text-right w-28">{L.debit}</th>
                  <th className="p-1.5 text-right w-28">{L.credit}</th>
                </tr>
              ) : (
                <tr className="border-b border-black">
                  <th className="p-1.5 text-left w-8">{L.sr}</th>
                  <th className="p-1.5 text-left w-24">{L.partNo}</th>
                  {showHsn && <th className="p-1.5 text-left w-20">{L.hsn}</th>}
                  {showWarehouse && <th className="p-1.5 text-left w-20">{L.warehouse}</th>}
                  <th className="p-1.5 text-left">{L.description}</th>
                  <th className="p-1.5 text-right w-14">{L.qty}</th>
                  {showMrp && <th className="p-1.5 text-right w-20">{L.mrp}</th>}
                  {showDiscountColumn && <th className="p-1.5 text-right w-16">{L.discPct}</th>}
                  {showWeight && <th className="p-1.5 text-right w-16">{L.weight}</th>}
                  {showRate && <th className="p-1.5 text-right w-20">{L.rate}</th>}
                  {showGst && <th className="p-1.5 text-right w-14">{L.gstPct}</th>}
                  {showAmount && <th className="p-1.5 text-right w-24">{L.amount}</th>}
                </tr>
              )}
            </thead>
            <tbody>
              {items.length ? (
                items.map((it, idx) =>
                  isLedger ? (
                    <tr key={`${it.description}-${idx}`} className="border-b border-black last:border-b-0">
                      <td className="p-1.5 align-top">{idx + 1}</td>
                      <td className="p-1.5 align-top font-semibold">{it.description}</td>
                      <td className="p-1.5 align-top text-right tabular-nums">{it.debit ? fmt(it.debit) : ""}</td>
                      <td className="p-1.5 align-top text-right tabular-nums">{it.credit ? fmt(it.credit) : ""}</td>
                    </tr>
                  ) : (
                    <tr key={`${it.partNumber}-${idx}`} className="border-b border-black last:border-b-0">
                      <td className="p-1.5 align-top">{idx + 1}</td>
                      <td className="p-1.5 align-top font-semibold">{it.partNumber}</td>
                      {showHsn && <td className="p-1.5 align-top">{it.hsn || "—"}</td>}
                      {showWarehouse && <td className="p-1.5 align-top">{it.warehouse || "—"}</td>}
                      <td className="p-1.5 align-top">{it.description}</td>
                      <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.qty)} {it.unit ?? ""}</td>
                      {showMrp && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.mrp)}</td>}
                      {showDiscountColumn && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.discountPct)}</td>}
                      {showWeight && <td className="p-1.5 align-top text-right tabular-nums">{it.weight != null ? fmt(it.weight) : "—"}</td>}
                      {showRate && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.rate)}</td>}
                      {showGst && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.gstPct)}</td>}
                      {showAmount && <td className="p-1.5 align-top text-right tabular-nums font-semibold">{fmt(it.amount)}</td>}
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td className="p-2 text-center" colSpan={colCount}>{L.noItems}</td>
                </tr>
              )}
              {isLedger && items.length > 0 && (
                <tr className="border-t-2 border-black font-bold">
                  <td className="p-1.5" colSpan={2}>{L.total}</td>
                  <td className="p-1.5 text-right tabular-nums">{fmt(totalDebit)}</td>
                  <td className="p-1.5 text-right tabular-nums">{fmt(totalCredit)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── Footer: totals+terms for GST docs, signature block for challan-style/ledger-mode ── */}
          {showFooter && (showAmount ? (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="border border-black p-2">
                <div className="text-[11px] font-bold mb-1">{L.termsConditions}</div>
                <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                  {terms.filter(Boolean).map((term) => <li key={term}>{term}</li>)}
                </ul>
                {showBankDetails && bankDetails && (
                  <div className="mt-3 border-t border-black pt-2 text-[11px]">
                    <div className="font-bold mb-0.5">{L.bankDetails}</div>
                    {bankDetails.accountName && <div>{L.acName}: {bankDetails.accountName}</div>}
                    {bankDetails.accountNumber && <div>{L.acNo}: {bankDetails.accountNumber}</div>}
                    {bankDetails.bankName && <div>{L.bank}: {bankDetails.bankName}</div>}
                    {bankDetails.branch && <div>{L.branch}: {bankDetails.branch}</div>}
                    {bankDetails.ifsc && <div>{L.ifsc}: {bankDetails.ifsc}</div>}
                  </div>
                )}
                <div className="mt-3 text-[11px] font-semibold">{L.thankYou}</div>
                {showQrCode && meta.qrCodeValue && (
                  <div className="mt-3 flex justify-center">
                    <QrCodeImage value={meta.qrCodeValue} sizePx={90} />
                  </div>
                )}
              </div>

              <div className="border border-black p-2">
                <div className="text-[11px] font-bold mb-1">{L.total}</div>
                <div className="text-[11px] grid grid-cols-12 gap-y-1">
                  <div className="col-span-6">{L.subtotal}</div>
                  <div className="col-span-6 text-right tabular-nums">{fmt(t.subtotal)}</div>
                  {showDiscount && (
                    <>
                      <div className="col-span-6">{L.discount}</div>
                      <div className="col-span-6 text-right tabular-nums">{fmt(t.discount)}</div>
                    </>
                  )}
                  <TaxSummaryRows />
                  <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                    <div className="font-bold">{L.grandTotal}</div>
                    <div className="font-extrabold text-[14px] tabular-nums">{fmt(t.grandTotal)}</div>
                  </div>
                </div>
                {showSignature && (
                  <div className="mt-8 text-right">
                    <div className="text-[11px] font-semibold">{L.authorizedSignature}</div>
                    <div className="mt-10 border-t border-black" />
                  </div>
                )}
              </div>
            </div>
          ) : isLedger ? (
            showSignature && (
              <div className="mt-8 flex justify-end text-[11px]">
                <div className="text-right">
                  <p className="font-semibold mb-8">{L.forCompany} {company.name}</p>
                  <div className="border-t border-black pt-1 inline-block">{L.authorizedSignatory}</div>
                </div>
              </div>
            )
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-8 text-[11px]">
              <div>
                <p className="font-semibold mb-8">{L.receivedGoods}</p>
                <div className="border-t border-black pt-1">{L.receiversSignature}</div>
              </div>
              {showSignature && (
                <div className="text-right">
                  <p className="font-semibold mb-8">{L.forCompany} {company.name}</p>
                  <div className="border-t border-black pt-1 inline-block">{L.authorizedSignatory}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
