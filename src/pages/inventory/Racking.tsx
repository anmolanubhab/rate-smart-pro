import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { ChevronRight, Plus, Pencil, MoreVertical, GitMerge, Split, Lock, QrCode as QrCodeIcon, Printer, LayoutGrid, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BinLocationPicker from "@/components/inventory/BinLocationPicker";
import QrCodeImage from "@/components/print/QrCodeImage";
import WarehouseHeatMap from "@/components/inventory/WarehouseHeatMap";

interface WarehouseOpt { id: string; warehouse_name: string; is_default: boolean }
interface ZoneRow { id: string; code: string; name: string | null; is_active: boolean }
interface RackRow { id: string; code: string; name: string | null; status: string }
interface BinRow {
  id: string; shelf_code: string | null; bin_code: string; location_code: string | null; scan_code: string | null;
  bin_type: string; status: string; capacity_qty: number | null; capacity_weight: number | null;
  capacity_volume: number | null; is_locked: boolean; is_unassigned: boolean; merged_into_bin_id: string | null;
}

const BIN_TYPES = ["NORMAL", "RETURN", "DAMAGE", "QC", "RESERVED", "STAGING", "PACKING"] as const;
const STATUSES = ["active", "blocked", "under_maintenance"] as const;

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-500/50 text-emerald-700 bg-emerald-50",
  blocked: "border-destructive/40 text-destructive bg-destructive/5",
  under_maintenance: "border-amber-400/50 text-amber-600 bg-amber-50",
};

export default function Racking() {
  const { business } = useBusiness();

  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [viewMode, setViewMode] = useState<"browse" | "heatmap">("browse");

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [racks, setRacks] = useState<RackRow[]>([]);
  const [rackId, setRackId] = useState<string | null>(null);
  const [bins, setBins] = useState<BinRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [zoneDialog, setZoneDialog] = useState<ZoneRow | null | "new">(null);
  const [rackDialog, setRackDialog] = useState<RackRow | null | "new">(null);
  const [binDialog, setBinDialog] = useState<BinRow | null | "new">(null);
  const [mergeTarget, setMergeTarget] = useState<BinRow | null>(null);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const [labelTarget, setLabelTarget] = useState<BinRow | null>(null);

  const [splitTarget, setSplitTarget] = useState<BinRow | null>(null);
  const [splitInto, setSplitInto] = useState<string | null>(null);
  const [splitProduct, setSplitProduct] = useState<{ id: string; part_number: string; name: string } | null>(null);
  const [splitProductSearch, setSplitProductSearch] = useState("");
  const [splitProductResults, setSplitProductResults] = useState<{ id: string; part_number: string; name: string }[]>([]);
  const [splitQty, setSplitQty] = useState("");
  const [splitting, setSplitting] = useState(false);

  useEffect(() => { document.title = "Racking — RD Pro"; }, []);

  useEffect(() => {
    if (!business) return;
    supabase
      .from("warehouses")
      .select("id, warehouse_name, is_default")
      .eq("business_id", business.id)
      .eq("status", "active")
      .order("warehouse_name", { ascending: true })
      .then(({ data }) => {
        const wh = (data as unknown as WarehouseOpt[]) ?? [];
        setWarehouses(wh);
        if (!warehouseId) {
          const def = wh.find((w) => w.is_default) ?? wh[0];
          if (def) setWarehouseId(def.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  const loadZones = useCallback(async () => {
    if (!warehouseId) { setZones([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("warehouse_zones" as never)
      .select("id, code, name, is_active")
      .eq("warehouse_id", warehouseId)
      .order("code", { ascending: true });
    if (error) toast.error(error.message);
    setZones(((data as unknown as ZoneRow[]) ?? []).filter((z) => z.code !== "UNZ"));
    setLoading(false);
  }, [warehouseId]);

  useEffect(() => { setZoneId(null); setRackId(null); loadZones(); }, [warehouseId, loadZones]);

  const loadRacks = useCallback(async () => {
    if (!zoneId) { setRacks([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("warehouse_racks" as never)
      .select("id, code, name, status")
      .eq("zone_id", zoneId)
      .order("code", { ascending: true });
    if (error) toast.error(error.message);
    setRacks((data as unknown as RackRow[]) ?? []);
    setLoading(false);
  }, [zoneId]);

  useEffect(() => { setRackId(null); loadRacks(); }, [zoneId, loadRacks]);

  const loadBins = useCallback(async () => {
    if (!rackId) { setBins([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("warehouse_bins" as never)
      .select("id, shelf_code, bin_code, location_code, scan_code, bin_type, status, capacity_qty, capacity_weight, capacity_volume, is_locked, is_unassigned, merged_into_bin_id")
      .eq("rack_id", rackId)
      .order("bin_code", { ascending: true });
    if (error) toast.error(error.message);
    setBins((data as unknown as BinRow[]) ?? []);
    setLoading(false);
  }, [rackId]);

  useEffect(() => { loadBins(); }, [rackId, loadBins]);

  useEffect(() => {
    if (!business || !splitTarget || splitProductSearch.trim().length < 2) { setSplitProductResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, part_number, name")
        .eq("business_id", business.id)
        .or(`part_number.ilike.%${splitProductSearch}%,name.ilike.%${splitProductSearch}%`)
        .limit(20);
      setSplitProductResults((data as any[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [splitProductSearch, splitTarget, business]);

  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;
  const selectedRack = racks.find((r) => r.id === rackId) ?? null;

  const printLabel = async (b: BinRow) => {
    const dataUrl = await QRCode.toDataURL(b.scan_code ?? b.location_code ?? b.id, { margin: 1, width: 300, errorCorrectionLevel: "M" });
    const w = window.open("", "_blank", "width=380,height=480");
    if (!w) { toast.error("Pop-up blocked — allow pop-ups to print the label"); return; }
    w.document.write(`<!doctype html><html><head><title>${b.location_code ?? b.bin_code}</title></head>
      <body style="font-family:ui-monospace,monospace;text-align:center;padding:28px;">
        <img src="${dataUrl}" width="220" height="220" alt="QR" />
        <div style="font-size:22px;font-weight:700;margin-top:14px;letter-spacing:0.5px;">${b.location_code ?? b.bin_code}</div>
        <div style="font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;">${b.bin_type}</div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const openSplit = (b: BinRow) => {
    setSplitTarget(b);
    setSplitInto(null);
    setSplitProduct(null);
    setSplitProductSearch("");
    setSplitProductResults([]);
    setSplitQty("");
  };

  const doSplit = async () => {
    if (!splitTarget || !splitInto || !splitProduct || !splitQty) return;
    setSplitting(true);
    try {
      const { error } = await supabase.rpc("split_bin" as never, {
        _from_bin_id: splitTarget.id, _to_bin_id: splitInto, _product_id: splitProduct.id, _qty: Number(splitQty),
      } as never);
      if (error) throw error;
      toast.success(`${splitQty} × ${splitProduct.part_number} moved to the new bin`);
      setSplitTarget(null);
      loadBins();
    } catch (e: any) {
      toast.error(e.message ?? "Split failed");
    } finally {
      setSplitting(false);
    }
  };

  const doMerge = async () => {
    if (!mergeTarget || !mergeInto) return;
    setMerging(true);
    try {
      const { error } = await supabase.rpc("merge_bin" as never, {
        _from_bin_id: mergeTarget.id, _to_bin_id: mergeInto,
      } as never);
      if (error) throw error;
      toast.success(`${mergeTarget.location_code} merged — stock moved, bin blocked`);
      setMergeTarget(null);
      setMergeInto(null);
      loadBins();
    } catch (e: any) {
      toast.error(e.message ?? "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  if (!business) return <div className="p-8 text-muted-foreground">No active company selected.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Storage Locations</h1>
          <p className="text-muted-foreground mt-1 text-sm">Zone → Rack → Bin — every product's warehouse address.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex-1 md:w-64">
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
            <Button size="sm" variant={viewMode === "browse" ? "secondary" : "ghost"} className="h-8" onClick={() => setViewMode("browse")}>
              <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />Browse
            </Button>
            <Button size="sm" variant={viewMode === "heatmap" ? "secondary" : "ghost"} className="h-8" onClick={() => setViewMode("heatmap")}>
              <Flame className="h-3.5 w-3.5 mr-1.5" />Heat Map
            </Button>
          </div>
        </div>
      </header>

      {viewMode === "heatmap" ? (
        warehouseId ? <WarehouseHeatMap warehouseId={warehouseId} /> : (
          <div className="py-8 text-center text-sm text-muted-foreground">Select a warehouse to see its occupancy.</div>
        )
      ) : (
      <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          className={`hover:underline ${!zoneId ? "font-semibold" : "text-muted-foreground"}`}
          onClick={() => { setZoneId(null); setRackId(null); }}
        >
          {warehouses.find((w) => w.id === warehouseId)?.warehouse_name ?? "Warehouse"}
        </button>
        {selectedZone && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              className={`hover:underline ${zoneId && !rackId ? "font-semibold" : "text-muted-foreground"}`}
              onClick={() => setRackId(null)}
            >
              Zone {selectedZone.code}
            </button>
          </>
        )}
        {selectedRack && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">Rack {selectedRack.code}</span>
          </>
        )}
      </div>

      {/* Level: Zones */}
      {!zoneId && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-sm">Zones</h2>
            <Button size="sm" onClick={() => setZoneDialog("new")} disabled={!warehouseId}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Zone
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : zones.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No zones yet.</TableCell></TableRow>
              ) : zones.map((z) => (
                <TableRow key={z.id} className="cursor-pointer" onClick={() => setZoneId(z.id)}>
                  <TableCell className="font-mono font-medium">{z.code}</TableCell>
                  <TableCell>{z.name || "—"}</TableCell>
                  <TableCell><Badge variant={z.is_active ? "outline" : "secondary"}>{z.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => setZoneDialog(z)}><Pencil className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Level: Racks */}
      {zoneId && !rackId && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-sm">Racks in Zone {selectedZone?.code}</h2>
            <Button size="sm" onClick={() => setRackDialog("new")}><Plus className="h-3.5 w-3.5 mr-1" />Add Rack</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : racks.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No racks yet.</TableCell></TableRow>
              ) : racks.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setRackId(r.id)}>
                  <TableCell className="font-mono font-medium">{r.code}</TableCell>
                  <TableCell>{r.name || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLE[r.status]}>{r.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => setRackDialog(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Level: Bins */}
      {rackId && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-sm">Bins in Rack {selectedRack?.code}</h2>
            <Button size="sm" onClick={() => setBinDialog("new")}><Plus className="h-3.5 w-3.5 mr-1" />Add Bin</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location Code</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead>Capacity</TableHead><TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : bins.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No bins yet.</TableCell></TableRow>
              ) : bins.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      {b.location_code}
                      {b.is_locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{b.bin_type}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLE[b.status]}>{b.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {[b.capacity_qty && `${b.capacity_qty} qty`, b.capacity_weight && `${b.capacity_weight} kg`, b.capacity_volume && `${b.capacity_volume} m³`]
                      .filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setBinDialog(b)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLabelTarget(b)}>
                          <QrCodeIcon className="h-3.5 w-3.5 mr-2" />View / Print Label
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openSplit(b)}>
                          <Split className="h-3.5 w-3.5 mr-2" />Split into…
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setMergeTarget(b); setMergeInto(null); }}>
                          <GitMerge className="h-3.5 w-3.5 mr-2" />Merge into…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </>
      )}

      <ZoneDialog
        state={zoneDialog} onOpenChange={(v) => setZoneDialog(v)} businessId={business.id}
        warehouseId={warehouseId} onSaved={() => { setZoneDialog(null); loadZones(); }}
      />
      <RackDialog
        state={rackDialog} onOpenChange={(v) => setRackDialog(v)} businessId={business.id}
        zoneId={zoneId} onSaved={() => { setRackDialog(null); loadRacks(); }}
      />
      <BinDialog
        state={binDialog} onOpenChange={(v) => setBinDialog(v)} businessId={business.id}
        rackId={rackId} onSaved={() => { setBinDialog(null); loadBins(); }}
      />

      <Dialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Merge {mergeTarget?.location_code}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Every product currently in this bin moves to the bin you pick below. This bin is then marked Blocked —
              its stock, not its location record, moves.
            </p>
            <div className="space-y-1.5">
              <Label>Merge into</Label>
              <BinLocationPicker
                warehouseId={warehouseId}
                value={mergeInto}
                onChange={setMergeInto}
                excludeBinId={mergeTarget?.id}
                includeUnassigned={false}
                placeholder="Select destination bin…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeTarget(null)} disabled={merging}>Cancel</Button>
            <Button onClick={doMerge} disabled={merging || !mergeInto}>{merging ? "Merging…" : "Merge"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelTarget} onOpenChange={(o) => !o && setLabelTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{labelTarget?.location_code}</DialogTitle></DialogHeader>
          {labelTarget && (
            <div className="flex flex-col items-center gap-3 py-2">
              <QrCodeImage value={labelTarget.scan_code ?? labelTarget.location_code ?? labelTarget.id} sizePx={180} />
              <Badge variant="secondary">{labelTarget.bin_type}</Badge>
              <p className="text-xs text-muted-foreground text-center">
                Encodes the bin's scan code — stays valid even if this bin is later re-racked and its location code changes.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelTarget(null)}>Close</Button>
            <Button onClick={() => labelTarget && printLabel(labelTarget)}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!splitTarget} onOpenChange={(o) => !o && setSplitTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Split {splitTarget?.location_code}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Move a specific quantity of one product out of this bin into another — the bin itself stays as-is, only the stock moves.
            </p>
            <div className="space-y-1.5 relative">
              <Label>Product</Label>
              {splitProduct ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{splitProduct.part_number} — {splitProduct.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => { setSplitProduct(null); setSplitProductSearch(""); }}>Change</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search part number or name…" value={splitProductSearch} onChange={(e) => setSplitProductSearch(e.target.value)} />
                  {splitProductResults.length > 0 && (
                    <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto absolute bg-popover z-10 w-full shadow-md">
                      {splitProductResults.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => { setSplitProduct(p); setSplitProductResults([]); }}
                        >
                          {p.part_number} — {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Quantity to move</Label>
              <Input type="number" min="0" value={splitQty} onChange={(e) => setSplitQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Move to</Label>
              <BinLocationPicker
                warehouseId={warehouseId}
                value={splitInto}
                onChange={setSplitInto}
                excludeBinId={splitTarget?.id}
                includeUnassigned={false}
                placeholder="Select destination bin…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitTarget(null)} disabled={splitting}>Cancel</Button>
            <Button onClick={doSplit} disabled={splitting || !splitInto || !splitProduct || !splitQty}>
              {splitting ? "Splitting…" : "Split"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Zone dialog ──────────────────────────────────────────────────────────
function ZoneDialog({ state, onOpenChange, businessId, warehouseId, onSaved }: {
  state: ZoneRow | null | "new"; onOpenChange: (v: null) => void; businessId: string; warehouseId: string; onSaved: () => void;
}) {
  const open = state !== null;
  const isEdit = state !== null && state !== "new";
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(isEdit ? (state as ZoneRow).code : "");
    setName(isEdit ? (state as ZoneRow).name ?? "" : "");
  }, [open, isEdit, state]);

  const save = async () => {
    if (!code.trim()) { toast.error("Zone code is required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("warehouse_zones" as never)
          .update({ code: code.trim().toUpperCase(), name: name.trim() || null } as never)
          .eq("id", (state as ZoneRow).id);
        if (error) throw error;
        toast.success("Zone updated");
      } else {
        const { error } = await supabase.from("warehouse_zones" as never)
          .insert({ business_id: businessId, warehouse_id: warehouseId, code: code.trim().toUpperCase(), name: name.trim() || null } as never);
        if (error) throw error;
        toast.success("Zone added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "A zone with this code already exists in this warehouse" : (e.message ?? "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Zone" : "Add Zone"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. A" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fast-moving zone" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rack dialog ──────────────────────────────────────────────────────────
function RackDialog({ state, onOpenChange, businessId, zoneId, onSaved }: {
  state: RackRow | null | "new"; onOpenChange: (v: null) => void; businessId: string; zoneId: string | null; onSaved: () => void;
}) {
  const open = state !== null;
  const isEdit = state !== null && state !== "new";
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(isEdit ? (state as RackRow).code : "");
    setName(isEdit ? (state as RackRow).name ?? "" : "");
    setStatus(isEdit ? (state as RackRow).status : "active");
  }, [open, isEdit, state]);

  const save = async () => {
    if (!code.trim()) { toast.error("Rack code is required"); return; }
    if (!zoneId) return;
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("warehouse_racks" as never)
          .update({ code: code.trim().toUpperCase(), name: name.trim() || null, status } as never)
          .eq("id", (state as RackRow).id);
        if (error) throw error;
        toast.success("Rack updated");
      } else {
        const { error } = await supabase.from("warehouse_racks" as never)
          .insert({ business_id: businessId, zone_id: zoneId, code: code.trim().toUpperCase(), name: name.trim() || null, status } as never);
        if (error) throw error;
        toast.success("Rack added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "A rack with this code already exists in this zone" : (e.message ?? "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Rack" : "Add Rack"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 01" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bin dialog ───────────────────────────────────────────────────────────
function BinDialog({ state, onOpenChange, businessId, rackId, onSaved }: {
  state: BinRow | null | "new"; onOpenChange: (v: null) => void; businessId: string; rackId: string | null; onSaved: () => void;
}) {
  const open = state !== null;
  const isEdit = state !== null && state !== "new";
  const [shelfCode, setShelfCode] = useState("");
  const [binCode, setBinCode] = useState("");
  const [binType, setBinType] = useState<string>("NORMAL");
  const [status, setStatus] = useState<string>("active");
  const [capacityQty, setCapacityQty] = useState("");
  const [capacityWeight, setCapacityWeight] = useState("");
  const [capacityVolume, setCapacityVolume] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const b = isEdit ? (state as BinRow) : null;
    setShelfCode(b?.shelf_code ?? "");
    setBinCode(b?.bin_code ?? "");
    setBinType(b?.bin_type ?? "NORMAL");
    setStatus(b?.status ?? "active");
    setCapacityQty(b?.capacity_qty != null ? String(b.capacity_qty) : "");
    setCapacityWeight(b?.capacity_weight != null ? String(b.capacity_weight) : "");
    setCapacityVolume(b?.capacity_volume != null ? String(b.capacity_volume) : "");
    setIsLocked(b?.is_locked ?? false);
  }, [open, isEdit, state]);

  const save = async () => {
    if (!binCode.trim()) { toast.error("Bin code is required"); return; }
    if (!rackId) return;
    const payload = {
      shelf_code: shelfCode.trim() || null,
      bin_code: binCode.trim().toUpperCase(),
      bin_type: binType,
      status,
      capacity_qty: capacityQty ? Number(capacityQty) : null,
      capacity_weight: capacityWeight ? Number(capacityWeight) : null,
      capacity_volume: capacityVolume ? Number(capacityVolume) : null,
      is_locked: isLocked,
    };
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("warehouse_bins" as never)
          .update(payload as never)
          .eq("id", (state as BinRow).id);
        if (error) throw error;
        toast.success("Bin updated");
      } else {
        const { error } = await supabase.from("warehouse_bins" as never)
          .insert({ business_id: businessId, rack_id: rackId, ...payload } as never);
        if (error) throw error;
        toast.success("Bin added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "A bin with this shelf/code already exists in this rack" : (e.message ?? "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Bin" : "Add Bin"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Shelf (optional)</Label>
              <Input value={shelfCode} onChange={(e) => setShelfCode(e.target.value)} placeholder="e.g. B" />
            </div>
            <div className="space-y-1.5">
              <Label>Bin Code</Label>
              <Input value={binCode} onChange={(e) => setBinCode(e.target.value)} placeholder="e.g. 01" autoFocus />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bin Type</Label>
              <Select value={binType} onValueChange={setBinType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Capacity (qty)</Label>
              <Input type="number" min="0" value={capacityQty} onChange={(e) => setCapacityQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Weight (kg)</Label>
              <Input type="number" min="0" value={capacityWeight} onChange={(e) => setCapacityWeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Volume (m³)</Label>
              <Input type="number" min="0" value={capacityVolume} onChange={(e) => setCapacityVolume(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Lock bin</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Blocks put-away/picking during a stock audit</p>
            </div>
            <Switch checked={isLocked} onCheckedChange={setIsLocked} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
