// The "Classic" template — a pure extraction of PrintDocument.tsx's original
// bordered A4-style layout (Header / Party Block / Item Grid / Tax Summary /
// Totals / Footer), unchanged JSX, now reading from a DocumentUdm instead of
// loose props. Content only — sizing/positioning/watermark overlay live in
// printEngine/PrintSurface.tsx, not here.

import QrCodeImage from "@/components/print/QrCodeImage";
import { getPrintLabels } from "@/components/print/printLabels";
import type { DocumentTemplateRenderer } from "./types";

const DEFAULT_TERMS = ["Goods once sold will not be taken back.", "E. & O.E."];

const ClassicTemplate: DocumentTemplateRenderer = ({ udm }) => {
  const { company, party, header: meta, items, totals, copyLabel, sections: config } = udm;
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
  } = config;

  const L = getPrintLabels(language);
  const t = totals ?? {};
  const isInterstate = (t.igst ?? 0) > 0;
  const hasGstSplit = showGst && (t.cgst != null || t.sgst != null || t.igst != null);
  const roundOff = t.roundOff ?? 0;
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

  return (
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
              {meta.irn && (
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">{L.irn}</span>
                  <span className="w-40 text-left break-all">{meta.irn}</span>
                </div>
              )}
              {meta.ackNo && (
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">{L.ackNo}</span>
                  <span className="w-40 text-left">{meta.ackNo}</span>
                </div>
              )}
              {meta.ackDate && (
                <div className="flex justify-end gap-2">
                  <span className="w-28 text-left font-semibold">{L.ackDate}</span>
                  <span className="w-40 text-left">{meta.ackDate}</span>
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
          <div className="mt-1 text-[12px] font-semibold">{party?.name || "—"}</div>
          <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party?.address || "—"}</div>
          <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
            <div className="col-span-4 font-semibold">{L.mobile}</div>
            <div className="col-span-8">{party?.mobile || "—"}</div>
            <div className="col-span-4 font-semibold">{L.gstNo}</div>
            <div className="col-span-8">{party?.gstNo || "—"}</div>
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
                {meta.distanceKm != null && (
                  <>
                    <div className="col-span-5 font-semibold">{L.distance}</div><div className="col-span-7">{meta.distanceKm}</div>
                  </>
                )}
                {meta.validUntil && (
                  <>
                    <div className="col-span-5 font-semibold">{L.validUntil}</div><div className="col-span-7">{meta.validUntil}</div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-[12px] font-bold">{L.shipTo}</div>
              <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party?.address || "—"}</div>
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
                    {roundOff !== 0 && (
                      <>
                        <div className="col-span-6">{L.roundOff}</div>
                        <div className="col-span-6 text-right tabular-nums">{roundOff > 0 ? "+ " : "− "}{fmt(Math.abs(roundOff))}</div>
                      </>
                    )}
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
                {!!t.roundOff && (
                  <>
                    <div className="col-span-6">{L.roundOff}</div>
                    <div className="col-span-6 text-right tabular-nums">{t.roundOff > 0 ? "+ " : "− "}{fmt(Math.abs(t.roundOff))}</div>
                  </>
                )}
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
  );
};

export default ClassicTemplate;
