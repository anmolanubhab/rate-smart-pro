// Universal Template Engine (Locked Decision #13). A template is a pure
// function of a DocumentUdm — it renders visual arrangement only, never
// touches Supabase rows, print_profiles, or component props directly.
// Pagination/@page sizing/multi-copy looping/watermark overlay are the
// PRINT ENGINE's job (src/components/print/printEngine/), not a template's.
//
// This LayoutTemplateRegistry is distinct from the Output Center's
// TemplateRegistry (src/lib/outputCenter/registry.ts, the per-document-type
// action/payload config) — two registries, two responsibilities, never
// cross-imported.

import type { DocumentUdm, TemplateId } from "@/lib/documentUdm/types";

export type { TemplateId };

export type DocumentTemplateRenderer = (props: { udm: DocumentUdm }) => JSX.Element;
