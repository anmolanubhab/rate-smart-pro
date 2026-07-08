import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Lock, Ruler } from "lucide-react";
import { useBusiness, can } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  fetchCategories, fetchUnits, createCategory, createUnit, deleteUnit,
  type MeasurementCategory, type Unit,
} from "@/lib/units";

export default function MeasurementUnits() {
  useEffect(() => { document.title = "Measurement Units — RD Pro"; }, []);
  const { role } = useBusiness();
  const canEdit = can(role, "settings.edit") || role === "owner";
  const qc = useQueryClient();

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ["measurement-categories"],
    queryFn: fetchCategories,
  });

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  useEffect(() => {
    if (categories?.length && !activeCategoryId) setActiveCategoryId(categories[0].id);
  }, [categories, activeCategoryId]);

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ["measurement-units", activeCategoryId],
    enabled: !!activeCategoryId,
    queryFn: () => fetchUnits(activeCategoryId!),
  });

  // New category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) { toast.error("Enter a category name"); return; }
    try {
      setSavingCat(true);
      const code = newCatName.trim().toLowerCase().replace(/\s+/g, "_");
      const cat = await createCategory(newCatName.trim(), code);
      toast.success(`Category "${cat.name}" created`);
      setNewCatName("");
      setCatDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["measurement-categories"] });
      setActiveCategoryId(cat.id);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create category");
    } finally {
      setSavingCat(false);
    }
  };

  // New unit dialog
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [uName, setUName] = useState("");
  const [uSymbol, setUSymbol] = useState("");
  const [uFactor, setUFactor] = useState("1");
  const [uDecimals, setUDecimals] = useState("0");
  const [uAllowDecimal, setUAllowDecimal] = useState(true);
  const [savingUnit, setSavingUnit] = useState(false);

  const resetUnitForm = () => {
    setUName(""); setUSymbol(""); setUFactor("1"); setUDecimals("0"); setUAllowDecimal(true);
  };

  const handleCreateUnit = async () => {
    if (!activeCategoryId) return;
    if (!uName.trim() || !uSymbol.trim()) { toast.error("Enter unit name and symbol"); return; }
    try {
      setSavingUnit(true);
      await createUnit({
        category_id: activeCategoryId,
        name: uName.trim(),
        symbol: uSymbol.trim().toUpperCase(),
        conversion_factor: Number(uFactor) || 1,
        decimal_places: Number(uDecimals) || 0,
        allow_decimal: uAllowDecimal,
      });
      toast.success(`Unit "${uName}" added`);
      resetUnitForm();
      setUnitDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["measurement-units", activeCategoryId] });
    } catch (e: any) {
      toast.error(e.message?.includes("duplicate") ? "This symbol already exists in this category" : e.message ?? "Failed to add unit");
    } finally {
      setSavingUnit(false);
    }
  };

  const handleDelete = async (unit: Unit) => {
    if (unit.is_system) return;
    if (!window.confirm(`Delete unit "${unit.name}"? This cannot be undone.`)) return;
    try {
      await deleteUnit(unit.id);
      toast.success("Unit deleted");
      qc.invalidateQueries({ queryKey: ["measurement-units", activeCategoryId] });
    } catch (e: any) {
      toast.error(e.message?.includes("foreign key") ? "This unit is in use by a product and can't be deleted" : e.message ?? "Delete failed");
    }
  };

  const activeCategory = categories?.find((c) => c.id === activeCategoryId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Settings · Masters</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
            <Ruler className="h-6 w-6 text-primary" /> Measurement Units
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The single source of truth for every unit used across Purchase, Sales, Inventory and Reports.
            Nothing here is hard-coded — add fully custom units and categories any time.
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Category
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Category list */}
        <div className="md:col-span-1 space-y-1">
          {catLoading ? (
            <p className="text-sm text-muted-foreground p-2">Loading…</p>
          ) : (
            categories?.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategoryId(c.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 transition-colors ${
                  activeCategoryId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <span>{c.name}</span>
                {c.is_system && <Lock className="h-3 w-3 opacity-60 shrink-0" />}
              </button>
            ))
          )}
        </div>

        {/* Units of the selected category */}
        <div className="md:col-span-3 rounded-md border bg-card overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">
              {activeCategory?.name ?? "—"} Units
              {activeCategory?.is_system && (
                <Badge variant="outline" className="ml-2 text-[10px] align-middle">system category</Badge>
              )}
            </h2>
            {canEdit && activeCategoryId && (
              <Button size="sm" onClick={() => setUnitDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Unit
              </Button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-center">Base?</TableHead>
                <TableHead className="text-right">Factor to Base</TableHead>
                <TableHead className="text-center">Decimals</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unitsLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !units?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No units in this category yet.</TableCell></TableRow>
              ) : (
                units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell><Badge variant="outline">{u.symbol}</Badge></TableCell>
                    <TableCell className="text-center">{u.is_base ? "✓" : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.conversion_factor}</TableCell>
                    <TableCell className="text-center">{u.decimal_places}</TableCell>
                    <TableCell className="text-right">
                      {u.is_system ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground inline-block" />
                      ) : canEdit ? (
                        <button onClick={() => handleDelete(u)} className="text-destructive/60 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Category dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Measurement Category</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Category Name</Label>
            <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Fabric, Pharma Dosage" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={savingCat}>{savingCat ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Unit dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Unit in {activeCategory?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Unit Name</Label>
              <Input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="e.g. Rack" />
            </div>
            <div className="space-y-1.5">
              <Label>Symbol</Label>
              <Input value={uSymbol} onChange={(e) => setUSymbol(e.target.value)} placeholder="e.g. RACK" />
            </div>
            <div className="space-y-1.5">
              <Label>Conversion Factor to Base Unit</Label>
              <Input type="number" value={uFactor} onChange={(e) => setUFactor(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Leave as 1 if this unit's real size varies by product (e.g. Carton) — set the real
                factor per product on the Product screen instead.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Decimal Places</Label>
              <Input type="number" value={uDecimals} onChange={(e) => setUDecimals(e.target.value)} />
            </div>
            <div className="col-span-2 flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="mb-0">Allow Decimal Quantities</Label>
              <Switch checked={uAllowDecimal} onCheckedChange={setUAllowDecimal} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUnit} disabled={savingUnit}>{savingUnit ? "Saving…" : "Add Unit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
