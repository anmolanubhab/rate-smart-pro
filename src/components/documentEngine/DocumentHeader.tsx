import { createContext, useContext, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

/**
 * Tailwind's JIT scanner only picks up class names that appear literally in
 * source — `col-span-${n}` template interpolation would silently produce no
 * CSS. This map is the fixed set of spans header fields actually use across
 * every document today (verified against CreateOrder.tsx/CreateQuotation.tsx);
 * extend it (with a literal `col-span-N` string) if a future document needs
 * a span not listed here.
 */
const COL_SPAN: Record<number, string> = {
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  10: "col-span-10",
  12: "col-span-12",
};

/**
 * Same idea, for the `mobileResponsive` grid variant (CreatePurchaseOrder.tsx's
 * pattern): every cell — label or value, whatever its desktop span — takes
 * exactly half the 2-column mobile grid, then its real span kicks in at
 * `md:`. Literal strings again, for the same Tailwind-scanner reason above.
 */
const COL_SPAN_RESPONSIVE: Record<number, string> = {
  2: "col-span-1 md:col-span-2",
  3: "col-span-1 md:col-span-3",
  4: "col-span-1 md:col-span-4",
  5: "col-span-1 md:col-span-5",
  6: "col-span-1 md:col-span-6",
  7: "col-span-1 md:col-span-7",
  8: "col-span-1 md:col-span-8",
  10: "col-span-1 md:col-span-10",
  12: "col-span-1 md:col-span-12",
};

const HeaderGridResponsiveContext = createContext(false);

/**
 * The 12-column grid every document header lives in (Voucher No / Date /
 * Party / ...). `mobileResponsive` (CreatePurchaseOrder.tsx's original
 * behavior) switches to a 2-column mobile grid instead of forcing all 12
 * columns into a narrow viewport — every DocumentHeaderLabel/Value/
 * InputField inside picks this up automatically via context, no per-field
 * prop needed.
 */
export function DocumentHeaderGrid({ children, mobileResponsive = false }: { children: ReactNode; mobileResponsive?: boolean }) {
  return (
    <HeaderGridResponsiveContext.Provider value={mobileResponsive}>
      <div className={`grid ${mobileResponsive ? "grid-cols-2 md:grid-cols-12" : "grid-cols-12"} gap-x-3 gap-y-1 px-3 py-2 border-b border-border text-[12px]`}>
        {children}
      </div>
    </HeaderGridResponsiveContext.Provider>
  );
}

/** A label cell, e.g. "Voucher No" / "Party A/c Name" — always paired with a DocumentHeaderValue. */
export function DocumentHeaderLabel({
  children,
  span = 2,
  align = "left",
}: {
  children: ReactNode;
  span?: number;
  align?: "left" | "right";
}) {
  const responsive = useContext(HeaderGridResponsiveContext);
  const spanMap = responsive ? COL_SPAN_RESPONSIVE : COL_SPAN;
  const fallback = responsive ? COL_SPAN_RESPONSIVE[2] : COL_SPAN[2];
  // self-center only in the responsive/2-col-mobile variant, matching
  // CreatePurchaseOrder.tsx's original — Order/Quotation/Return's
  // non-responsive header rows never had it and shouldn't visually shift.
  const selfCenter = responsive ? " self-center" : "";
  const alignClass = align === "right" ? (responsive ? " md:text-right" : " text-right") : "";
  return (
    <div className={`${spanMap[span] ?? fallback} text-muted-foreground${selfCenter}${alignClass}`}>
      {children}
    </div>
  );
}

/** The value cell next to a DocumentHeaderLabel — wraps arbitrary content (input, text, badges). */
export function DocumentHeaderValue({
  children,
  span = 4,
  className,
}: {
  children: ReactNode;
  span?: number;
  className?: string;
}) {
  const responsive = useContext(HeaderGridResponsiveContext);
  const spanMap = responsive ? COL_SPAN_RESPONSIVE : COL_SPAN;
  const fallback = responsive ? COL_SPAN_RESPONSIVE[4] : COL_SPAN[4];
  return <div className={`${spanMap[span] ?? fallback}${className ? ` ${className}` : ""}`}>{children}</div>;
}

const inputBaseClass =
  "h-6 text-[12px] font-mono px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary";

/**
 * A label+input pair in one call — the common case (most header fields are
 * just "label + plain text/date/number input"). For anything richer
 * (entity search, read-only computed text, badges) use
 * DocumentHeaderLabel/DocumentHeaderValue directly instead.
 */
export function DocumentHeaderInputField({
  label,
  labelSpan = 2,
  labelAlign = "left",
  valueSpan = 4,
  ...inputProps
}: {
  label: ReactNode;
  labelSpan?: number;
  labelAlign?: "left" | "right";
  valueSpan?: number;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <DocumentHeaderLabel span={labelSpan} align={labelAlign}>
        {label}
      </DocumentHeaderLabel>
      <DocumentHeaderValue span={valueSpan}>
        <Input {...inputProps} className={inputProps.className ?? inputBaseClass} />
      </DocumentHeaderValue>
    </>
  );
}
