import { useEffect, useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export interface BinOption {
  id: string;
  location_code: string | null;
  bin_code: string;
  shelf_code: string | null;
  bin_type: string;
  status: string;
  is_unassigned: boolean;
  rack_code: string;
  rack_id: string;
}

interface Props {
  /** Scope the bin list to this warehouse. No bins are shown until a warehouse is picked. */
  warehouseId: string | null;
  value: string | null;
  onChange: (binId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Hide one bin from the list — e.g. exclude the source bin from a "move to" picker. */
  excludeBinId?: string | null;
  /** Include the warehouse's auto-created "Unassigned" residual bin in the list. Off by default — it's a system bin, not a normal put-away target. */
  includeUnassigned?: boolean;
  className?: string;
}

export default function BinLocationPicker({
  warehouseId, value, onChange, placeholder = "Select bin (optional)…",
  disabled, excludeBinId, includeUnassigned = false, className,
}: Props) {
  const [bins, setBins] = useState<BinOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!warehouseId) { setBins([]); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("warehouse_bins" as never)
      .select("id, location_code, bin_code, shelf_code, bin_type, status, is_unassigned, rack:warehouse_racks!inner(id, code, zone:warehouse_zones!inner(warehouse_id))")
      .eq("rack.zone.warehouse_id", warehouseId)
      .order("location_code", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setBins([]); setLoading(false); return; }
        const rows = ((data as any[]) ?? []).map((r) => ({
          id: r.id,
          location_code: r.location_code,
          bin_code: r.bin_code,
          shelf_code: r.shelf_code,
          bin_type: r.bin_type,
          status: r.status,
          is_unassigned: r.is_unassigned,
          rack_code: r.rack?.code ?? "",
          rack_id: r.rack?.id ?? "",
        })) as BinOption[];
        setBins(rows);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [warehouseId]);

  const visible = bins.filter((b) => (includeUnassigned || !b.is_unassigned) && b.id !== excludeBinId);
  const byRack = new Map<string, BinOption[]>();
  for (const b of visible) {
    const key = b.rack_code || "—";
    if (!byRack.has(key)) byRack.set(key, []);
    byRack.get(key)!.push(b);
  }

  return (
    <Select
      value={value ?? "__auto__"}
      onValueChange={(v) => onChange(v === "__auto__" ? null : v)}
      disabled={disabled || !warehouseId}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={!warehouseId ? "Select warehouse first…" : loading ? "Loading bins…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__auto__">Auto (product default / unassigned)</SelectItem>
        {Array.from(byRack.entries()).map(([rackCode, rackBins]) => (
          <SelectGroup key={rackCode}>
            <SelectLabel>Rack {rackCode}</SelectLabel>
            {rackBins.map((b) => (
              <SelectItem key={b.id} value={b.id} disabled={b.status !== "active"}>
                {b.location_code ?? b.bin_code}
                {b.status !== "active" ? ` (${b.status})` : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {!loading && visible.length === 0 && warehouseId && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No bins set up for this warehouse yet.</div>
        )}
      </SelectContent>
    </Select>
  );
}
