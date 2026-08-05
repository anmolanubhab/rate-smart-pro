// Pricing & Promotion Engine — Phase 1D. Read-only on this side —
// mutations happen on the price list's own Assignments tab
// (src/components/pricing/PriceListAssignmentsTab.tsx), one place to
// change data instead of two CRUD surfaces for the same rows.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPartyAssignments, type PartyPriceAssignmentRow } from "@/lib/pricing/partyPriceAssignment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFormatDate } from "@/lib/dateFormat";

interface Props {
  partyId: string;
  businessId: string;
}

interface RuleTargetRow {
  rule_id: string;
  rule: { name: string; rule_type: string; status: string } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  created_at: string;
  new_value: any;
  old_value: any;
}

export default function PartyPricingCard({ partyId, businessId }: Props) {
  const fd = useFormatDate();
  const [assignments, setAssignments] = useState<PartyPriceAssignmentRow[] | null>(null);
  const [rules, setRules] = useState<RuleTargetRow[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    fetchPartyAssignments(partyId).then(setAssignments).catch(() => setAssignments([]));

    supabase
      .from("pricing_rule_targets" as any)
      .select("rule_id, rule:pricing_rules(name, rule_type, status)")
      .eq("target_type", "PARTY")
      .eq("target_id", partyId)
      .then(({ data }) => setRules(((data as unknown as RuleTargetRow[]) ?? []).filter((r) => r.rule?.status === "active")));

    supabase
      .from("audit_logs")
      .select("id, action, created_at, new_value, old_value")
      .eq("business_id", businessId)
      .eq("entity_type", "party_price_assignments")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const rows = ((data as HistoryEntry[]) ?? []).filter(
          (r) => r.new_value?.party_id === partyId || r.old_value?.party_id === partyId
        );
        setHistory(rows.slice(0, 8));
      });
  }, [partyId, businessId]);

  const active = (assignments ?? []).filter((a) => a.is_active);
  const primary = active[0] ?? null; // already sorted by priority ascending in fetchPartyAssignments

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Resolved Price List</p>
          {primary ? (
            <div className="flex items-center gap-2">
              {primary.priority <= 1 && <Star className="h-3.5 w-3.5 text-amber-500" />}
              <span className="font-semibold text-sm">{primary.price_list?.name ?? "—"}</span>
              <Badge variant="outline" className="text-[10px]">priority {primary.priority}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No price list assigned — using default/fallback pricing.</p>
          )}
        </div>

        {active.length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">All Active Assignments</p>
            <div className="space-y-1">
              {active.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs rounded border px-2 py-1">
                  <span>{a.price_list?.name ?? "—"}</span>
                  <span className="text-muted-foreground">priority {a.priority} · {a.effective_from} → {a.effective_to ?? "open"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Tag className="h-3 w-3" /> Active Pricing Rules for this Party
          </div>
          {!rules || rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active special pricing rules. Managed via Pricing Rules (Phase 2).</p>
          ) : (
            <div className="space-y-1">
              {rules.map((r) => (
                <div key={r.rule_id} className="text-xs rounded border px-2 py-1">{r.rule?.name} <span className="text-muted-foreground">[{r.rule?.rule_type}]</span></div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Assignment History</p>
          {!history || history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.id} className="text-xs text-muted-foreground">
                  {fd(h.created_at)} — {h.action.replace(/_/g, " ").toLowerCase()}
                </div>
              ))}
            </div>
          )}
        </div>

        <Link to="/pricing/price-lists" className="text-xs text-primary hover:underline">Manage assignments from Price Lists →</Link>
      </CardContent>
    </Card>
  );
}
