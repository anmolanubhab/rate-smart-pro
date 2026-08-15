// Pricing & Promotion Engine — Phase 1C Core Slice, Screen 2.
// Route: /pricing/price-lists/:id
//
// Two tabs only (General, Products) per this round's scope — no Formula
// evaluation, Compare Tool, Impact Analysis, History tab, or Import Wizard
// yet (Phase 1C.1). The Products tab grids over THIS list's price_list_items
// only (not the full 14,757-product catalog) with the same server-side
// pagination pattern as Products.tsx, since a price list's own item count
// stays reasonable even when the catalog doesn't.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Archive as ArchiveIcon, Save, Copy, ArrowLeft, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { searchProducts, type Product } from "@/lib/products";
import {
  fetchPriceList, savePriceList, activatePriceList, archivePriceList, duplicatePriceList,
  fetchPriceListItems, addProductToPriceList, updatePriceListItemPrice, removePriceListItem,
  type PriceListItemRow,
} from "@/lib/pricing/priceLists";
import { PRICE_LIST_TYPES, PRICE_SOURCES, PRICE_BASES, ROUNDING_POLICIES } from "@/lib/pricing/priceListConstants";
import { localDateISO } from "@/lib/pricing/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { ProductsPagination } from "@/components/ProductsPagination";
import ExportMenu from "@/components/reports/ExportMenu";
import PriceListImportDialog from "@/components/pricing/PriceListImportDialog";
import PriceListAssignmentsTab from "@/components/pricing/PriceListAssignmentsTab";

const inr = (n: number) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  active: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  archived: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

export default function PriceListEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "Price List Editor — RD Pro"; }, []);

  const { data: list } = useQuery({
    queryKey: ["price-list", id],
    enabled: !!id,
    queryFn: () => fetchPriceList(id!),
  });

  // ── General tab local form ────────────────────────────────────────────
  const [form, setForm] = useState<{
    name: string; list_type: string; description: string; price_source: string; price_basis: string;
    rounding_policy: string; currency: string; is_default: boolean; effective_from: string; effective_to: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!list) return;
    setForm({
      name: list.name,
      list_type: list.list_type ?? "Dealer",
      description: list.description ?? "",
      price_source: list.price_source ?? "Manual",
      price_basis: list.price_basis ?? "Selling Price",
      rounding_policy: list.rounding_policy ?? "No Rounding",
      currency: list.currency,
      is_default: list.is_default,
      effective_from: list.effective_from ?? "",
      effective_to: list.effective_to ?? "",
    });
  }, [list]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["price-list", id] });
    qc.invalidateQueries({ queryKey: ["price-lists", business?.id] });
  };

  const saveGeneral = async () => {
    if (!business?.id || !id || !form) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await savePriceList({
        id, business_id: business.id, name: form.name, list_type: form.list_type, description: form.description,
        price_source: form.price_source, price_basis: form.price_basis, rounding_policy: form.rounding_policy,
        currency: form.currency, is_default: form.is_default,
        effective_from: form.effective_from || null, effective_to: form.effective_to || null,
      });
      await logAudit({ business_id: business.id, action: "PRICE_LIST_UPDATE", entity_type: "price_lists", entity_id: id, new_value: { name: form.name } });
      toast.success("Saved");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const runStatusAction = async (action: "activate" | "archive" | "duplicate") => {
    if (!business?.id || !id) return;
    setBusy(true);
    try {
      if (action === "activate") await activatePriceList(id);
      else if (action === "archive") await archivePriceList(id);
      else {
        const newId = await duplicatePriceList(id, business.id);
        toast.success("Duplicated");
        navigate(`/pricing/price-lists/${newId}`);
        return;
      }
      await logAudit({ business_id: business.id, action: `PRICE_LIST_${action.toUpperCase()}`, entity_type: "price_lists", entity_id: id });
      toast.success(action === "activate" ? "Activated" : "Archived");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Products tab ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["price-list-items", id, page, pageSize, search],
    enabled: !!id,
    queryFn: () => fetchPriceListItems(id!, { page, pageSize, search }),
  });

  const [importOpen, setImportOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<Product[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      if (addQuery.trim()) searchProducts(user.id, addQuery).then(setAddResults).catch(() => {});
      else setAddResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [addQuery, user?.id]);

  const addProduct = async (p: Product) => {
    if (!id || !form) return;
    try {
      await addProductToPriceList(id, p.id, Number(p.mrp) || 0, form.effective_from || localDateISO());
      toast.success(`${p.name} added`);
      setAddQuery("");
      setAddResults([]);
      qc.invalidateQueries({ queryKey: ["price-list-items", id] });
      qc.invalidateQueries({ queryKey: ["price-lists", business?.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not add product — it may already be in this list");
    }
  };

  const savePrices = async () => {
    const entries = Object.entries(edited);
    if (entries.length === 0) return;
    try {
      await Promise.all(entries.map(([itemId, val]) => updatePriceListItemPrice(itemId, Number(val) || 0)));
      toast.success(`${entries.length} price${entries.length > 1 ? "s" : ""} updated`);
      setEdited({});
      qc.invalidateQueries({ queryKey: ["price-list-items", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save prices");
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await removePriceListItem(itemId);
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["price-list-items", id] });
      qc.invalidateQueries({ queryKey: ["price-lists", business?.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not remove");
    }
  };

  const rows = itemsData?.rows ?? [];
  const exportRows = rows.map((r) => ({
    part_number: r.product?.part_number ?? "",
    name: r.product?.name ?? "",
    mrp: r.product?.mrp ?? 0,
    dealer_rate: r.product?.dealer_rate ?? 0,
    price: r.price,
  }));

  if (!list || !form) {
    return <div className="text-center text-sm text-muted-foreground py-16">Loading…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/pricing/price-lists")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Price Lists
          </Button>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            {list.name}
            <Badge variant="outline" className={STATUS_TONE[list.status] ?? ""}>{list.status}</Badge>
            {list.is_default && <Badge>Default</Badge>}
          </h1>
        </div>
        {editable && (
          <div className="flex gap-2">
            {list.status !== "active" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("activate")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
              </Button>
            )}
            {list.status !== "archived" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("archive")}>
                <ArchiveIcon className="h-3.5 w-3.5 mr-1" /> Archive
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runStatusAction("duplicate")}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
            </Button>
          </div>
        )}
      </header>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="products">Products ({itemsData?.count ?? 0})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <div className="rounded-2xl bg-card border p-6 space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input disabled={!editable} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select disabled={!editable} value={form.list_type} onValueChange={(v) => setForm({ ...form, list_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_LIST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input disabled={!editable} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea disabled={!editable} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input disabled={!editable} type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To</Label>
                <Input disabled={!editable} type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Price Source</Label>
                <Select disabled={!editable} value={form.price_source} onValueChange={(v) => setForm({ ...form, price_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Price Basis</Label>
                <Select disabled={!editable} value={form.price_basis} onValueChange={(v) => setForm({ ...form, price_basis: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rounding Policy</Label>
              <Select disabled={!editable} value={form.rounding_policy} onValueChange={(v) => setForm({ ...form, rounding_policy: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROUNDING_POLICIES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Recorded for later use — not yet applied to any calculation (Phase 1C.1).</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Default Price List</Label>
              <Switch disabled={!editable} checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
            </div>
            {editable && <Button onClick={saveGeneral} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </div>
        </TabsContent>

        <TabsContent value="products" className="mt-4 space-y-3">
          <div className="rounded-2xl bg-card border p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <Input className="md:w-64" placeholder="Search in this list…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
            <div className="relative md:w-80">
              <DocumentEntitySearchField
                results={addResults}
                getKey={(p) => p.id}
                query={addQuery}
                onQueryChange={setAddQuery}
                onSelect={(p) => addProduct(p)}
                renderRow={(p) => <span>{p.part_number} — {p.name}</span>}
                placeholder="Search product to add…"
                inputClassName="h-9 text-sm"
              />
            </div>
            <div className="ml-auto flex gap-2">
              {editable && (
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Import Excel
                </Button>
              )}
              <ExportMenu
                rows={exportRows}
                columns={[
                  { key: "part_number", label: "Part Number" },
                  { key: "name", label: "Product Name" },
                  { key: "mrp", label: "MRP", align: "right", format: "currency" },
                  { key: "dealer_rate", label: "Dealer Rate", align: "right", format: "currency" },
                  { key: "price", label: "Price List Price", align: "right", format: "currency" },
                ]}
                baseName={`price-list-${list.name}`}
                title={`Price List — ${list.name}`}
                xmlRootTag="PriceList"
                xmlRowTag="Item"
              />
              {Object.keys(edited).length > 0 && (
                <Button size="sm" onClick={savePrices}><Save className="h-3.5 w-3.5 mr-1" /> Save Prices ({Object.keys(edited).length})</Button>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-card border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Dealer Rate</TableHead>
                    <TableHead className="text-right">Price List Price</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
                  {!itemsLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm py-8 text-muted-foreground">No products in this list yet — search above to add one.</TableCell></TableRow>
                  )}
                  {rows.map((r) => {
                    const value = edited[r.id] ?? String(r.price);
                    const numeric = Number(value) || 0;
                    const belowCost = r.product?.cost_price != null && numeric > 0 && numeric < Number(r.product.cost_price);
                    const blank = numeric <= 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">
                          <div className="font-mono text-xs text-muted-foreground">{r.product?.part_number ?? "—"}</div>
                          <div>{r.product?.name ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr(r.product?.mrp ?? 0)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{inr(r.product?.dealer_rate ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(belowCost || blank) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className={`h-3.5 w-3.5 ${belowCost ? "text-destructive" : "text-amber-500"}`} />
                                </TooltipTrigger>
                                <TooltipContent>{belowCost ? `Below cost (Rs.${r.product?.cost_price})` : "Price not set"}</TooltipContent>
                              </Tooltip>
                            )}
                            <Input
                              type="number"
                              disabled={!editable}
                              value={value}
                              onChange={(e) => setEdited((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              className={`h-8 w-28 text-right text-sm ${belowCost ? "border-destructive" : blank ? "border-amber-500" : ""}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="text-right">
                          {editable && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeItem(r.id)}>
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 border-t">
              <ProductsPagination
                page={page}
                pageSize={pageSize}
                total={itemsData?.count ?? 0}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPage(1); setPageSize(s); }}
                loading={itemsLoading}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          {business?.id && <PriceListAssignmentsTab priceListId={id!} businessId={business.id} editable={editable} />}
        </TabsContent>
      </Tabs>

      {business?.id && (
        <PriceListImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          priceListId={id!}
          businessId={business.id}
          effectiveFrom={form.effective_from || localDateISO()}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ["price-list-items", id] });
            qc.invalidateQueries({ queryKey: ["price-lists", business?.id] });
          }}
        />
      )}
    </div>
  );
}
