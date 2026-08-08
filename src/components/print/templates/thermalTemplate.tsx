// The "Thermal" template — a pure extraction of PrintDocument.tsx's original
// compact receipt-style layout for Thermal_80mm/58mm profiles, unchanged
// JSX, now reading from a DocumentUdm instead of loose props. Content only —
// sizing/positioning/watermark overlay live in printEngine/PrintSurface.tsx.

import QrCodeImage from "@/components/print/QrCodeImage";
import { getPrintLabels } from "@/components/print/printLabels";
import type { DocumentTemplateRenderer } from "./types";

const ThermalTemplate: DocumentTemplateRenderer = ({ udm }) => {
  const { company, party, header: meta, items, totals, copyLabel, sections: config } = udm;
  const {
    documentLabel,
    partyLabel = "BILL TO",
    showRate = false,
    showGst = false,
    showAmount = false,
    showDiscount = false,
    showHeader = true,
    showFooter = true,
    logoPosition = "left",
    showSignature = true,
    showParty = true,
    itemGridMode = "product",
    showWeight = false,
    language = "en",
    showQrCode = false,
    purpose,
  } = config;

  const L = getPrintLabels(language);
  const t = totals ?? {};
  const isInterstate = (t.igst ?? 0) > 0;
  const hasGstSplit = showGst && (t.cgst != null || t.sgst != null || t.igst != null);
  const roundOff = t.roundOff ?? 0;
  const fmt = (n?: number | null) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isLedger = itemGridMode === "ledger";
  const totalDebit = isLedger ? items.reduce((s, it) => s + (Number(it.debit) || 0), 0) : 0;
  const totalCredit = isLedger ? items.reduce((s, it) => s + (Number(it.credit) || 0), 0) : 0;

  return (
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
          {meta.irn && <div className="break-all">{L.irn}: {meta.irn}</div>}
        </div>
      )}

      {showParty ? (
        <div className="border-b border-dashed border-black pb-1 mb-1">
          <div className="font-bold">{partyLabel}: {party?.name || "—"}</div>
          {party?.mobile && <div>{L.mobile}: {party.mobile}</div>}
          {party?.gstNo && <div>{L.gstNo}: {party.gstNo}</div>}
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
          {roundOff !== 0 && (
            <div className="flex justify-between"><span>{L.roundOff}</span><span className="tabular-nums">{roundOff > 0 ? "+ " : "− "}{fmt(Math.abs(roundOff))}</span></div>
          )}
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
  );
};

export default ThermalTemplate;
