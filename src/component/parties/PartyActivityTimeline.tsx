import { useEffect, useState } from "react";
import {
  UserPlus, ArrowLeftRight, CreditCard, FileText, ShoppingCart,
  ReceiptIndianRupee, Percent, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LogRow = {
  id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
};

const ICONS: Record<string, typeof UserPlus> = {
  created: UserPlus,
  group_changed: ArrowLeftRight,
  credit_changed: CreditCard,
  discount_changed: Percent,
  order_placed: ShoppingCart,
  invoice_created: FileText,
  payment_received: ReceiptIndianRupee,
};

export default function PartyActivityTimeline({ partyId }: { partyId?: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partyId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("party_activity_logs")
        .select("id, activity_type, description, created_at")
        .eq("party_id", partyId)
        .order("created_at", { ascending: false })
        .limit(100);
      setLogs((data as LogRow[]) ?? []);
      setLoading(false);
    })();
  }, [partyId]);

  if (!partyId) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Save the party first — activity will appear here once it exists.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No activity yet. Orders, invoices, payments, and profile changes will show up here automatically.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {logs.map((log, i) => {
        const Icon = ICONS[log.activity_type] ?? Clock;
        return (
          <div key={log.id} className="flex gap-3 relative pb-4">
            {i < logs.length - 1 && (
              <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
            )}
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 z-10">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="pt-1">
              <p className="text-sm">{log.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(log.created_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
