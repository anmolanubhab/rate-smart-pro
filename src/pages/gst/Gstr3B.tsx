import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { getGstRegistrationType } from "@/lib/gstCalc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { MockColumn } from "@/components/accounts/MockTablePage";
import type { ReportUdm } from "@/lib/documentUdm/types";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outward, setOutward] = useState<TaxLine>({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  const [itc, setItc] = useState<TaxLine>({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  useEffect(() => { document.title = "GSTR-3B Summary — RD Pro"; }, []);

  // RD-Pro's automated GST engine only implements Regular-scheme tax
  // treatment. Composition/Casual/SEZ/Export-only/Unregistered each have
  // their own legal requirements (flat levy, no ITC, CMP-08 instead of
  // GSTR-3B, ...) this engine doesn't implement -- show that explicitly
  // instead of presenting regular-scheme Output/ITC numbers as if they
  // applied, per business_gst_registrations.registration_type.
  const { data: registrationType, isLoading: loadingRegType } = useQuery({
    queryKey: ["gst-registration-type", business?.id, to],
    enabled: !!business?.id,
    queryFn: () => getGstRegistrationType(business!.id, to),
  });
  const isRegular = !registrationType || registrationType === "regular";

  useEffect(() => {
    if (!business) return;
    if (!isRegular) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // ── Outward supplies (sales) ── reads the CGST/SGST/IGST split as
        // actually posted per line item instead of recomputing it here.
        const { data: sInvoices, error: sInvErr } = await supabase
          .from("sales_invoices")
          .select("id, subtotal, discount_total")
          .eq("business_id", business.id)
          .eq("status", "posted")
          .gte("invoice_date", from)
          .lte("invoice_date", to);
        if (sInvErr) throw sInvErr;
        const sIds = ((sInvoices as any[]) ?? []).map((i) => i.id);

        const out: TaxLine = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        for (const inv of (sInvoices as any[]) ?? []) {
          out.taxable += Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0);
        }
        if (sIds.length) {
          const { data: sItems, error: sItemsErr } = await supabase
            .from("sales_invoice_items")
            .select("cgst_amount, sgst_amount, igst_amount")
            .in("invoice_id", sIds);
          if (sItemsErr) throw sItemsErr;
          for (const it of sItems ?? []) {
            out.cgst += Number(it.cgst_amount) || 0;
            out.sgst += Number(it.sgst_amount) || 0;
            out.igst += Number(it.igst_amount) || 0;
          }
        }
        setOutward(out);

        // ── Input Tax Credit (purchases) ──
        const { data: pInvoices, error: pInvErr } = await supabase
          .from("purchase_invoices")
          .select("id, subtotal, discount_total")
          .eq("business_id", business.id)
          .neq("status", "cancelled")
          .gte("invoice_date", from)
          .lte("invoice_date", to);
        if (pInvErr) throw pInvErr;
        const pIds = ((pInvoices as any[]) ?? []).map((i) => i.id);

        const inItc: TaxLine = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        for (const inv of (pInvoices as any[]) ?? []) {
          inItc.taxable += Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0);
        }
        if (pIds.length) {
          const { data: pItems, error: pItemsErr } = await supabase
            .from("purchase_invoice_items")
            .select("cgst_amount, sgst_amount, igst_amount")
            .in("purchase_invoice_id", pIds);
          if (pItemsErr) throw pItemsErr;
          for (const it of pItems ?? []) {
            inItc.cgst += Number(it.cgst_amount) || 0;
            inItc.sgst += Number(it.sgst_amount) || 0;
            inItc.igst += Number(it.igst_amount) || 0;
          }
        }
        setItc(inItc);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load GSTR-3B data");
        setOutward({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        setItc({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [business, from, to, isRegular]);

  const netCgst = outward.cgst - itc.cgst;
  const netSgst = outward.sgst - itc.sgst;
  const netIgst = outward.igst - itc.igst;
  const netTotal = netCgst + netSgst + netIgst;

  const exportColumns: MockColumn[] = [
    { key: "section", label: "Section" },
    { key: "taxable", label: "Taxable Value", align: "right", format: "currency" },
    { key: "cgst", label: "CGST", align: "right", format: "currency" },
    { key: "sgst", label: "SGST", align: "right", format: "currency" },
    { key: "igst", label: "IGST", align: "right", format: "currency" },
  ];
  const exportRows = [
    { section: "Outward Taxable Supplies", taxable: Math.round(outward.taxable), cgst: Math.round(outward.cgst), sgst: Math.round(outward.sgst), igst: Math.round(outward.igst) },
    { section: "Eligible Input Tax Credit", taxable: Math.round(itc.taxable), cgst: Math.round(itc.cgst), sgst: Math.round(itc.sgst), igst: Math.round(itc.igst) },
    { section: "Net Tax Payable", taxable: 0, cgst: Math.round(Math.max(netCgst, 0)), sgst: Math.round(Math.max(netSgst, 0)), igst: Math.round(Math.max(netIgst, 0)) },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">GST</p>
          <h1 className="text-2xl font-bold mt-1">GSTR-3B Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outward tax liability vs. input tax credit for the period — computed from posted invoices, using the same
            CGST/SGST/IGST split logic as ledger posting.
          </p>
        </div>
        <DocumentOutputCenter
          documentTypeId="gstr3b"
          documentNumber="gstr-3b-summary"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "gstr3b",
            title: "GSTR-3B Summary",
            subtitle: `${from} to ${to}`,
            columns: exportColumns,
            rows: exportRows,
            pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={loading || loadingRegType || !isRegular || !!loadError}
        />
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

      {loading || loadingRegType ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Calculating…</div>
      ) : !isRegular ? (
        <div className="text-center py-12 text-sm text-muted-foreground max-w-md mx-auto">
          <p className="font-medium text-foreground">GSTR-3B is not available for a "{registrationType?.replace("_", " ")}" registration.</p>
          <p className="mt-2">
            RD-Pro's automated GST engine only computes standard Regular-scheme output tax and ITC. This business's
            primary GST registration is set to a different type in GST Configuration — file this return manually
            (e.g. quarterly CMP-08 for Composition) or switch the registration type back to Regular if that was set
            in error.
          </p>
        </div>
      ) : loadError ? (
        <div className="text-center py-12 text-sm text-destructive">Could not load GSTR-3B data: {loadError}</div>
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
                  ITC exceeds output tax this period — excess credit carries forward ({inr(Math.abs(netTotal))}).
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
