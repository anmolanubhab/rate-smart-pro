import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tiles = [
  { label: "Published Products", value: "—" },
  { label: "Online Orders", value: "—" },
  { label: "Dealer Network Members", value: "—" },
  { label: "Pending Approvals", value: "—" },
  { label: "Marketplace Status", value: "—" },
];

export default function OnlineCommercePlaceholders() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Online Commerce</h2>
          <p className="text-sm text-muted-foreground">Preparation layer for upcoming ecommerce features.</p>
        </div>
        <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-500/5 text-[10px]">
          Coming Soon
        </Badge>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-card border border-border shadow-soft p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{t.label}</div>
              <Badge variant="outline" className={cn("text-[10px]", "border-amber-500/40 text-amber-700 bg-amber-500/5")}>
                Coming Soon
              </Badge>
            </div>
            <div className="font-display text-2xl font-bold mt-3 tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}


