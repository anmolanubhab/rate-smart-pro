// src/lib/dateFormat.ts
//
// Single source of truth for date display formatting across the app. The
// business picks a format once (Settings → Accounting Lock → Display
// Preferences); every page that renders a date should go through
// formatDate()/useFormatDate() instead of rendering the raw ISO string or
// calling toLocaleDateString() itself.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";

export type DateFormatCode = "yyyy-mm-dd" | "dd-mm-yyyy" | "dd/mm/yyyy";

export const DATE_FORMAT_OPTIONS: { value: DateFormatCode; label: string }[] = [
  { value: "yyyy-mm-dd", label: "YYYY-MM-DD  (e.g. 2026-07-29)" },
  { value: "dd-mm-yyyy", label: "DD-MM-YYYY  (e.g. 29-07-2026)" },
  { value: "dd/mm/yyyy", label: "DD/MM/YYYY  (e.g. 29/07/2026)" },
];

const DEFAULT_FORMAT: DateFormatCode = "yyyy-mm-dd";

/**
 * Formats an ISO date or datetime string per the given format code.
 * Returns "—" for null/undefined, matching the app's existing convention
 * for missing values. Anything that isn't a recognizable YYYY-MM-DD-leading
 * string is returned as-is rather than silently hidden.
 */
export function formatDate(value: string | null | undefined, format: DateFormatCode = DEFAULT_FORMAT): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const [, yyyy, mm, dd] = m;
  switch (format) {
    case "dd-mm-yyyy":
      return `${dd}-${mm}-${yyyy}`;
    case "dd/mm/yyyy":
      return `${dd}/${mm}/${yyyy}`;
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
}

export async function fetchDateFormat(businessId: string): Promise<DateFormatCode> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("date_format")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return DEFAULT_FORMAT;
  return ((data as any)?.date_format as DateFormatCode) ?? DEFAULT_FORMAT;
}

export async function setDateFormat(businessId: string, format: DateFormatCode): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    date_format: format,
  });
  if (error) throw error;
}

/** The active business's preferred date format — cached, defaults to ISO until loaded/unset. */
export function useDateFormat(): DateFormatCode {
  const { business } = useBusiness();
  const { data } = useQuery({
    queryKey: ["date-format", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchDateFormat(business!.id),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_FORMAT;
}

/** `const fd = useFormatDate(); fd(row.voucher_date)` — formats per the business's chosen format. */
export function useFormatDate() {
  const format = useDateFormat();
  return (value: string | null | undefined) => formatDate(value, format);
}
