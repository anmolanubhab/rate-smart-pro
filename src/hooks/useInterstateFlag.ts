import { useQuery } from "@tanstack/react-query";
import { resolveIsInterstate } from "@/lib/gstCalc";

/**
 * Shared interstate/intrastate resolution for document *preview* screens
 * (Quotation, Sales/Purchase Order, Sales Return) that show a CGST/SGST/IGST
 * breakup before the document is actually posted. These screens used to
 * hardcode CGST = SGST = gstTotal/2 and never checked the buyer's state,
 * which silently mislabeled an interstate transaction on-screen even though
 * final posting (salesInvoices.ts/purchaseInvoices.ts) always resolved it
 * correctly via this same resolveIsInterstate() helper.
 *
 * `data` is `undefined` while resolving and `null` if resolution failed
 * (e.g. RPC error) -- callers should treat both as "unknown" and fall back
 * to a neutral CGST/SGST-looking preview rather than asserting IGST, but
 * should surface `isError` so the user knows the split is unconfirmed
 * rather than silently trusting a guess.
 */
export function useInterstateFlag(sellerGstin: string | null | undefined, buyerGstin: string | null | undefined) {
  const query = useQuery({
    queryKey: ["gst-is-interstate", sellerGstin ?? null, buyerGstin ?? null],
    queryFn: () => resolveIsInterstate(sellerGstin, buyerGstin),
    enabled: true,
    retry: false,
    staleTime: 60_000,
  });
  return {
    isInterstate: query.data ?? false,
    isResolved: query.isSuccess,
    isError: query.isError,
  };
}
