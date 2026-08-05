// Pricing & Promotion Engine — Phase 1D. Small read-only line inside
// Parties.tsx's existing "Pricing" tab (default_discount/agreed_discount/
// rate_category — the standalone RD Calculator's fields, left untouched).
// Actual assignment management happens on the Party Dashboard / the price
// list's own Assignments tab — this is just a pointer.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tag } from "lucide-react";
import { fetchPartyAssignments } from "@/lib/pricing/partyPriceAssignment";
import { Button } from "@/components/ui/button";

export default function PartyPriceListSummary({ partyId }: { partyId?: string }) {
  const navigate = useNavigate();
  const [priceListName, setPriceListName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!partyId) return;
    fetchPartyAssignments(partyId)
      .then((rows) => setPriceListName(rows.find((r) => r.is_active)?.price_list?.name ?? null))
      .catch(() => setPriceListName(null));
  }, [partyId]);

  if (!partyId) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground md:col-span-2">
        Save the party first to assign a price list.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
      <div className="flex items-center gap-2 text-sm">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        Price List: <span className="font-medium">{priceListName === undefined ? "…" : priceListName ?? "Not assigned"}</span>
      </div>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/parties/${partyId}`)}>
        Manage on Party Dashboard →
      </Button>
    </div>
  );
}
