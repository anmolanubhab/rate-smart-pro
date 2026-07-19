import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function isoMonthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

type TaxLine = { taxable: number; cgst: number; sgst: number; igst: number };

export default function Gstr3B() {
  const { business } = useBusiness();
  const [from, setFrom] = useState(isoMonthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [outward, setOutward] = useState<TaxLine>({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  const [itc, setItc] = useState<TaxLine>({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  useEffect(() => { document.title = "GSTR-3B Summary — RD Pro"; }, []);

  useEffect(() => {
    if (!business) return;
    (async () => {
      setLoading(true);
      const { data: biz } = await supabase.from("businesses").select("gst_number").eq("id", business.id).maybeSingle();
      const sellerGstin = biz?.gst_number ?? null;

      // ── Outward supplies (sales) ──
      const { data: sInvoices } = await supabase
        .from("sales_invoices")
        .select("id, subtotal, discount_total, gst_total, party_id, parties(gst)")
        .eq("business_id", business.id)
        .eq("status", "posted")
        .gte("invoice_date", from)
        .lte("invoice_date", to);

      const out: TaxLine = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      for (const inv of (sInvoices as any[]) ?? []) {
        const taxable = Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0);
        const gst = Number(inv.gst_total ?? 0);
        const buyerGstin = inv.parties?.gst ?? null;
        const { data: split } = await supabase.rpc("gst_split_amounts" as never, {
          _seller_gstin: sellerGstin, _buyer_gstin: buyerGstin, _gst_total: gst,
        } as never);
        const s = (Array.isArray(split) ? split[0] : split) as any;
        out.taxable += taxable;
        out.cgst += Number(s?.cgst ?? 0);
        out.sgst += Number(s?.sgst ?? 0);
        out.igst += Number(s?.igst ?? 0);
      }
      setOutward(out);

      // ── Input Tax Credit (purchases) ──
      const { data: pInvoices } = await supabase
        .from("purchase_invoices")
        .select("id, subtotal, discount_total, gst_total, supplier_id, parties:supplier_id(gst)")
        .eq("business_id", business.id)
        .neq("status", "cancelled")
        .gte("invoice_date", from)
        .lte("invoice_date", to);

      const inItc: TaxLine = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      for (const inv of (pInvoices as any[]) ?? []) {
        const taxable = Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0);
        const gst = Number(inv.gst_total ?? 0);
        const supplierGstin = inv.parties?.gst ?? null;
        const { data: split } = await supabase.rpc("gst_split_amounts" as never, {
          _seller_gstin: supplierGstin, _buyer_gstin: sellerGstin, _gst_total: gst,
        } as never);
        const s = (Array.isArray(split) ? split[0] : split) as any;
        inItc.taxable += taxable;
        inItc.cgst += Number(s?.cgst ?? 0);
        inItc.sgst += Number(s?.sgst ?? 0);
        inItc.igst += Number(s?.igst ?? 0);
      }
      setItc(inItc);
      setLoading(false);
    })();
  }, [business, from, to]);

  const netCgst = outward.cgst - itc.cgst;
  const netSgst = outward.sgst - itc.sgst;
  const netIgst = outward.igst - itc.igst;
  const netTotal = netCgst + netSgst + netIgst;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">GST</p>
        <h1 className="text-2xl font-bold mt-1">GSTR-3B Summary</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Outward tax liability vs. input tax credit for the period — computed from posted invoices, using the same
          CGST/SGST/IGST split logic as ledger posting.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Calculating…</div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">3.1 — Outward Taxable Supplies</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead></TableHead><TableHead className="text-right">Taxable Value</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">IGST</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Sales (this period)</TableCell>
                    <TableCell className="text-right">{inr(outward.taxable)}</TableCell>
                    <TableCell className="text-right">{inr(outward.cgst)}</TableCell>
                    <TableCell className="text-right">{inr(outward.sgst)}</TableCell>
                    <TableCell className="text-right">{inr(outward.igst)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">4 — Eligible Input Tax Credit</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead></TableHead><TableHead className="text-right">Taxable Value</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">IGST</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Purchases (this period)</TableCell>
                    <TableCell className="text-right">{inr(itc.taxable)}</TableCell>
                    <TableCell className="text-right">{inr(itc.cgst)}</TableCell>
                    <TableCell className="text-right">{inr(itc.sgst)}</TableCell>
                    <TableCell className="text-right">{inr(itc.igst)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-primary/40">
            <CardHeader><CardTitle className="text-base">Net Tax Payable (Output − ITC)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead></TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Payable</TableCell>
                    <TableCell className="text-right">{inr(Math.max(netCgst, 0))}</TableCell>
                    <TableCell className="text-right">{inr(Math.max(netSgst, 0))}</TableCell>
                    <TableCell className="text-right">{inr(Math.max(netIgst, 0))}</TableCell>
                    <TableCell className="text-right font-bold">{inr(Math.max(netTotal, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {netTotal < 0 && (
                <p className="text-xs text-muted-foreground p-3">
                  ITC exceeds output tax this period — excess credit carries forward (₹{inr(Math.abs(netTotal))}).
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            This is a working summary for filing reference, not a government-format export. HSN-wise and
            document-wise detail is available in HSN Summary and Sales/Purchase Register.
          </p>
        </>
      )}
    </div>
  );
}
