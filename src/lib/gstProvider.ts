// GST Portal Sync — adapter architecture.
//
// No GSP/ASP subscription exists today, so ManualGSTProvider is the only
// implementation: it generates a schema-accurate payload locally and expects
// the caller to submit it to their GSP/the govt portal by hand, then feed
// the response back in. That round trip is exactly today's production
// workflow (EInvoiceEwayDialog.tsx), just moved behind this interface.
//
// A future provider (ClearTaxProvider, IRISProvider, MasterGSTProvider,
// VayanaProvider, ...) implements the same GSTProvider interface and calls
// the real IRP/GSP REST API from a Supabase Edge Function — never from the
// client, and never with the API secret anywhere in this repo. Switching
// modes is then just getGstProvider() returning a different instance; no
// caller of generateIRN/generateEWay/etc. has to change.

import { supabase } from "@/integrations/supabase/client";

export type GstIntegrationMode = "manual" | "api";

export interface GeneratedPayload {
  payload: unknown;
  recordId: string;
}

export interface GSTProvider {
  /** id here is "manual" today; a real provider would report e.g. "cleartax". */
  readonly id: string;
  generateIRN(invoiceId: string): Promise<GeneratedPayload>;
  recordIrnResponse(recordId: string, irn: string, ackNo: string | null, ackDate: string | null, signedQrCode: string | null): Promise<void>;
  cancelIRN(recordId: string, reason: string | null): Promise<void>;
  generateEWay(invoiceId: string, vehicleNumber: string | null, distanceKm: number | null): Promise<GeneratedPayload>;
  recordEwayResponse(recordId: string, ewayBillNo: string, validUntil: string | null): Promise<void>;
  cancelEWay(recordId: string, reason: string | null): Promise<void>;
}

/**
 * The only provider that exists today. Every method wraps an existing
 * einvoice_/ewaybill_ RPC — no network call beyond Supabase itself, no
 * secrets, nothing government-facing. Callers are expected to hand the
 * returned payload to a human, who submits it outside this app.
 */
export class ManualGSTProvider implements GSTProvider {
  readonly id = "manual";

  async generateIRN(invoiceId: string): Promise<GeneratedPayload> {
    const { data, error } = await supabase.rpc("einvoice_generate_payload" as never, { _invoice_id: invoiceId } as never);
    if (error) throw error;
    const result = data as any;
    return { payload: result.payload, recordId: result.record_id };
  }

  async recordIrnResponse(recordId: string, irn: string, ackNo: string | null, ackDate: string | null, signedQrCode: string | null): Promise<void> {
    const { error } = await supabase.rpc("einvoice_record_response" as never, {
      _record_id: recordId, _irn: irn, _ack_no: ackNo, _ack_date: ackDate, _signed_qr_code: signedQrCode,
    } as never);
    if (error) throw error;
  }

  async cancelIRN(recordId: string, reason: string | null): Promise<void> {
    const { error } = await supabase.rpc("einvoice_cancel_record" as never, { _record_id: recordId, _reason: reason } as never);
    if (error) throw error;
  }

  async generateEWay(invoiceId: string, vehicleNumber: string | null, distanceKm: number | null): Promise<GeneratedPayload> {
    const { data, error } = await supabase.rpc("ewaybill_generate_payload" as never, {
      _invoice_id: invoiceId, _vehicle_number: vehicleNumber, _distance_km: distanceKm,
    } as never);
    if (error) throw error;
    const result = data as any;
    return { payload: result.payload, recordId: result.record_id };
  }

  async recordEwayResponse(recordId: string, ewayBillNo: string, validUntil: string | null): Promise<void> {
    const { error } = await supabase.rpc("ewaybill_record_response" as never, {
      _record_id: recordId, _eway_bill_no: ewayBillNo, _valid_until: validUntil,
    } as never);
    if (error) throw error;
  }

  async cancelEWay(recordId: string, reason: string | null): Promise<void> {
    const { error } = await supabase.rpc("ewaybill_cancel_record" as never, { _record_id: recordId, _reason: reason } as never);
    if (error) throw error;
  }
}

/**
 * Mode-driven provider lookup. "api" mode has no implementation yet — the
 * GST Configuration screen keeps it disabled in the UI, but this function
 * falls back to Manual defensively rather than throwing, since a stale
 * `gst_integration_mode: "api"` row (e.g. after a future provider is
 * removed) shouldn't break invoice-level e-Invoice/e-Way generation.
 */
export function getGstProvider(_mode: GstIntegrationMode): GSTProvider {
  return new ManualGSTProvider();
}
