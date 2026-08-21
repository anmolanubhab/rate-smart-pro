// Shared "Create/Edit Product" dialog — extracted from src/pages/Products.tsx
// so both the Products page and any in-context Quick Create (e.g. Purchase
// Order entry) use one implementation instead of a second, divergent form.
// Mirrors the PartyFormDialog extraction precedent exactly: same fields,
// same validation, same save path — no smaller/compact alternative form.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Product, ProductCategory, ProductTrackingType, hasTradingHistory } from "@/lib/products";
import {
  fetchCategories, fetchUnits, fetchProductUnits, saveProductUnits,
  type MeasurementCategory, type Unit,
} from "@/lib/units";
import { fetchHsnDetail, searchHsnByDescription, type HsnMasterListItem } from "@/lib/hsnMaster";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import BinLocationPicker from "@/components/inventory/BinLocationPicker";
import { useInventorySettings } from "@/lib/inventorySettings";
import { useDebounce } from "@/hooks/useDebounce";
import type { PurchasePricingMode } from "@/lib/purchaseCalc";

const EMPTY_FORM = {
  part_number: "",
  name: "",
  vehicle_model: "",
  category: "spare" as ProductCategory,
  mrp: "0",
  dealer_rate: "0",
  stock: "0",
  low_stock_threshold: "5",
  gst_pct: "18",
  hsn_code: "",
  barcode: "",
  weight_kg: "",
  tracking_type: "none" as ProductTrackingType,
  status: "active",
  measurement_category_id: "",
  base_unit_id: "",
  purchase_unit_id: "",
  purchase_unit_factor: "1",
  sales_unit_id: "",
  sales_unit_factor: "1",
  default_bin_id: null as string | null,
  purchase_pricing_mode: "manual" as PurchasePricingMode,
  purchase_ndp: "",
  purchase_fixed_rate: "",
  purchase_primary_discount_pct: "",
  purchase_additional_discount_pct: "",
  purchase_effective_from: "",
  purchase_effective_till: "",
  purchase_config_active: true,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  /** When set, the dialog edits this product instead of creating a new one. */
  editing?: Product | null;
  /** Called after a successful create/edit with the saved product row, so a
   *  caller (e.g. a Purchase Order line) can immediately select it. */
  onSaved: (product: Product) => void;
  /** Preset a starting part number/name when opened as a quick-create from a
   *  transaction screen (e.g. the part the user already typed didn't match). */
  presetPartNumber?: string;
}

export default function ProductFormDialog({ open, onOpenChange, businessId, userId, editing, onSaved, presetPartNumber }: Props) {
  const { enableBinManagement } = useInventorySettings();
  const [form, setForm] = useState(EMPTY_FORM);
  const [openingLocked, setOpeningLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string; is_default: boolean }[]>([]);
  const [defaultBinWarehouseId, setDefaultBinWarehouseId] = useState("");

  useEffect(() => {
    if (!open || !businessId) return;
    supabase
      .from("warehouses")
      .select("id, warehouse_name, is_default")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("warehouse_name", { ascending: true })
      .then(({ data }) => setWarehouses((data as unknown as { id: string; warehouse_name: string; is_default: boolean }[]) ?? []));
  }, [open, businessId]);

  const [hsnQuery, setHsnQuery] = useState("");
  const [hsnResults, setHsnResults] = useState<HsnMasterListItem[]>([]);
  const runHsnSearch = async (q: string) => {
    setHsnQuery(q);
    try {
      setHsnResults(await searchHsnByDescription(q));
    } catch {
      setHsnResults([]);
    }
  };
  const pickHsn = (item: HsnMasterListItem) => {
    setForm((f) => ({ ...f, hsn_code: item.hsn_code, gst_pct: item.current_rate != null ? String(item.current_rate) : f.gst_pct }));
    setHsnQuery(item.description ? `${item.hsn_code} — ${item.description}` : item.hsn_code);
    setHsnResults([]);
    setNameHsnResults([]);
  };

  const [nameHsnResults, setNameHsnResults] = useState<HsnMasterListItem[]>([]);
  const debouncedName = useDebounce(form.name, 300);
  useEffect(() => {
    if (editing || open === false || form.hsn_code || debouncedName.trim().length < 3) {
      setNameHsnResults([]);
      return;
    }
    let cancelled = false;
    searchHsnByDescription(debouncedName)
      .then((r) => { if (!cancelled) setNameHsnResults(r); })
      .catch(() => { if (!cancelled) setNameHsnResults([]); });
    return () => { cancelled = true; };
  }, [debouncedName, editing, open, form.hsn_code]);

  const [measCategories, setMeasCategories] = useState<MeasurementCategory[]>([]);
  const [measUnits, setMeasUnits] = useState<Unit[]>([]);
  useEffect(() => {
    if (!open) return;
    fetchCategories().then(setMeasCategories).catch(() => {});
    fetchUnits().then(setMeasUnits).catch(() => {});
  }, [open]);
  const unitsInCategory = (categoryId: string) => measUnits.filter((u) => u.category_id === categoryId);

  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setOpeningLocked(false);
      setForm({ ...EMPTY_FORM, part_number: presetPartNumber ?? "" });
      setHsnQuery("");
      setHsnResults([]);
      setDefaultBinWarehouseId(warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? "");
      return;
    }

    const p = editing;
    setOpeningLocked(true);
    hasTradingHistory(p.id).then(setOpeningLocked).catch(() => setOpeningLocked(true));
    setForm({
      part_number: p.part_number,
      name: p.name,
      vehicle_model: p.vehicle_model || "",
      category: p.category,
      mrp: String(p.mrp),
      dealer_rate: String(p.dealer_rate),
      stock: String(p.stock),
      low_stock_threshold: String(p.low_stock_threshold),
      gst_pct: String(p.gst_pct),
      hsn_code: p.hsn_code || "",
      barcode: p.barcode || "",
      weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
      tracking_type: p.tracking_type ?? "none",
      status: p.status,
      measurement_category_id: p.measurement_category_id || "",
      base_unit_id: p.base_unit_id || "",
      purchase_unit_id: "",
      purchase_unit_factor: "1",
      sales_unit_id: "",
      sales_unit_factor: "1",
      default_bin_id: p.default_bin_id ?? null,
      purchase_pricing_mode: (p.purchase_pricing_mode as PurchasePricingMode) || "manual",
      purchase_ndp: p.purchase_ndp != null ? String(p.purchase_ndp) : "",
      purchase_fixed_rate: p.purchase_fixed_rate != null ? String(p.purchase_fixed_rate) : "",
      purchase_primary_discount_pct: p.purchase_primary_discount_pct != null ? String(p.purchase_primary_discount_pct) : "",
      purchase_additional_discount_pct: p.purchase_additional_discount_pct != null ? String(p.purchase_additional_discount_pct) : "",
      purchase_effective_from: p.purchase_effective_from || "",
      purchase_effective_till: p.purchase_effective_till || "",
      purchase_config_active: p.purchase_config_active ?? true,
    });
    setHsnQuery(p.hsn_code || "");
    setHsnResults([]);
    setDefaultBinWarehouseId(warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? "");
    if (p.default_bin_id) {
      supabase
        .from("warehouse_bins" as never)
        .select("rack:warehouse_racks!inner(zone:warehouse_zones!inner(warehouse_id))")
        .eq("id", p.default_bin_id)
        .single()
        .then(({ data }) => {
          const whId = (data as any)?.rack?.zone?.warehouse_id;
          if (whId) setDefaultBinWarehouseId(whId);
        });
    }
    fetchProductUnits(p.id)
      .then((pu) => {
        const purchase = pu.find((u) => u.is_purchase);
        const sales = pu.find((u) => u.is_sales);
        setForm((f) => ({
          ...f,
          purchase_unit_id: purchase?.unit_id || "",
          purchase_unit_factor: purchase ? String(purchase.conversion_factor) : "1",
          sales_unit_id: sales?.unit_id || "",
          sales_unit_factor: sales ? String(sales.conversion_factor) : "1",
        }));
      })
      .catch(() => {});
    if (p.hsn_code) {
      fetchHsnDetail(p.hsn_code)
        .then((detail) => { if (detail?.description) setHsnQuery(`${detail.hsn_code} — ${detail.description}`); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const save = async () => {
    if (!form.part_number.trim() || !form.name.trim())
      return toast.error("Part number and name required");
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        business_id: businessId,
        part_number: form.part_number.trim(),
        name: form.name.trim(),
        vehicle_model: form.vehicle_model.trim() || null,
        category: form.category,
        mrp: parseFloat(form.mrp) || 0,
        dealer_rate: parseFloat(form.dealer_rate) || 0,
        stock: parseFloat(form.stock) || 0,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
        gst_pct: parseFloat(form.gst_pct) || 0,
        hsn_code: form.hsn_code.trim() || null,
        barcode: form.barcode.trim() || null,
        weight_kg: form.weight_kg.trim() ? parseFloat(form.weight_kg) : null,
        tracking_type: form.tracking_type,
        status: form.status,
        measurement_category_id: form.measurement_category_id || null,
        base_unit_id: form.base_unit_id || null,
        default_bin_id: form.default_bin_id || null,
        purchase_pricing_mode: form.purchase_pricing_mode,
        purchase_ndp: form.purchase_ndp.trim() ? parseFloat(form.purchase_ndp) : null,
        purchase_fixed_rate: form.purchase_fixed_rate.trim() ? parseFloat(form.purchase_fixed_rate) : null,
        purchase_primary_discount_pct: form.purchase_primary_discount_pct.trim() ? parseFloat(form.purchase_primary_discount_pct) : null,
        purchase_additional_discount_pct: form.purchase_additional_discount_pct.trim() ? parseFloat(form.purchase_additional_discount_pct) : null,
        purchase_effective_from: form.purchase_effective_from || null,
        purchase_effective_till: form.purchase_effective_till || null,
        purchase_config_active: form.purchase_config_active,
      };
      let saved: Product;
      if (editing) {
        const { stock: _stock, ...lockedPayload } = payload;
        const { data, error } = await supabase
          .from("products")
          .update(openingLocked ? lockedPayload : payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        saved = data as unknown as Product;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        saved = data as unknown as Product;
      }

      if (form.base_unit_id) {
        const rows = [
          {
            product_id: saved.id,
            unit_id: form.base_unit_id,
            conversion_factor: 1,
            is_purchase: !form.purchase_unit_id,
            is_sales: !form.sales_unit_id,
            is_stock: true,
            barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
            dealer_rate: null, rd_rate: null, discount: null, scheme: null,
          },
          ...(form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id
            ? [{
                product_id: saved.id,
                unit_id: form.purchase_unit_id,
                conversion_factor: parseFloat(form.purchase_unit_factor) || 1,
                is_purchase: true, is_sales: false, is_stock: false,
                barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
                dealer_rate: null, rd_rate: null, discount: null, scheme: null,
              }]
            : []),
          ...(form.sales_unit_id && form.sales_unit_id !== form.base_unit_id
            ? [{
                product_id: saved.id,
                unit_id: form.sales_unit_id,
                conversion_factor: parseFloat(form.sales_unit_factor) || 1,
                is_purchase: false, is_sales: true, is_stock: false,
                barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
                dealer_rate: null, rd_rate: null, discount: null, scheme: null,
              }]
            : []),
        ];
        await saveProductUnits(saved.id, rows as any);
      }

      toast.success(editing ? "Product updated" : "Product added");
      onOpenChange(false);
      onSaved(saved);
    } catch (e: any) {
      if (e.code === "23505") {
        toast.error(`Part number "${form.part_number.trim()}" is already in use — choose a different one.`);
      } else {
        toast.error(e.message ?? "Failed to save product");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{editing ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Part Number *</Label>
            <Input value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} placeholder="e.g. N1234" autoFocus={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label>Product Name *</Label>
            <DocumentEntitySearchField
              results={nameHsnResults}
              getKey={(h) => h.hsn_code}
              query={form.name}
              onQueryChange={(v) => setForm({ ...form, name: v })}
              onSelect={(h) => pickHsn(h)}
              placeholder="e.g. Brake Shoe Set"
              inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              renderRow={(h) => (
                <>
                  <span className="font-mono font-semibold">{h.hsn_code}</span>
                  {h.description && <span className="text-muted-foreground"> — {h.description}</span>}
                  {h.current_rate != null && <span className="ml-1 text-muted-foreground">({h.current_rate}%)</span>}
                </>
              )}
            />
            {nameHsnResults.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Matching HSN codes found — pick one to auto-fill HSN &amp; GST%.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle Model</Label>
            <Input value={form.vehicle_model} onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })} placeholder="e.g. Apache RTR 160" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ProductCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="spare">Spare Parts</SelectItem>
                <SelectItem value="lubricant">Lubricant</SelectItem>
                <SelectItem value="accessory">Accessory</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>MRP (₹)</Label>
            <Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Dealer Rate (₹)</Label>
            <Input type="number" value={form.dealer_rate} onChange={(e) => setForm({ ...form, dealer_rate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{editing ? "Stock" : "Opening Stock"}</Label>
            <Input type="number" value={form.stock} disabled={openingLocked} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            {openingLocked ? (
              <p className="text-xs text-muted-foreground">
                This product has already been traded, so its stock can only change through a
                movement that leaves an audit trail.{" "}
                <Link to="/inventory/adjustments" className="underline underline-offset-2">Post a Stock Adjustment</Link> instead.
              </p>
            ) : editing ? (
              <p className="text-xs text-muted-foreground">
                Opening stock — editable until this product is first traded. Changing it restates its opening entry (Dr Opening Stock / Cr Capital Account).
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Low-stock alert at</Label>
            <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>HSN / SAC Code</Label>
            <DocumentEntitySearchField
              results={hsnResults}
              getKey={(h) => h.hsn_code}
              query={hsnQuery}
              onQueryChange={runHsnSearch}
              onSelect={(h) => pickHsn(h)}
              placeholder="Search by code or description…"
              inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              renderRow={(h) => (
                <>
                  <span className="font-mono font-semibold">{h.hsn_code}</span>
                  {h.description && <span className="text-muted-foreground"> — {h.description}</span>}
                  {h.current_rate != null && <span className="ml-1 text-muted-foreground">({h.current_rate}%)</span>}
                </>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>GST %</Label>
            <Input type="number" value={form.gst_pct} onChange={(e) => setForm({ ...form, gst_pct: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">Auto-filled from HSN; editable for exceptions.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Weight (kg)</Label>
            <Input type="number" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Tracking</Label>
            <Select value={form.tracking_type} onValueChange={(v) => setForm({ ...form, tracking_type: v as ProductTrackingType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="batch">Batch tracked</SelectItem>
                <SelectItem value="serial">Serial tracked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Purchase Configuration (optional)</p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Purchase Pricing Mode</Label>
            <Select value={form.purchase_pricing_mode} onValueChange={(v) => setForm({ ...form, purchase_pricing_mode: v as PurchasePricingMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual / Override Allowed</SelectItem>
                <SelectItem value="mrp_discount">MRP → Discount</SelectItem>
                <SelectItem value="mrp_discount_additional">MRP → Discount + Additional Discount</SelectItem>
                <SelectItem value="fixed_ndp">Fixed NDP</SelectItem>
                <SelectItem value="ndp_additional_discount">NDP → Additional Discount</SelectItem>
                <SelectItem value="fixed_rate">Fixed Purchase Rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(form.purchase_pricing_mode === "mrp_discount" || form.purchase_pricing_mode === "mrp_discount_additional" || form.purchase_pricing_mode === "manual") && (
            <div className="space-y-1.5">
              <Label>Primary Discount %</Label>
              <Input type="number" step="any" value={form.purchase_primary_discount_pct}
                onChange={(e) => setForm({ ...form, purchase_primary_discount_pct: e.target.value })} placeholder="e.g. 20" />
            </div>
          )}
          {(form.purchase_pricing_mode === "mrp_discount_additional" || form.purchase_pricing_mode === "ndp_additional_discount" || form.purchase_pricing_mode === "manual") && (
            <div className="space-y-1.5">
              <Label>Additional Discount %</Label>
              <Input type="number" step="any" value={form.purchase_additional_discount_pct}
                onChange={(e) => setForm({ ...form, purchase_additional_discount_pct: e.target.value })} placeholder="e.g. 2" />
            </div>
          )}
          {(form.purchase_pricing_mode === "fixed_ndp" || form.purchase_pricing_mode === "ndp_additional_discount" || form.purchase_pricing_mode === "manual") && (
            <div className="space-y-1.5">
              <Label>NDP (₹)</Label>
              <Input type="number" step="any" value={form.purchase_ndp}
                onChange={(e) => setForm({ ...form, purchase_ndp: e.target.value })} placeholder="e.g. 1100" />
            </div>
          )}
          {(form.purchase_pricing_mode === "fixed_rate" || form.purchase_pricing_mode === "manual") && (
            <div className="space-y-1.5">
              <Label>Fixed Purchase Rate (₹)</Label>
              <Input type="number" step="any" value={form.purchase_fixed_rate}
                onChange={(e) => setForm({ ...form, purchase_fixed_rate: e.target.value })} placeholder="e.g. 1078.24" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Effective From</Label>
            <Input type="date" value={form.purchase_effective_from} onChange={(e) => setForm({ ...form, purchase_effective_from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective Till</Label>
            <Input type="date" value={form.purchase_effective_till} onChange={(e) => setForm({ ...form, purchase_effective_till: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2 flex items-center gap-2">
            <input type="checkbox" id="pfd-purchase_config_active" checked={form.purchase_config_active}
              onChange={(e) => setForm({ ...form, purchase_config_active: e.target.checked })} className="h-4 w-4" />
            <Label htmlFor="pfd-purchase_config_active" className="cursor-pointer">Purchase configuration active</Label>
          </div>

          {enableBinManagement && (
            <>
              <div className="md:col-span-2 border-t pt-3 mt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Storage Location (optional)</p>
              </div>
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Select value={defaultBinWarehouseId} onValueChange={(v) => { setDefaultBinWarehouseId(v); setForm({ ...form, default_bin_id: null }); }}>
                  <SelectTrigger><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default Rack / Bin</Label>
                <BinLocationPicker
                  warehouseId={defaultBinWarehouseId || null}
                  value={form.default_bin_id}
                  onChange={(binId) => setForm({ ...form, default_bin_id: binId })}
                  placeholder="Auto (put-away bin picked at GRN time)"
                />
              </div>
            </>
          )}

          <div className="md:col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Measurement (optional)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Measurement Category</Label>
            <Select
              value={form.measurement_category_id}
              onValueChange={(v) => setForm({ ...form, measurement_category_id: v, base_unit_id: "", purchase_unit_id: "", sales_unit_id: "" })}
            >
              <SelectTrigger><SelectValue placeholder="e.g. Weight, Volume, Quantity" /></SelectTrigger>
              <SelectContent>
                {measCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Base / Stock Unit</Label>
            <Select value={form.base_unit_id} onValueChange={(v) => setForm({ ...form, base_unit_id: v })} disabled={!form.measurement_category_id}>
              <SelectTrigger><SelectValue placeholder="Select category first" /></SelectTrigger>
              <SelectContent>
                {unitsInCategory(form.measurement_category_id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.base_unit_id && (
            <>
              <div className="space-y-1.5">
                <Label>Purchase Unit</Label>
                <Select value={form.purchase_unit_id} onValueChange={(v) => setForm({ ...form, purchase_unit_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Same as base unit" /></SelectTrigger>
                  <SelectContent>
                    {unitsInCategory(form.measurement_category_id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>1 Purchase Unit = ? Base Units</Label>
                <Input type="number" value={form.purchase_unit_factor} onChange={(e) => setForm({ ...form, purchase_unit_factor: e.target.value })}
                  disabled={!form.purchase_unit_id || form.purchase_unit_id === form.base_unit_id} />
              </div>
              <div className="space-y-1.5">
                <Label>Sales Unit</Label>
                <Select value={form.sales_unit_id} onValueChange={(v) => setForm({ ...form, sales_unit_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Same as base unit" /></SelectTrigger>
                  <SelectContent>
                    {unitsInCategory(form.measurement_category_id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>1 Sales Unit = ? Base Units</Label>
                <Input type="number" value={form.sales_unit_factor} onChange={(e) => setForm({ ...form, sales_unit_factor: e.target.value })}
                  disabled={!form.sales_unit_id || form.sales_unit_id === form.base_unit_id} />
              </div>
              <p className="md:col-span-2 text-[11px] text-muted-foreground -mt-1">
                e.g. Engine Oil — Base: Liter · Purchase: Drum (1 Drum = 210 Liter) · Sales: Can (1 Can = 5 Liter).
                Stock is always tracked in the base unit; purchase/sales screens convert automatically.
              </p>
              <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conversion Chain</p>
                <div className="flex items-center flex-wrap gap-2 text-xs">
                  {form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id && (
                    <>
                      <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                        1 {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.purchase_unit_id)?.symbol}
                        <span className="text-muted-foreground font-normal"> Purchase</span>
                      </span>
                      <span className="text-muted-foreground">→</span>
                    </>
                  )}
                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 font-medium">
                    {form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id
                      ? form.purchase_unit_factor
                      : form.sales_unit_id && form.sales_unit_id !== form.base_unit_id
                      ? form.sales_unit_factor
                      : 1}{" "}
                    {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.base_unit_id)?.symbol}
                    <span className="text-muted-foreground font-normal"> Stock</span>
                  </span>
                  {form.sales_unit_id && form.sales_unit_id !== form.base_unit_id && (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-700 font-medium">
                        1 {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.sales_unit_id)?.symbol}
                        <span className="text-muted-foreground font-normal"> Sales</span>
                      </span>
                    </>
                  )}
                  {!form.purchase_unit_id && !form.sales_unit_id && (
                    <span className="text-muted-foreground">Stock unit only — no separate purchase/sales unit configured.</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Purchase and GRN screens will let staff enter quantities in the Purchase Unit; the system stores everything against the Stock Unit automatically.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90">
            {saving ? "Saving…" : editing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
