// LayoutTemplateRegistry — resolves a TemplateId to its renderer. Distinct
// from src/lib/outputCenter/registry.ts's TemplateRegistry (action/payload
// config) — see templates/types.ts for why the two are never cross-imported.

import type { TemplateId, DocumentTemplateRenderer } from "./types";
import ClassicTemplate from "./classicTemplate";
import ThermalTemplate from "./thermalTemplate";

// Reserved ids (Locked Decision #13/#14) — not implemented at launch.
// Falling back to Classic keeps a profile that picks one of these usable
// today; shipping the real template later needs zero migration, only
// replacing the registry entry below.
export const LayoutTemplateRegistry: Record<TemplateId, DocumentTemplateRenderer> = {
  classic: ClassicTemplate,
  thermal: ThermalTemplate,
  modern: ClassicTemplate,
  gst_standard: ClassicTemplate,
  custom: ClassicTemplate,
};

export function resolveTemplate(id: TemplateId | string | undefined): DocumentTemplateRenderer {
  return LayoutTemplateRegistry[id as TemplateId] ?? LayoutTemplateRegistry.classic;
}
