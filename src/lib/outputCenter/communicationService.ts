// CommunicationService — Locked Decisions #7, #8. Email/WhatsApp buttons
// call into this interface with pluggable strategies. Only LinkModeStrategy
// is implemented now: generate a PDF -> upload to the PRIVATE
// document-exports Storage bucket -> mint a signed URL (expiry per the
// business's share_link_expiry setting) -> open a mailto:/wa.me: draft with
// the link prefilled (same window.open pattern PendingOrders.tsx already
// uses). ProviderModeStrategy (Resend/SendGrid/SES) and QueueModeStrategy
// (bulk/enterprise) are named extension points, not built — the UI and
// calling code never change when the backend strategy swaps later.

import { supabase } from "@/integrations/supabase/client";
import { shareLinkExpirySeconds, type ShareLinkExpiry } from "@/lib/shareLinkExpiry";

export interface ShareDocumentPayload {
  businessId: string;
  userId: string;
  pdfBlob: Blob;
  /** e.g. "Invoice-INV-2026-001.pdf" */
  filename: string;
  documentTypeId: string;
  subject: string;
  bodyText: string;
  expiry: ShareLinkExpiry;
}

export interface CommunicationStrategy {
  share(payload: ShareDocumentPayload): Promise<{ url: string }>;
}

/** Uploads to a business-scoped folder ("<business_id>/...") matching the
 *  document-exports bucket's storage.foldername(name)[1]::uuid RLS check. */
async function uploadAndSign(payload: ShareDocumentPayload): Promise<{ url: string; storagePath: string; expiresAt: string | null }> {
  const storagePath = `${payload.businessId}/${payload.documentTypeId}/${Date.now()}-${payload.filename}`;
  const { error: uploadError } = await supabase.storage
    .from("document-exports")
    .upload(storagePath, payload.pdfBlob, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  // From here on, any failure must clean up the just-uploaded object —
  // otherwise a failed sign/log leaves an orphaned PDF in the bucket with no
  // document_share_links row to account for it.
  try {
    const expiresIn = shareLinkExpirySeconds(payload.expiry);
    const { data: signed, error: signError } = await supabase.storage
      .from("document-exports")
      .createSignedUrl(storagePath, expiresIn);
    if (signError || !signed) throw signError ?? new Error("Failed to create signed URL");

    const expiresAt = payload.expiry === "never" ? null : new Date(Date.now() + expiresIn * 1000).toISOString();
    const { error: logError } = await supabase.from("document_share_links" as never).insert({
      business_id: payload.businessId,
      storage_path: storagePath,
      expires_at: expiresAt,
      created_by: payload.userId,
    } as never);
    if (logError) throw logError;

    return { url: signed.signedUrl, storagePath, expiresAt };
  } catch (err) {
    await supabase.storage.from("document-exports").remove([storagePath]);
    throw err;
  }
}

export class LinkModeStrategy implements CommunicationStrategy {
  async share(payload: ShareDocumentPayload): Promise<{ url: string }> {
    const { url } = await uploadAndSign(payload);
    return { url };
  }
}

// Reserved, not implemented (Locked Decision #8) — swapping this in later
// needs zero UI change, only a different CommunicationStrategy passed to
// CommunicationService's constructor.
// export class ProviderModeStrategy implements CommunicationStrategy { ... }
// export class QueueModeStrategy implements CommunicationStrategy { ... }

export class CommunicationService {
  constructor(private strategy: CommunicationStrategy = new LinkModeStrategy()) {}

  async sendEmail(payload: ShareDocumentPayload): Promise<void> {
    const { url } = await this.strategy.share(payload);
    const body = `${payload.bodyText}\n\n${url}`;
    window.open(`mailto:?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(body)}`);
  }

  async sendWhatsApp(payload: ShareDocumentPayload): Promise<void> {
    const { url } = await this.strategy.share(payload);
    const text = `${payload.bodyText}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async copyShareLink(payload: ShareDocumentPayload): Promise<string> {
    const { url } = await this.strategy.share(payload);
    await navigator.clipboard.writeText(url);
    return url;
  }
}

export const communicationService = new CommunicationService();
