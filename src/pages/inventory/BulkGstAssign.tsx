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

type PreviewRow = {
  id: string;
  part_number: string;
  name: string;
  vehicle_model: string | null;
  hsn_code: string | null;
  gst_pct: number | null;
};

const GST_RATES = ["0", "5", "12", "18", "28"];

// Escape characters that would break a PostgREST filter string if typed
// into the search box (commas, parens, wildcards).
function sanitizeSearch(s: string) {
  return s.replace(/[,()%*]/g, "").trim();
}

function buildFilter(search: string, onlyMissing: boolean) {
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
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [hsn, setHsn] = useState("");
  const [gstPct, setGstPct] = useState("18");
  const [taxType, setTaxType] = useState("taxable");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => { document.title = "Bulk HSN / GST Assign — RD Pro"; }, []);

  useEffect(() => {
    if (!business) return;
    const t = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, onlyMissing, business]);

  async function runSearch() {
    if (!business) return;
    setLoading(true);
    try {
      const filter = buildFilter(search, onlyMissing);

      let countQuery = supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id);
      if (filter) countQuery = countQuery.or(filter);
      const { count: c, error: countErr } = await countQuery;
      if (countErr) throw countErr;
      setCount(c ?? 0);

      let previewQuery = supabase
        .from("products")
        .select("id, part_number, name, vehicle_model, hsn_code, gst_pct")
        .eq("business_id", business.id)
        .order("name", { ascending: true })
        .limit(50);
      if (filter) previewQuery = previewQuery.or(filter);
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
    if (!business) return;
    if (!hsn.trim()) {
      toast({ title: "Enter an HSN code first", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const filter = buildFilter(search, onlyMissing);
      let query = supabase
        .from("products")
        .update({
          hsn_code: hsn.trim(),
          hsn: hsn.trim(),
          hsn_sac: hsn.trim(),
          gst_pct: Number(gstPct),
          tax_type: taxType,
          is_exempt: taxType === "exempt" || taxType === "nil_rated",
        } as never)
        .eq("business_id", business.id);
      if (filter) query = query.or(filter);

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
            Find a group of products by name/part-number and set HSN + GST rate on all of them at once.
          </p>
        </div>
      </div>

      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-start gap-3 pt-4 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This updates every product matching your search + filter below in one go.
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
          <CardHeader><CardTitle className="text-base">2. Set values</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>HSN Code</Label>
              <Input placeholder="e.g. 8708" value={hsn} onChange={(e) => setHsn(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>GST Rate</Label>
                <Select value={gstPct} onValueChange={setGstPct}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                  </SelectContent>
                </Select>
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
            </div>
            <Button
              className="w-full"
              disabled={!count || applying}
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
            <AlertDialogTitle>Apply HSN {hsn} / GST {gstPct}% to {count} products?</AlertDialogTitle>
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
