import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchGstComplianceConfig } from "@/lib/accountingLock";
import { getGstProvider } from "@/lib/gstProvider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
};

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EInvoiceEwayDialog({ open, onOpenChange, invoiceId, invoiceNumber }: Props) {
  const { business } = useBusiness();
  const [busy, setBusy] = useState(false);

  // Drives which GSTProvider handles generate/record/cancel below. Only
  // "manual" exists today (see src/lib/gstProvider.ts) — the moment a real
  // provider lands, changing Integration Mode in GST Configuration is
  // enough to switch this dialog over, no changes needed here.
  const { data: gstConfig } = useQuery({
    queryKey: ["gst-compliance-config", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchGstComplianceConfig(business!.id),
  });
  const provider = getGstProvider(gstConfig?.gst_integration_mode ?? "manual");

  const [einvoicePayload, setEinvoicePayload] = useState<any>(null);
  const [einvoiceRecordId, setEinvoiceRecordId] = useState<string | null>(null);
  const [showEinvoiceJson, setShowEinvoiceJson] = useState(true);
  const [irn, setIrn] = useState("");
  const [ackNo, setAckNo] = useState("");
  const [ackDate, setAckDate] = useState("");
  const [qrCode, setQrCode] = useState("");

  const [vehicleNumber, setVehicleNumber] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [ewayPayload, setEwayPayload] = useState<any>(null);
  const [ewayRecordId, setEwayRecordId] = useState<string | null>(null);
  const [showEwayJson, setShowEwayJson] = useState(true);
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const generateEinvoice = async () => {
    setBusy(true);
    try {
      const result = await provider.generateIRN(invoiceId);
      setEinvoicePayload(result.payload);
      setEinvoiceRecordId(result.recordId);
      setShowEinvoiceJson(true);
      toast.success("IRN JSON generated — ready to submit via your configured GSP.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate e-Invoice payload");
    } finally {
      setBusy(false);
    }
  };

  const recordEinvoiceResponse = async () => {
    if (!einvoiceRecordId) return;
    if (!irn.trim()) { toast.error("IRN is required"); return; }
    setBusy(true);
    try {
      await provider.recordIrnResponse(
        einvoiceRecordId, irn, ackNo || null,
        ackDate ? new Date(ackDate).toISOString() : null, qrCode || null,
      );
      toast.success("IRN recorded — e-Invoice marked generated");
    } catch (e: any) {
      toast.error(e.message ?? "Could not record e-Invoice response");
    } finally {
      setBusy(false);
    }
  };

  const [einvoiceCancelReason, setEinvoiceCancelReason] = useState("");
  const cancelEinvoice = async () => {
    if (!einvoiceRecordId) return;
    setBusy(true);
    try {
      await provider.cancelIRN(einvoiceRecordId, einvoiceCancelReason || null);
      toast.success("e-Invoice cancelled");
      setEinvoiceRecordId(null);
      setEinvoicePayload(null);
      setIrn(""); setAckNo(""); setAckDate(""); setQrCode(""); setEinvoiceCancelReason("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel e-Invoice");
    } finally {
      setBusy(false);
    }
  };

  const generateEway = async () => {
    setBusy(true);
    try {
      const result = await provider.generateEWay(invoiceId, vehicleNumber || null, distanceKm ? Number(distanceKm) : null);
      setEwayPayload(result.payload);
      setEwayRecordId(result.recordId);
      setShowEwayJson(true);
      toast.success("e-Way Bill JSON generated — ready to submit via your configured GSP.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate e-Way Bill payload");
    } finally {
      setBusy(false);
    }
  };

  const [ewayCancelReason, setEwayCancelReason] = useState("");
  const cancelEway = async () => {
    if (!ewayRecordId) return;
    setBusy(true);
    try {
      await provider.cancelEWay(ewayRecordId, ewayCancelReason || null);
      toast.success("e-Way Bill cancelled");
      setEwayRecordId(null);
      setEwayPayload(null);
      setEwayBillNo(""); setValidUntil(""); setEwayCancelReason("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel e-Way Bill");
    } finally {
      setBusy(false);
    }
  };

  const recordEwayResponse = async () => {
    if (!ewayRecordId) return;
    if (!ewayBillNo.trim()) { toast.error("e-Way Bill number is required"); return; }
    setBusy(true);
    try {
      await provider.recordEwayResponse(ewayRecordId, ewayBillNo, validUntil ? new Date(validUntil).toISOString() : null);
      toast.success("e-Way Bill number recorded");
    } catch (e: any) {
      toast.error(e.message ?? "Could not record e-Way Bill response");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>e-Invoice &amp; e-Way Bill — {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Generates a schema-accurate payload locally. This app has no direct IRP/GSP connection — hand the
            payload to your configured GSP or the government portal, then record the response below.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="einvoice">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="einvoice">e-Invoice (IRN)</TabsTrigger>
            <TabsTrigger value="eway">e-Way Bill</TabsTrigger>
          </TabsList>

          <TabsContent value="einvoice" className="space-y-3 mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={generateEinvoice} disabled={busy}>Generate IRN JSON</Button>
              {einvoicePayload && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowEinvoiceJson((s) => !s)}>
                    {showEinvoiceJson ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showEinvoiceJson ? "Hide JSON" : "View JSON"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadJson(einvoicePayload, `irn-${invoiceNumber}.json`)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                  </Button>
                </>
              )}
            </div>
            {einvoicePayload && showEinvoiceJson && (
              <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-auto max-h-52">
                {JSON.stringify(einvoicePayload, null, 2)}
              </pre>
            )}
            {einvoiceRecordId && (
              <div className="space-y-2 border-t pt-3">
                <Badge variant="outline">Update GST Response — enter the IRP/GSP response</Badge>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">IRN</Label><Input value={irn} onChange={(e) => setIrn(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Ack No</Label><Input value={ackNo} onChange={(e) => setAckNo(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Ack Date</Label><Input type="datetime-local" value={ackDate} onChange={(e) => setAckDate(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Signed QR Code</Label><Input value={qrCode} onChange={(e) => setQrCode(e.target.value)} /></div>
                </div>
                <Button size="sm" variant="outline" onClick={recordEinvoiceResponse} disabled={busy}>Update GST Response</Button>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t">
                  <div className="flex-1 space-y-1"><Label className="text-xs">Cancel reason (optional)</Label><Input value={einvoiceCancelReason} onChange={(e) => setEinvoiceCancelReason(e.target.value)} /></div>
                  <Button size="sm" variant="destructive" onClick={cancelEinvoice} disabled={busy}>Cancel e-Invoice</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="eway" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Vehicle Number</Label><Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="BR01AB1234" /></div>
              <div className="space-y-1"><Label className="text-xs">Distance (km)</Label><Input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={generateEway} disabled={busy}>Generate e-Way JSON</Button>
              {ewayPayload && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowEwayJson((s) => !s)}>
                    {showEwayJson ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showEwayJson ? "Hide JSON" : "View JSON"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadJson(ewayPayload, `eway-${invoiceNumber}.json`)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                  </Button>
                </>
              )}
            </div>
            {ewayPayload && showEwayJson && (
              <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-auto max-h-52">
                {JSON.stringify(ewayPayload, null, 2)}
              </pre>
            )}
            {ewayRecordId && (
              <div className="space-y-2 border-t pt-3">
                <Badge variant="outline">Update GST Response — enter the govt portal response</Badge>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">e-Way Bill No</Label><Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Valid Until</Label><Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
                </div>
                <Button size="sm" variant="outline" onClick={recordEwayResponse} disabled={busy}>Update GST Response</Button>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t">
                  <div className="flex-1 space-y-1"><Label className="text-xs">Cancel reason (optional)</Label><Input value={ewayCancelReason} onChange={(e) => setEwayCancelReason(e.target.value)} /></div>
                  <Button size="sm" variant="destructive" onClick={cancelEway} disabled={busy}>Cancel e-Way Bill</Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
