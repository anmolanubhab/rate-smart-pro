// Purchase Price List management — Purchase Pricing & Scheme Engine.
// Route: /purchase/price-lists
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, CheckCircle2, Archive as ArchiveIcon, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import {
  fetchPurchasePriceLists, savePurchasePriceList, activatePurchasePriceList, archivePurchasePriceList,
  fetchPurchasePriceListItems, upsertPurchasePriceListItem, removePurchasePriceListItem,
  type PurchasePriceList, type PurchasePriceListItemRow,
} from "@/lib/purchasePriceLists";
import { fetchPurchaseSchemes, type PurchaseScheme } from "@/lib/purchaseSchemes";
import { fetchParties, type Party } from "@/lib/parties";
import { searchProducts, type Product } from "@/lib/products";
import type { PurchasePricingMode } from "@/lib/purchaseCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

const MODE_LABELS: Record<PurchasePricingMode, string> = {
  manual: "Manual / Override",
  mrp_discount: "MRP → Discount",
  mrp_discount_additional: "MRP → Discount + Additional",
  fixed_ndp: "Fixed NDP",
  ndp_additional_discount: "NDP → Additional Discount",
  fixed_rate: "Fixed Purchase Rate",
};

type ListForm = { name: string; supplier_id: string; is_default: boolean; effective_from: string; effective_to: string };
const blankListForm = (): ListForm => ({ name: "", supplier_id: "", is_default: false, effective_from: new Date().toISOString().slice(0, 10), effective_to: "" });

type ItemForm = {
  productQuery: string; product: Product | null;
  purchase_pricing_mode: PurchasePricingMode; mrp: string; ndp: string; fixed_rate: string;
  primary_discount_pct: string; additional_discount_pct: string; purchase_scheme_id: string;
};
const blankItemForm = (): ItemForm => ({
  productQuery: "", product: null, purchase_pricing_mode: "mrp_discount", mrp: "", ndp: "", fixed_rate: "",
  primary_discount_pct: "", additional_discount_pct: "", purchase_scheme_id: "",
});

export default function PurchasePriceLists() {
  useEffect(() => { document.title = "Purchase Price Lists — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "purchase.edit", permissions) || canGranular(role, "settings.edit", permissions);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["purchase-price-lists", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPurchasePriceLists(business!.id),
  });
  const { data: suppliers } = useQuery({
    queryKey: ["purchase-price-list-suppliers", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchParties(user!.id, "supplier"),
  });
  const { data: schemes } = useQuery({
    queryKey: ["purchase-schemes-for-list", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPurchaseSchemes(business!.id),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchasePriceList | null>(null);
  const [form, setForm] = useState<ListForm>(blankListForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const { data: items } = useQuery({
    queryKey: ["purchase-price-list-items", selectedListId],
    enabled: !!selectedListId,
    queryFn: () => fetchPurchasePriceListItems(selectedListId!),
  });

  const [itemForm, setItemForm] = useState<ItemForm>(blankItemForm());
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    if (!user || !itemForm.productQuery.trim()) { setProductResults([]); return; }
    const t = setTimeout(() => {
      searchProducts(user.id, itemForm.productQuery, 8).then(setProductResults).catch(() => setProductResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [itemForm.productQuery, user]);

  const supplierName = (id: string | null) => suppliers?.find((s) => s.id === id)?.name ?? "—";

  const openNew = () => { setEditing(null); setForm(blankListForm()); setDialogOpen(true); };
  const openEdit = (l: PurchasePriceList) => {
    setEditing(l);
    setForm({
      name: l.name, supplier_id: l.supplier_id ?? "", is_default: l.is_default,
      effective_from: l.effective_from ?? "", effective_to: l.effective_to ?? "",
    });
    setDialogOpen(true);
  };

  const saveList = async () => {
    if (!business?.id) return;
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const id = await savePurchasePriceList({
        id: editing?.id, business_id: business.id, name: form.name,
        supplier_id: form.supplier_id || null, is_default: form.is_default,
        effective_from: form.effective_from || null, effective_to: form.effective_to || null,
      });
      toast.success(editing ? "Price list updated" : "Price list created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["purchase-price-lists", business.id] });
      setSelectedListId(id);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save price list");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (l: PurchasePriceList, status: "active" | "archived") => {
    setBusyId(l.id);
    try {
      if (status === "active") await activatePurchasePriceList(l.id);
      else await archivePurchasePriceList(l.id);
      qc.invalidateQueries({ queryKey: ["purchase-price-lists", business?.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const selectedList = useMemo(() => lists?.find((l) => l.id === selectedListId) ?? null, [lists, selectedListId]);

  const addItem = async () => {
    if (!selectedListId || !itemForm.product) return toast.error("Pick a part first");
    setAddingItem(true);
    try {
      // Only persist the fields the selected mode actually reads (mirrors
      // resolveRateForMode's own per-mode field usage exactly) — a value
      // left over in a hidden field from a previous mode selection must
      // never silently apply once submitted (this was the exact bug: a
      // Fixed NDP item saved with a Disc % that the engine always ignores
      // for that mode, since Fixed NDP means "NDP is the final rate,
      // period" — no discount stacks on top of it by design).
      const mode = itemForm.purchase_pricing_mode;
      const usesNdp = mode === "fixed_ndp" || mode === "ndp_additional_discount" || mode === "manual";
      const usesFixedRate = mode === "fixed_rate" || mode === "manual";
      const usesPrimaryDiscount = mode === "mrp_discount" || mode === "mrp_discount_additional" || mode === "manual";
      const usesAdditionalDiscount = mode === "mrp_discount_additional" || mode === "ndp_additional_discount" || mode === "manual";
      await upsertPurchasePriceListItem({
        purchase_price_list_id: selectedListId,
        product_id: itemForm.product.id,
        mrp: itemForm.mrp ? Number(itemForm.mrp) : Number(itemForm.product.mrp),
        purchase_pricing_mode: mode,
        ndp: usesNdp && itemForm.ndp ? Number(itemForm.ndp) : null,
        fixed_rate: usesFixedRate && itemForm.fixed_rate ? Number(itemForm.fixed_rate) : null,
        primary_discount_pct: usesPrimaryDiscount && itemForm.primary_discount_pct ? Number(itemForm.primary_discount_pct) : null,
        additional_discount_pct: usesAdditionalDiscount && itemForm.additional_discount_pct ? Number(itemForm.additional_discount_pct) : null,
        purchase_scheme_id: itemForm.purchase_scheme_id || null,
        effective_from: new Date().toISOString().slice(0, 10),
      });
      toast.success("Part added to price list");
      setItemForm(blankItemForm());
      qc.invalidateQueries({ queryKey: ["purchase-price-list-items", selectedListId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add part");
    } finally {
      setAddingItem(false);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await removePurchasePriceListItem(itemId);
      qc.invalidateQueries({ queryKey: ["purchase-price-list-items", selectedListId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Price Lists</h1>
          <p className="text-sm text-muted-foreground">
            Season/supplier purchase price sheets — e.g. "TVS August 2026 Purchase Price List". Assigning a Supplier here creates the
            supplier-specific pricing rule (highest priority in the resolution order).
          </p>
        </div>
        {editable && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Price List</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
          ) : !lists?.length ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No purchase price lists yet.</TableCell></TableRow>
          ) : (
            lists.map((l) => (
              <TableRow
                key={l.id}
                className={`cursor-pointer ${selectedListId === l.id ? "bg-muted/50" : ""}`}
                onClick={() => setSelectedListId(l.id)}
              >
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell>{supplierName(l.supplier_id)}</TableCell>
                <TableCell>{l.is_default ? <Badge variant="outline">Default</Badge> : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.effective_from || "—"} → {l.effective_to || "—"}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[l.status]}>{l.status}</Badge></TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  {editable && <Button size="icon" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>}
                  {editable && l.status !== "active" && (
                    <Button size="icon" variant="ghost" disabled={busyId === l.id} onClick={() => setStatus(l, "active")} title="Activate">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </Button>
                  )}
                  {editable && l.status !== "archived" && (
                    <Button size="icon" variant="ghost" disabled={busyId === l.id} onClick={() => setStatus(l, "archived")} title="Archive">
                      <ArchiveIcon className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {selectedList && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">{selectedList.name} — Parts</h2>

          {editable && (
            <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3">
              <div className="space-y-1 relative">
                <Label className="text-xs">Part</Label>
                <Input
                  value={itemForm.productQuery}
                  onChange={(e) => setItemForm((f) => ({ ...f, productQuery: e.target.value, product: null }))}
                  placeholder="Search part…"
                  className="w-48"
                />
                {productResults.length > 0 && !itemForm.product && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setItemForm((f) => ({ ...f, product: p, productQuery: `${p.part_number} — ${p.name}`, mrp: String(p.mrp) }))}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted border-b border-border last:border-0"
                      >
                        <span className="font-mono font-semibold">{p.part_number}</span> — {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <Select value={itemForm.purchase_pricing_mode} onValueChange={(v) => setItemForm((f) => ({ ...f, purchase_pricing_mode: v as PurchasePricingMode }))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABELS) as PurchasePricingMode[]).map((m) => (
                      <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">MRP</Label><Input className="w-24" type="number" value={itemForm.mrp} onChange={(e) => setItemForm((f) => ({ ...f, mrp: e.target.value }))} /></div>
              {(itemForm.purchase_pricing_mode === "fixed_ndp" || itemForm.purchase_pricing_mode === "ndp_additional_discount" || itemForm.purchase_pricing_mode === "manual") && (
                <div className="space-y-1"><Label className="text-xs">NDP</Label><Input className="w-24" type="number" value={itemForm.ndp} onChange={(e) => setItemForm((f) => ({ ...f, ndp: e.target.value }))} /></div>
              )}
              {(itemForm.purchase_pricing_mode === "fixed_rate" || itemForm.purchase_pricing_mode === "manual") && (
                <div className="space-y-1"><Label className="text-xs">Fixed Rate</Label><Input className="w-24" type="number" value={itemForm.fixed_rate} onChange={(e) => setItemForm((f) => ({ ...f, fixed_rate: e.target.value }))} /></div>
              )}
              {(itemForm.purchase_pricing_mode === "mrp_discount" || itemForm.purchase_pricing_mode === "mrp_discount_additional" || itemForm.purchase_pricing_mode === "manual") && (
                <div className="space-y-1"><Label className="text-xs">Disc %</Label><Input className="w-20" type="number" value={itemForm.primary_discount_pct} onChange={(e) => setItemForm((f) => ({ ...f, primary_discount_pct: e.target.value }))} /></div>
              )}
              {(itemForm.purchase_pricing_mode === "mrp_discount_additional" || itemForm.purchase_pricing_mode === "ndp_additional_discount" || itemForm.purchase_pricing_mode === "manual") && (
                <div className="space-y-1"><Label className="text-xs">Add'l %</Label><Input className="w-20" type="number" value={itemForm.additional_discount_pct} onChange={(e) => setItemForm((f) => ({ ...f, additional_discount_pct: e.target.value }))} /></div>
              )}
              {itemForm.purchase_pricing_mode === "fixed_ndp" && (
                <p className="text-[11px] text-muted-foreground w-full basis-full">
                  Fixed NDP uses the NDP as the final rate — no discount stacks on top of it. Pick "NDP → Additional Discount" if you want a discount applied after the NDP.
                </p>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Scheme</Label>
                <Select value={itemForm.purchase_scheme_id || "none"} onValueChange={(v) => setItemForm((f) => ({ ...f, purchase_scheme_id: v === "none" ? "" : v }))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Scheme</SelectItem>
                    {(schemes ?? []).map((s: PurchaseScheme) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addItem} disabled={addingItem || !itemForm.product}>Add</Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">NDP</TableHead>
                <TableHead className="text-right">Fixed Rate</TableHead>
                <TableHead className="text-right">Disc %</TableHead>
                <TableHead className="text-right">Add'l %</TableHead>
                <TableHead>Scheme</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items?.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">No parts in this list yet.</TableCell></TableRow>
              ) : (
                items.map((it: PurchasePriceListItemRow) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.product?.part_number} — {it.product?.name}</TableCell>
                    <TableCell className="text-xs">{MODE_LABELS[it.purchase_pricing_mode]}</TableCell>
                    <TableCell className="text-right">{it.mrp ?? "—"}</TableCell>
                    <TableCell className="text-right">{it.ndp ?? "—"}</TableCell>
                    <TableCell className="text-right">{it.fixed_rate ?? "—"}</TableCell>
                    <TableCell className="text-right">{it.primary_discount_pct ?? "—"}</TableCell>
                    <TableCell className="text-right">{it.additional_discount_pct ?? "—"}</TableCell>
                    <TableCell className="text-xs">{schemes?.find((s) => s.id === it.purchase_scheme_id)?.name ?? "—"}</TableCell>
                    <TableCell>
                      {editable && <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4 text-destructive/60" /></Button>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Price List" : "New Price List"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. TVS August 2026 Purchase Price List" />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier (optional)</Label>
              <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Any supplier / business default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any supplier / business default</SelectItem>
                  {(suppliers ?? []).map((s: Party) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Assigning a supplier makes this the highest-priority rule for that supplier's parts.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ppl-default" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="h-4 w-4" />
              <Label htmlFor="ppl-default" className="cursor-pointer">Business default (used when no supplier-specific rule matches)</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Effective From</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Effective Till</Label><Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveList} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
