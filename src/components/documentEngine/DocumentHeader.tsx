import type { ReactNode } from "react";
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

/** The 12-column grid every document header lives in (Voucher No / Date / Party / ...). */
export function DocumentHeaderGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-x-3 gap-y-1 px-3 py-2 border-b border-border text-[12px]">
      {children}
    </div>
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
  return (
    <div className={`${COL_SPAN[span] ?? COL_SPAN[2]} text-muted-foreground${align === "right" ? " text-right" : ""}`}>
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
  return <div className={`${COL_SPAN[span] ?? COL_SPAN[4]}${className ? ` ${className}` : ""}`}>{children}</div>;
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
