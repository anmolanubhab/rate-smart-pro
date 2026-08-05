import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { searchHsnByDescription, type HsnMasterListItem } from "@/lib/hsnMaster";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import type { ProductCategory } from "@/lib/products";

type PreviewRow = {
  id: string;
  part_number: string;
  name: string;
  vehicle_model: string | null;
  hsn_code: string | null;
  gst_pct: number | null;
};

const CATEGORIES: (ProductCategory | "all")[] = ["all", "spare", "lubricant", "accessory", "other"];

// Escape characters that would break a PostgREST filter string if typed
// into the search box (commas, parens, wildcards).
function sanitizeSearch(s: string) {
  return s.replace(/[,()%*]/g, "").trim();
}

function buildSearchFilter(search: string, onlyMissing: boolean) {
  const s = sanitizeSearch(search);
  const searchOr = s
    ? `or(name.ilike.%${s}%,part_number.ilike.%${s}%,vehicle_model.ilike.%${s}%)`
    : "";
  const missingOr = onlyMissing ? "or(hsn_code.is.null,gst_pct.is.null)" : "";
  if (searchOr && missingOr) return `and(${searchOr},${missingOr})`;
  return searchOr || missingOr || "";
}

export default function BulkGstAssign() {
  const { business } = useBusiness();
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  // HSN picker — same "query is display text, hsn is the committed value"
  // separation used in Products.tsx, so typing without selecting can never
  // apply a freehand HSN/rate to hundreds of products at once.
  const [hsnQuery, setHsnQuery] = useState("");
  const [hsnResults, setHsnResults] = useState<HsnMasterListItem[]>([]);
  const [selectedHsn, setSelectedHsn] = useState<HsnMasterListItem | null>(null);
  const [taxType, setTaxType] = useState("taxable");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => { document.title = "Bulk HSN / GST Assign — RD Pro"; }, []);

  useEffect(() => {
    if (!business) return;
    const t = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, onlyMissing, category, business]);

  const runHsnSearch = async (q: string) => {
    setHsnQuery(q);
    setSelectedHsn(null);
    try {
      setHsnResults(await searchHsnByDescription(q));
    } catch {
      setHsnResults([]);
    }
  };
  const pickHsn = (item: HsnMasterListItem) => {
    setSelectedHsn(item);
    setHsnQuery(item.description ? `${item.hsn_code} — ${item.description}` : item.hsn_code);
    setHsnResults([]);
  };

  async function runSearch() {
    if (!business) return;
    setLoading(true);
    try {
      const orFilter = buildSearchFilter(search, onlyMissing);

      let countQuery = supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id);
      if (category !== "all") countQuery = countQuery.eq("category", category);
      if (orFilter) countQuery = countQuery.or(orFilter);
      const { count: c, error: countErr } = await countQuery;
      if (countErr) throw countErr;
      setCount(c ?? 0);

      let previewQuery = supabase
        .from("products")
        .select("id, part_number, name, vehicle_model, hsn_code, gst_pct")
        .eq("business_id", business.id)
        .order("name", { ascending: true })
        .limit(50);
      if (category !== "all") previewQuery = previewQuery.eq("category", category);
      if (orFilter) previewQuery = previewQuery.or(orFilter);
      const { data, error } = await previewQuery;
      if (error) throw error;
      setPreview((data as PreviewRow[]) ?? []);
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function applyBulk() {
    if (!business || !selectedHsn) return;
    setApplying(true);
    try {
      const orFilter = buildSearchFilter(search, onlyMissing);
      let query = supabase
        .from("products")
        .update({
          hsn_code: selectedHsn.hsn_code,
          gst_pct: selectedHsn.current_rate ?? 0,
          tax_type: taxType,
          is_exempt: taxType === "exempt" || taxType === "nil_rated",
        } as never)
        .eq("business_id", business.id);
      if (category !== "all") query = query.eq("category", category);
      if (orFilter) query = query.or(orFilter);

      const { error } = await query;
      if (error) throw error;

      toast({ title: `Updated ${count ?? "matching"} products` });
      setConfirmOpen(false);
      await runSearch();
    } catch (e: any) {
      toast({ title: "Bulk update failed", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/products"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Bulk HSN / GST Assign</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Find a group of products by name/part-number/category and set an HSN Master entry on all of them at once —
            GST rate always comes from that HSN, never typed freehand.
          </p>
        </div>
      </div>

      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-start gap-3 pt-4 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This updates every product matching your search + filters below in one go.
            Double-check the count and preview before applying — this can't be undone in bulk
            (you'd need to fix products individually afterward).
          </span>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Find products</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="e.g. brake, filter, clutch, KTM..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory | "all")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c === "all" ? "All Categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="only-missing" checked={onlyMissing} onCheckedChange={(v) => setOnlyMissing(!!v)} />
              <Label htmlFor="only-missing" className="text-sm font-normal">
                Only products missing HSN or GST rate
              </Label>
            </div>
            <div className="text-sm text-muted-foreground pt-1">
              {loading ? "Searching…" : count === null ? "Type to search" : (
                <span className="font-semibold text-foreground">{count.toLocaleString("en-IN")} products match</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2. Set HSN</CardTitle></CardHeader>
          <CardContent className="space-y-3">
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
              {selectedHsn && (
                <p className="text-xs text-muted-foreground">
                  GST rate will be set to{" "}
                  {selectedHsn.current_rate != null ? (
                    <span className="font-semibold text-foreground">{selectedHsn.current_rate}%</span>
                  ) : (
                    <span className="text-destructive">no rate set for this HSN — add one in HSN Master first</span>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tax Type</Label>
              <Select value={taxType} onValueChange={setTaxType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="taxable">Taxable</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                  <SelectItem value="nil_rated">Nil Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!count || !selectedHsn || selectedHsn.current_rate == null || applying}
              onClick={() => setConfirmOpen(true)}
            >
              Apply to {count ?? 0} products
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Preview (first 50 matches)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Current HSN</TableHead>
                <TableHead className="text-right">Current GST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No matches yet — try a search term.</TableCell></TableRow>
              ) : (
                preview.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.vehicle_model ?? "—"}</TableCell>
                    <TableCell>{p.hsn_code ?? <span className="text-destructive">missing</span>}</TableCell>
                    <TableCell className="text-right">{p.gst_pct ?? <span className="text-destructive">missing</span>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply HSN {selectedHsn?.hsn_code} / GST {selectedHsn?.current_rate}% to {count} products?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the HSN code and GST rate on every product currently matching
              your search{onlyMissing ? " that's missing HSN/GST" : ""}. This cannot be bulk-undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulk} disabled={applying}>
              {applying ? "Applying…" : "Yes, apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
