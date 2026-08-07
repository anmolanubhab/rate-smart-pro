import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// "Heat map" here means bin OCCUPANCY density, not a literal floor-plan
// visualization — there's no x/y layout data anywhere in the schema (see
// docs/PRODUCT_STORAGE_MANAGEMENT_DESIGN.md §13), so a real spatial heat map
// isn't buildable yet. This is the honest version: occupancy % per rack,
// colored by density, computed from v_bin_stock_balance (Phase 1) — the
// same "occupied / empty / near-full" numbers the original product vision
// asked for on the dashboard.

const NEAR_FULL_THRESHOLD = 0.85;

interface BinRow { id: string; rack_id: string; capacity_qty: number | null; is_unassigned: boolean }
interface RackRow { id: string; code: string; zone_code: string }
interface BalanceRow { bin_id: string; qty: number }

interface RackStat {
  rack_id: string; rack_code: string; zone_code: string;
  totalBins: number; occupiedBins: number; nearFullBins: number;
}

export default function WarehouseHeatMap({ warehouseId }: { warehouseId: string }) {
  const [loading, setLoading] = useState(true);
  const [racks, setRacks] = useState<RackRow[]>([]);
  const [bins, setBins] = useState<BinRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);

  useEffect(() => {
    if (!warehouseId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: zoneRows } = await supabase
        .from("warehouse_zones" as never)
        .select("id, code")
        .eq("warehouse_id", warehouseId)
        .neq("code", "UNZ"); // system residual zone, hidden everywhere else on this page too
      const zoneIds = ((zoneRows as any[]) ?? []).map((z) => z.id);
      const zoneCodeById = new Map(((zoneRows as any[]) ?? []).map((z) => [z.id, z.code]));

      const { data: rackRows } = await supabase
        .from("warehouse_racks" as never)
        .select("id, code, zone_id")
        .in("zone_id", zoneIds.length ? zoneIds : ["00000000-0000-0000-0000-000000000000"]);
      const rackList = ((rackRows as any[]) ?? []).map((r) => ({ id: r.id, code: r.code, zone_code: zoneCodeById.get(r.zone_id) ?? "—" }));

      const rackIds = rackList.map((r) => r.id);
      const { data: binRows } = await supabase
        .from("warehouse_bins" as never)
        .select("id, rack_id, capacity_qty, is_unassigned")
        .in("rack_id", rackIds.length ? rackIds : ["00000000-0000-0000-0000-000000000000"]);

      const { data: balanceRows } = await supabase
        .from("v_bin_stock_balance" as never)
        .select("bin_id, qty")
        .eq("warehouse_id", warehouseId);

      if (cancelled) return;
      setRacks(rackList);
      setBins(((binRows as any[]) ?? []).map((b) => ({ id: b.id, rack_id: b.rack_id, capacity_qty: b.capacity_qty, is_unassigned: b.is_unassigned })));
      setBalances(((balanceRows as any[]) ?? []) as BalanceRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [warehouseId]);

  const { rackStats, totals } = useMemo(() => {
    const qtyByBin = new Map<string, number>();
    for (const b of balances) qtyByBin.set(b.bin_id, (qtyByBin.get(b.bin_id) ?? 0) + Number(b.qty));

    const binsByRack = new Map<string, BinRow[]>();
    for (const b of bins) {
      if (b.is_unassigned) continue; // system residual bin, not a real storage slot
      if (!binsByRack.has(b.rack_id)) binsByRack.set(b.rack_id, []);
      binsByRack.get(b.rack_id)!.push(b);
    }

    const stats: RackStat[] = racks.map((r) => {
      const rackBins = binsByRack.get(r.id) ?? [];
      let occupied = 0;
      let nearFull = 0;
      for (const b of rackBins) {
        const qty = qtyByBin.get(b.id) ?? 0;
        if (qty > 0) occupied++;
        if (b.capacity_qty && b.capacity_qty > 0 && qty / b.capacity_qty >= NEAR_FULL_THRESHOLD) nearFull++;
      }
      return { rack_id: r.id, rack_code: r.code, zone_code: r.zone_code, totalBins: rackBins.length, occupiedBins: occupied, nearFullBins: nearFull };
    });

    const totalBins = stats.reduce((s, r) => s + r.totalBins, 0);
    const occupiedBins = stats.reduce((s, r) => s + r.occupiedBins, 0);
    const nearFullBins = stats.reduce((s, r) => s + r.nearFullBins, 0);
    return {
      rackStats: stats,
      totals: {
        totalRacks: stats.length,
        totalBins,
        occupiedBins,
        availableBins: totalBins - occupiedBins,
        occupiedPct: totalBins > 0 ? Math.round((occupiedBins / totalBins) * 100) : 0,
        nearFullBins,
      },
    };
  }, [racks, bins, balances]);

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading occupancy…</div>;
  if (racks.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">No zones/racks set up for this warehouse yet.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Total Racks" value={totals.totalRacks} />
        <StatTile label="Total Bins" value={totals.totalBins} />
        <StatTile label="Occupied" value={`${totals.occupiedPct}%`} accent="text-primary" />
        <StatTile label="Available Bins" value={totals.availableBins} accent="text-emerald-600" />
        <StatTile label="Near Full" value={totals.nearFullBins} accent={totals.nearFullBins > 0 ? "text-amber-600" : undefined} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {rackStats.map((r) => {
          const pct = r.totalBins > 0 ? r.occupiedBins / r.totalBins : 0;
          return (
            <div
              key={r.rack_id}
              className={cn(
                "rounded-lg border p-3 text-center",
                pct === 0 ? "bg-muted/30" :
                pct < 0.5 ? "bg-emerald-50 border-emerald-200" :
                pct < NEAR_FULL_THRESHOLD ? "bg-amber-50 border-amber-200" :
                "bg-red-50 border-red-300",
              )}
              title={`${r.occupiedBins} of ${r.totalBins} bins occupied`}
            >
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{r.zone_code}</div>
              <div className="font-mono font-semibold text-sm">{r.rack_code}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.totalBins > 0 ? `${Math.round(pct * 100)}%` : "—"}</div>
              {r.nearFullBins > 0 && <Badge variant="outline" className="mt-1 text-[9px] border-amber-400/50 text-amber-700 bg-amber-100">near full</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const StatTile = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <div className="rounded-xl border bg-card p-3 text-center">
    <div className={cn("font-display text-xl font-bold", accent)}>{value}</div>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
  </div>
);
