type ChallanItem = {
  partNumber: string;
  description: string;
  qty: number;
  unit?: string;
};

type ChallanParty = {
  name: string;
  address?: string | null;
  mobile?: string | null;
  gstNo?: string | null;
};

type ChallanCompany = {
  name: string;
  addressLines: string[];
  gstin?: string | null;
};

type ChallanInfo = {
  challanNumber: string;
  date: string;
  orderNumber?: string | null;
  transporter?: string | null;
  vehicleNumber?: string | null;
  lrNumber?: string | null;
  ewayNumber?: string | null;
};

export default function DeliveryChallanPrint({
  company, party, info, items,
  purpose = "Sale on approval / Goods sent for delivery",
}: {
  company: ChallanCompany;
  party: ChallanParty;
  info: ChallanInfo;
  items: ChallanItem[];
  purpose?: string;
}) {
  return (
    <div id="invoice-print" className="invoice-print bg-white text-black font-sans">
      <div className="border-2 border-black">
        <div className="p-3 border-b-2 border-black">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[18px] font-extrabold leading-tight tracking-wide">{company.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug">
                {company.addressLines.filter(Boolean).map((l) => <div key={l}>{l}</div>)}
              </div>
              {company.gstin && (
                <div className="mt-1 text-[11px]"><span className="font-semibold">GSTIN:</span> {company.gstin}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[12px] font-semibold border border-black px-3 py-1 inline-block">
                DELIVERY CHALLAN
              </div>
              <div className="mt-2 text-[11px] leading-snug">
                <div className="flex justify-end gap-2"><span className="w-28 text-left font-semibold">Challan No</span><span className="w-36 text-left">{info.challanNumber}</span></div>
                <div className="flex justify-end gap-2"><span className="w-28 text-left font-semibold">Date</span><span className="w-36 text-left">{info.date}</span></div>
                {info.orderNumber && <div className="flex justify-end gap-2"><span className="w-28 text-left font-semibold">Order No</span><span className="w-36 text-left">{info.orderNumber}</span></div>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-black">
          <div className="p-3 border-r-2 border-black">
            <div className="text-[12px] font-bold">DELIVER TO</div>
            <div className="mt-1 text-[12px] font-semibold">{party.name}</div>
            <div className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">{party.address || "—"}</div>
            <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
              <div className="col-span-4 font-semibold">Mobile</div><div className="col-span-8">{party.mobile || "—"}</div>
              <div className="col-span-4 font-semibold">GST No</div><div className="col-span-8">{party.gstNo || "—"}</div>
            </div>
          </div>
          <div className="p-3">
            <div className="text-[12px] font-bold">TRANSPORT DETAILS</div>
            <div className="mt-2 text-[11px] grid grid-cols-12 gap-y-1">
              <div className="col-span-5 font-semibold">Transporter</div><div className="col-span-7">{info.transporter || "—"}</div>
              <div className="col-span-5 font-semibold">Vehicle No</div><div className="col-span-7">{info.vehicleNumber || "—"}</div>
              <div className="col-span-5 font-semibold">LR No</div><div className="col-span-7">{info.lrNumber || "—"}</div>
              <div className="col-span-5 font-semibold">E-Way Bill No</div><div className="col-span-7">{info.ewayNumber || "—"}</div>
            </div>
          </div>
        </div>

        <div className="p-3">
          <div className="text-[11px] mb-2"><span className="font-semibold">Purpose of movement:</span> {purpose}</div>
          <table className="w-full border border-black text-[11px]">
            <thead>
              <tr className="border-b border-black">
                <th className="p-1.5 text-left w-8">Sr</th>
                <th className="p-1.5 text-left w-28">Part No</th>
                <th className="p-1.5 text-left">Description</th>
                <th className="p-1.5 text-right w-20">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((it, idx) => (
                <tr key={`${it.partNumber}-${idx}`} className="border-b border-black last:border-b-0">
                  <td className="p-1.5">{idx + 1}</td>
                  <td className="p-1.5 font-semibold">{it.partNumber}</td>
                  <td className="p-1.5">{it.description}</td>
                  <td className="p-1.5 text-right tabular-nums">{it.qty} {it.unit ?? ""}</td>
                </tr>
              )) : (
                <tr><td className="p-2 text-center" colSpan={4}>No items</td></tr>
              )}
            </tbody>
          </table>

          <div className="mt-6 grid grid-cols-2 gap-8 text-[11px]">
            <div>
              <p className="font-semibold mb-8">Received the above goods in good condition.</p>
              <div className="border-t border-black pt-1">Receiver's Signature</div>
            </div>
            <div className="text-right">
              <p className="font-semibold mb-8">For {company.name}</p>
              <div className="border-t border-black pt-1 inline-block">Authorized Signatory</div>
            </div>
          </div>
          <p className="mt-4 text-[10px] text-center">This is a delivery challan — not a tax invoice. Goods travel under this document until invoiced.</p>
        </div>
      </div>
    </div>
  );
}
