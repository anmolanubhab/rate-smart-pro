import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "warning" | "primary" | "success" | "destructive";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-[10px]",
  warning: "border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px]",
  primary: "border-primary/40 text-primary bg-primary/5 text-[10px]",
  success: "border-emerald-500/40 text-emerald-600 bg-emerald-500/5 text-[10px]",
  destructive: "border-destructive/40 text-destructive bg-destructive/5 text-[10px]",
};

/**
 * Default tone per lifecycle word. Any status string not listed falls back
 * to "neutral" so new statuses never crash — callers can still pass an
 * explicit `tone` to override.
 */
const DEFAULT_TONE_BY_STATUS: Record<string, Tone> = {
  draft: "warning",
  pending: "warning",
  pending_approval: "warning",
  submitted: "warning",
  approved: "primary",
  posted: "primary",
  ordered: "primary",
  sent: "primary",
  received: "success",
  partially_received: "warning",
  partially_paid: "warning",
  paid: "success",
  closed: "neutral",
  converted: "primary",
  rejected: "destructive",
  cancelled: "destructive",
  reversed: "destructive",
};

/**
 * Generic status pill used identically across every document's toolbar and
 * list rows. Formats the status label (`pending_approval` -> "Pending
 * Approval") and picks a tone from the shared map unless overridden.
 */
export function DocumentStatusBadge({
  status,
  tone,
  label,
}: {
  status: string;
  tone?: Tone;
  /** Override the display text; defaults to a title-cased version of `status`. */
  label?: string;
}) {
  const resolvedTone = tone ?? DEFAULT_TONE_BY_STATUS[status] ?? "neutral";
  const text = label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant="outline" className={TONE_CLASS[resolvedTone]}>
      {text}
    </Badge>
  );
}
