// Master print engine — one shared layout (Header / Party Block / Item Grid /
// Tax Summary / Totals / Footer) for every printable document in RD-Pro.
// A new document type is a new PrintConfig preset, not a new component: set
// which sections/columns apply (showGst, showAmount, showTransport, ...) and
// this renders them. Reuses the existing `.invoice-print` print.css target
// so every document keeps the same A4 print behavior.

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
  } = config;

  const t = totals ?? {};
  const isInterstate = (t.igst ?? 0) > 0;
  const hasGstSplit = showGst && (t.cgst != null || t.sgst != null || t.igst != null);
  const fmt = (n?: number | null) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const colCount = 3 + (showHsn ? 1 : 0) + 1 /* qty */ + (showRate ? 1 : 0) + (showGst ? 1 : 0) + (showAmount ? 1 : 0);

  const TaxSummaryRows = () =>
    hasGstSplit ? (
      isInterstate ? (
        <>
          <div className="col-span-6">IGST</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.igst)}</div>
        </>
      ) : (
        <>
          <div className="col-span-6">CGST</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.cgst)}</div>
          <div className="col-span-6">SGST</div>
          <div className="col-span-6 text-right tabular-nums">{fmt(t.sgst)}</div>
        </>
      )
    ) : showGst ? (
      <>
        <div className="col-span-6">Tax</div>
        <div className="col-span-6 text-right tabular-nums">{fmt(t.tax)}</div>
      </>
    ) : null;

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
                  <span className="w-28 text-left font-semibold">{meta.numberLabel ?? "Number"}</span>
                  <span className="w-40 text-left">{meta.number || "—"}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">Date</span>
                  <span className="w-40 text-left">{meta.date || "—"}</span>
                </div>
                {meta.time && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">Time</span>
                    <span className="w-40 text-left">{meta.time}</span>
                  </div>
                )}
                {meta.refNumber && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">{meta.refLabel ?? "Ref No"}</span>
                    <span className="w-40 text-left">{meta.refNumber}</span>
                  </div>
                )}
                {meta.paymentMode && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">Payment</span>
                    <span className="w-40 text-left">{meta.paymentMode}</span>
                  </div>
                )}
                {meta.placeOfSupply && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">Place of Supply</span>
                    <span className="w-40 text-left">{meta.placeOfSupply}</span>
                  </div>
                )}
                {meta.reverseCharge && (
                  <div className="flex justify-end gap-2">
                    <span className="w-28 text-left font-semibold">Reverse Charge</span>
                    <span className="w-40 text-left">Yes</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ── Party block + (transport details or totals-preview box) ───── */}
        <div className="grid grid-cols-2 border-b-2 border-black">
          <div className="p-3 border-r-2 border-black">
            <div className="text-[12px] font-bold">{partyLabel}</div>
            <div className="mt-1 text-[12px] font-semibold">{party.name || "—"}</div>
            <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
            <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
              <div className="col-span-4 font-semibold">Mobile</div>
              <div className="col-span-8">{party.mobile || "—"}</div>
              <div className="col-span-4 font-semibold">GST No</div>
              <div className="col-span-8">{party.gstNo || "—"}</div>
            </div>
          </div>

          <div className="p-3">
            {showTransport ? (
              <>
                <div className="text-[12px] font-bold">TRANSPORT DETAILS</div>
                <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
                  <div className="col-span-5 font-semibold">Transporter</div><div className="col-span-7">{meta.transporter || "—"}</div>
                  <div className="col-span-5 font-semibold">Vehicle No</div><div className="col-span-7">{meta.vehicleNumber || "—"}</div>
                  <div className="col-span-5 font-semibold">LR No</div><div className="col-span-7">{meta.lrNumber || "—"}</div>
                  <div className="col-span-5 font-semibold">E-Way Bill No</div><div className="col-span-7">{meta.ewayNumber || "—"}</div>
                </div>
              </>
            ) : (
              <>
                <div className="text-[12px] font-bold">SHIP TO</div>
                <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
                {showAmount && (
                  <div className="mt-3 border border-black p-2">
                    <div className="text-[10px] font-semibold tracking-wider">SUMMARY</div>
                    <div className="mt-1 text-[11px] grid grid-cols-12 gap-y-1">
                      <div className="col-span-6">Subtotal</div>
                      <div className="col-span-6 text-right tabular-nums">{fmt(t.subtotal)}</div>
                      {showDiscount && (
                        <>
                          <div className="col-span-6">Discount</div>
                          <div className="col-span-6 text-right tabular-nums">{fmt(t.discount)}</div>
                        </>
                      )}
                      <TaxSummaryRows />
                      <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                        <div className="font-bold">GRAND TOTAL</div>
                        <div className="font-extrabold text-[14px] tabular-nums">{fmt(t.grandTotal)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Item grid ───────────────────────────────────────────────── */}
        <div className="p-3">
          {purpose && (
            <div className="text-[11px] mb-2"><span className="font-semibold">Purpose of movement:</span> {purpose}</div>
          )}
          <table className="w-full border border-black text-[11px]">
            <thead className="bg-white">
              <tr className="border-b border-black">
                <th className="p-1.5 text-left w-8">Sr</th>
                <th className="p-1.5 text-left w-24">Part No</th>
                {showHsn && <th className="p-1.5 text-left w-20">HSN</th>}
                <th className="p-1.5 text-left">Description</th>
                <th className="p-1.5 text-right w-14">Qty</th>
                {showRate && <th className="p-1.5 text-right w-20">Rate</th>}
                {showGst && <th className="p-1.5 text-right w-14">GST %</th>}
                {showAmount && <th className="p-1.5 text-right w-24">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((it, idx) => (
                  <tr key={`${it.partNumber}-${idx}`} className="border-b border-black last:border-b-0">
                    <td className="p-1.5 align-top">{idx + 1}</td>
                    <td className="p-1.5 align-top font-semibold">{it.partNumber}</td>
                    {showHsn && <td className="p-1.5 align-top">{it.hsn || "—"}</td>}
                    <td className="p-1.5 align-top">{it.description}</td>
                    <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.qty)} {it.unit ?? ""}</td>
                    {showRate && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.rate)}</td>}
                    {showGst && <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.gstPct)}</td>}
                    {showAmount && <td className="p-1.5 align-top text-right tabular-nums font-semibold">{fmt(it.amount)}</td>}
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-2 text-center" colSpan={colCount}>No items</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── Footer: totals+terms for GST docs, signature block for challan-style ── */}
          {showFooter && (showAmount ? (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="border border-black p-2">
                <div className="text-[11px] font-bold mb-1">Terms & Conditions</div>
                <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                  {terms.filter(Boolean).map((term) => <li key={term}>{term}</li>)}
                </ul>
                {showBankDetails && bankDetails && (
                  <div className="mt-3 border-t border-black pt-2 text-[11px]">
                    <div className="font-bold mb-0.5">Bank Details</div>
                    {bankDetails.accountName && <div>A/c Name: {bankDetails.accountName}</div>}
                    {bankDetails.accountNumber && <div>A/c No: {bankDetails.accountNumber}</div>}
                    {bankDetails.bankName && <div>Bank: {bankDetails.bankName}</div>}
                    {bankDetails.branch && <div>Branch: {bankDetails.branch}</div>}
                    {bankDetails.ifsc && <div>IFSC: {bankDetails.ifsc}</div>}
                  </div>
                )}
                <div className="mt-3 text-[11px] font-semibold">Thank you for your business.</div>
              </div>

              <div className="border border-black p-2">
                <div className="text-[11px] font-bold mb-1">Total</div>
                <div className="text-[11px] grid grid-cols-12 gap-y-1">
                  <div className="col-span-6">Subtotal</div>
                  <div className="col-span-6 text-right tabular-nums">{fmt(t.subtotal)}</div>
                  {showDiscount && (
                    <>
                      <div className="col-span-6">Discount</div>
                      <div className="col-span-6 text-right tabular-nums">{fmt(t.discount)}</div>
                    </>
                  )}
                  <TaxSummaryRows />
                  <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                    <div className="font-bold">Grand Total</div>
                    <div className="font-extrabold text-[14px] tabular-nums">{fmt(t.grandTotal)}</div>
                  </div>
                </div>
                {showSignature && (
                  <div className="mt-8 text-right">
                    <div className="text-[11px] font-semibold">Authorized Signature</div>
                    <div className="mt-10 border-t border-black" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-8 text-[11px]">
              <div>
                <p className="font-semibold mb-8">Received the above goods in good condition.</p>
                <div className="border-t border-black pt-1">Receiver's Signature</div>
              </div>
              {showSignature && (
                <div className="text-right">
                  <p className="font-semibold mb-8">For {company.name}</p>
                  <div className="border-t border-black pt-1 inline-block">Authorized Signatory</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
