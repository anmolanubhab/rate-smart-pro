// Print Engine (Locked Decision #13): sizing wrapper + the one shared
// watermark overlay, replacing the watermark JSX that used to be duplicated
// in PrintDocument.tsx's standard and thermal branches. Templates render
// content only; PrintSurface owns the `.invoice-print` positioning class and
// the diagonal watermark banner on top of whatever template is passed as
// children.

import type { ReactNode } from "react";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export function PrintSurface({
  udm,
  variant = "standalone",
  children,
}: {
  udm: Pick<DocumentUdm, "watermark" | "templateId">;
  /** "standalone" (default): this is the only print target on the page, so
   *  it carries its own `.invoice-print` positioning/visibility rules.
   *  "page": one page inside a `.print-copy-run` multi-copy container, which
   *  owns positioning/visibility itself — this renders as a plain block. */
  variant?: "standalone" | "page";
  children: ReactNode;
}) {
  const isThermal = udm.templateId === "thermal";
  return (
    <div
      id={variant === "standalone" ? "invoice-print" : undefined}
      className={variant === "standalone" ? "invoice-print bg-white text-black font-sans relative" : "bg-white text-black font-sans relative"}
    >
      {udm.watermark.type !== "none" && udm.watermark.text && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-10">
          <span className={`${isThermal ? "text-[40px]" : "text-[90px]"} font-black uppercase tracking-widest text-black/10 -rotate-45 whitespace-nowrap`}>
            {udm.watermark.text}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
