type InvoicePrintItem = {
  partNumber: string;
  productName: string;
  qty: number;
  rate: number;
  gstPct: number;
  amount: number;
};

type InvoicePrintTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
};

type InvoicePrintParty = {
  name: string;
  mobile?: string | null;
  address?: string | null;
  gstNo?: string | null;
};

type InvoicePrintCompany = {
  name: string;
  addressLines: string[];
  gstin?: string | null;
  logoUrl?: string | null;
};

type InvoicePrintInfo = {
  invoiceNumber: string;
  date: string;
  time?: string | null;
  paymentMode?: string | null;
};

export default function InvoicePrint({
  company,
  party,
  info,
  items,
  totals,
  terms = ["Goods once sold will not be taken back.", "E. & O.E."],
}: {
  company: InvoicePrintCompany;
  party: InvoicePrintParty;
  info: InvoicePrintInfo;
  items: InvoicePrintItem[];
  totals: InvoicePrintTotals;
  terms?: string[];
}) {
  const fmt = (n: number) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div id="invoice-print" className="invoice-print bg-white text-black font-sans">
      <div className="border-2 border-black">
        <div className="p-3 border-b-2 border-black">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 border border-black flex items-center justify-center overflow-hidden">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt="Company Logo" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-[10px] font-semibold tracking-wide">LOGO</div>
                )}
              </div>
              <div>
                <div className="text-[18px] font-extrabold leading-tight tracking-wide">{company.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug">
                  {company.addressLines.filter(Boolean).map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
                <div className="mt-1 text-[11px]">
                  <span className="font-semibold">GSTIN:</span>{" "}
                  <span className="font-semibold">{company.gstin || "—"}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[12px] font-semibold border border-black px-3 py-1 inline-block">
                TAX INVOICE
              </div>
              <div className="mt-2 text-[11px] leading-snug">
                <div className="flex justify-end gap-2">
                  <span className="w-24 text-left font-semibold">Invoice No</span>
                  <span className="w-40 text-left">{info.invoiceNumber || "—"}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="w-24 text-left font-semibold">Date</span>
                  <span className="w-40 text-left">{info.date || "—"}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="w-24 text-left font-semibold">Time</span>
                  <span className="w-40 text-left">{info.time || "—"}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <span className="w-24 text-left font-semibold">Payment</span>
                  <span className="w-40 text-left">{info.paymentMode || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-black">
          <div className="p-3 border-r-2 border-black">
            <div className="text-[12px] font-bold">BILL TO</div>
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
            <div className="text-[12px] font-bold">SHIP TO</div>
            <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
            <div className="mt-3 border border-black p-2">
              <div className="text-[10px] font-semibold tracking-wider">INVOICE SUMMARY</div>
              <div className="mt-1 text-[11px] grid grid-cols-12 gap-y-1">
                <div className="col-span-6">Subtotal</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.subtotal)}</div>
                <div className="col-span-6">Discount</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.discount)}</div>
                <div className="col-span-6">Tax</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.tax)}</div>
                <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                  <div className="font-bold">GRAND TOTAL</div>
                  <div className="font-extrabold text-[14px] tabular-nums">{fmt(totals.grandTotal)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3">
          <table className="w-full border border-black text-[11px]">
            <thead className="bg-white">
              <tr className="border-b border-black">
                <th className="p-1.5 text-left w-8">Sr</th>
                <th className="p-1.5 text-left w-28">Part No</th>
                <th className="p-1.5 text-left">Product Name</th>
                <th className="p-1.5 text-right w-14">Qty</th>
                <th className="p-1.5 text-right w-20">Rate</th>
                <th className="p-1.5 text-right w-14">GST %</th>
                <th className="p-1.5 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((it, idx) => (
                  <tr key={`${it.partNumber}-${idx}`} className="border-b border-black last:border-b-0">
                    <td className="p-1.5 align-top">{idx + 1}</td>
                    <td className="p-1.5 align-top font-semibold">{it.partNumber}</td>
                    <td className="p-1.5 align-top">{it.productName}</td>
                    <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.qty)}</td>
                    <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.rate)}</td>
                    <td className="p-1.5 align-top text-right tabular-nums">{fmt(it.gstPct)}</td>
                    <td className="p-1.5 align-top text-right tabular-nums font-semibold">{fmt(it.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-2 text-center" colSpan={7}>
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="border border-black p-2">
              <div className="text-[11px] font-bold mb-1">Terms & Conditions</div>
              <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                {terms.filter(Boolean).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] font-semibold">Thank you for your business.</div>
            </div>

            <div className="border border-black p-2">
              <div className="text-[11px] font-bold mb-1">Total</div>
              <div className="text-[11px] grid grid-cols-12 gap-y-1">
                <div className="col-span-6">Subtotal</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.subtotal)}</div>
                <div className="col-span-6">Discount</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.discount)}</div>
                <div className="col-span-6">Tax</div>
                <div className="col-span-6 text-right tabular-nums">{fmt(totals.tax)}</div>
                <div className="col-span-12 border-t border-black mt-1 pt-1 flex items-center justify-between">
                  <div className="font-bold">Grand Total</div>
                  <div className="font-extrabold text-[14px] tabular-nums">{fmt(totals.grandTotal)}</div>
                </div>
              </div>
              <div className="mt-8 text-right">
                <div className="text-[11px] font-semibold">Authorized Signature</div>
                <div className="mt-10 border-t border-black" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

