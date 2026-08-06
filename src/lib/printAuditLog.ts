// Universal Document Output Center — append-only print audit log (Locked
// Decision #16). Written by PrintService/CommunicationService on every
// output action; hasBeenPrintedBefore() also powers the typed watermark
// system's reprint detection (Locked Decision #17).

import { supabase } from "@/integrations/supabase/client";

export type PrintAuditAction = "preview" | "direct_print" | "pdf" | "excel" | "email" | "whatsapp" | "share_link";

export interface PrintAuditLogEntry {
  businessId: string;
  userId: string;
  documentTypeId: string;
  documentId?: string | null;
  documentNumber?: string | null;
  action: PrintAuditAction;
  copyLabels?: string[];
  templateId?: string;
}

/** Checked before building a document's watermark — a prior direct_print or
 *  pdf action against the same document_id means this run should read
 *  REPRINT (unless status/copy-identity outrank it — see resolveWatermark). */
export async function hasBeenPrintedBefore(businessId: string, documentTypeId: string, documentId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("print_audit_log" as never)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("document_type_id", documentTypeId)
    .eq("document_id", documentId)
    .in("action", ["direct_print", "pdf"]);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function logPrintAction(entry: PrintAuditLogEntry): Promise<void> {
  const { error } = await supabase.from("print_audit_log" as never).insert({
    business_id: entry.businessId,
    user_id: entry.userId,
    document_type_id: entry.documentTypeId,
    document_id: entry.documentId ?? null,
    document_number: entry.documentNumber ?? null,
    action: entry.action,
    copy_labels: entry.copyLabels ?? null,
    template_id: entry.templateId ?? null,
  } as never);
  if (error) throw error;
}
