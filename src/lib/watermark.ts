// Universal Document Output Center — typed Watermark system (Locked
// Decision #17). Pure function: cancelled/draft status always outranks
// copy-identity, which outranks reprint-detection, so a cancelled document
// reads "CANCELLED" no matter which copy or how many times it's been
// reprinted. Replaces PrintConfig.showWatermark/watermarkText entirely —
// DocumentUdm.watermark is always derived here, never a manual flag.

import type { UdmWatermark } from "@/lib/documentUdm/types";

export interface WatermarkInput {
  status?: string | null;
  copyLabel?: string | null;
  isReprint: boolean;
}

export function resolveWatermark(input: WatermarkInput): UdmWatermark {
  const status = input.status?.toLowerCase();
  if (status === "cancelled") return { type: "cancelled", text: "CANCELLED" };
  if (status === "draft") return { type: "draft", text: "DRAFT" };
  if (input.copyLabel && /duplicate|triplicate/i.test(input.copyLabel)) {
    return { type: "duplicate", text: input.copyLabel.toUpperCase() };
  }
  if (input.isReprint) return { type: "reprint", text: "REPRINT" };
  return { type: "none", text: null };
}
