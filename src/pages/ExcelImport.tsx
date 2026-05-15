import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchParties, Party } from "@/lib/parties";
import { computeItem, saveOrder } from "@/lib/orders";
import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, any>;

const COLUMN_HINTS: Record<string, string[]> = {
  party: ["party", "customer", "client", "buyer", "dealer"],
  order_number: ["order no", "order #", "order_no", "order number", "ord no", "bill no", "invoice no"],
  date: ["date", "order date", "bill date"],
  part_number: ["part", "part no", "part number", "part_no", "sku", "item code"],
  description: ["description", "name", "item", "product"],
  qty: ["qty", "quantity", "qnty", "ord qty"],
  rate: ["rate", "price", "mrp", "unit price"],
  discount: ["disc", "discount", "disc%", "discount%"],
  gst: ["gst", "gst%", "tax", "tax%"],
  pending: ["pending", "balance", "pend qty"],
};

function autoDetect(header: string[]) {
  const map: Record<string, string> = {};
  for (const key of Object.keys(COLUMN_HINTS)) {
    const hints = COLUMN_HINTS[key];
    const match = header.find((h) => hints.some((hint) => h.toLowerCase().trim().includes(hint)));
    if (match) map[key] = match;
  }
  return map;
}

const ExcelImport = () => {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [defaultParty, setDefaultParty] = useState("");
  const [mode, setMode] = useState<"new" | "pending">("new");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  useEffect(() => { document.title = "Excel Import — Spare Parts OMS"; }, []);
  useEffect(() => { if (user) fetchParties(user.id).then(setParties); }, [user]);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      if (!json.length) { toast.error("Empty file"); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(json);
      setMapping(autoDetect(hdrs));
      toast.success(`Loaded ${json.length} rows from ${file.name}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!rows.length) return issues;
    if (!mapping.part_number) issues.push("Map the Part Number column");
    if (!mapping.qty) issues.push("Map the Qty column");
    if (!mapping.party && !defaultParty) issues.push("Map a Party column or pick a default party");
    return issues;
  }, [rows, mapping, defaultParty]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { partyName: string; orderNumber: string; date: string; items: any[] }>();
    for (const r of rows) {
      const partyName = (mapping.party ? String(r[mapping.party] || "") : "") || (parties.find((p) => p.id === defaultParty)?.name ?? "");
      const orderNumber = mapping.order_number ? String(r[mapping.order_number] || "") : "";
      const date = mapping.date ? String(r[mapping.date] || "") : "";
      const key = `${partyName}|${orderNumber || "AUTO"}`;
      if (!groups.has(key)) groups.set(key, { partyName, orderNumber, date, items: [] });
      groups.get(key)!.items.push(r);
    }
    return Array.from(groups.values());
  }, [rows, mapping, defaultParty, parties]);

  const handleImport = async () => {
    if (!user) return;
    if (validation.length) { toast.error(validation[0]); return; }
    setImporting(true);
    let okOrders = 0, failed = 0;
    try {
      for (const g of grouped) {
        const party = parties.find((p) => p.name.toLowerCase().trim() === g.partyName.toLowerCase().trim()) || parties.find((p) => p.id === defaultParty);
        if (!party) { failed++; continue; }
        const items = g.items.map((r, idx) => {
          const qty = Number(r[mapping.qty]) || 0;
          const pending = mapping.pending ? Number(r[mapping.pending]) || 0 : qty;
          const dispatched = mode === "pending" ? Math.max(qty - pending, 0) : 0;
          const item = computeItem({
            part_number: String(r[mapping.part_number] || "").trim(),
            description: mapping.description ? String(r[mapping.description] || "") : "",
            qty,
            mrp: mapping.rate ? Number(r[mapping.rate]) || 0 : 0,
            discount_pct: mapping.discount ? Number(r[mapping.discount]) || 0 : 0,
            gst_pct: mapping.gst ? Number(r[mapping.gst]) || 18 : 18,
            position: idx,
          });
          (item as any).dispatched_qty = dispatched;
          return item;
        }).filter((it) => it.part_number && it.qty > 0);
        if (!items.length) { failed++; continue; }

        let orderDate = g.date;
        const parsed = orderDate ? new Date(orderDate) : null;
        if (!parsed || isNaN(parsed.getTime())) orderDate = new Date().toISOString().slice(0, 10);
        else orderDate = parsed.toISOString().slice(0, 10);

        const saved = await saveOrder({
          userId: user.id,
          order_number: g.orderNumber || undefined,
          order_date: orderDate,
          party_id: party.id,
          party_name: party.name,
          party_snapshot: party,
          billing_address: party.billing_address ?? party.address ?? null,
          shipping_address: party.shipping_address ?? party.address ?? null,
          mode: party.discount_type,
          status: mode === "pending" ? "partial" : "pending",
          source_type: "excel",
          remarks: mode === "pending" ? "Imported pending balance" : "Imported from Excel",
          items,
        });

        // For pending mode, write a synthetic dispatch so dispatched_qty is reflected.
        if (mode === "pending") {
          const itemsWithDisp = items.filter((it: any) => (it.dispatched_qty || 0) > 0);
          if (itemsWithDisp.length) {
            const { data: inserted } = await supabase.from("order_items").select("id, part_number, dispatched_qty, net_rate").eq("order_id", saved.id);
            const dispNum = `DSP-${Date.now()}`;
            const { data: d } = await supabase.from("dispatches").insert({
              user_id: user.id, order_id: saved.id, party_id: party.id,
              dispatch_number: dispNum, dispatch_date: orderDate, notes: "Opening pending import",
            }).select().single();
            if (d && inserted) {
              const dRows = inserted
                .filter((row) => Number(row.dispatched_qty) > 0)
                .map((row) => ({ user_id: user.id, dispatch_id: d.id, order_item_id: row.id, dispatched_qty: Number(row.dispatched_qty), rate: Number(row.net_rate), total: +(Number(row.dispatched_qty) * Number(row.net_rate)).toFixed(2) }));
              if (dRows.length) await supabase.from("dispatch_items").insert(dRows);
              // reset order_items.dispatched_qty (trigger will recompute from dispatch_items)
              await supabase.from("order_items").update({ dispatched_qty: 0 }).eq("order_id", saved.id);
            }
          }
        }
        okOrders++;
      }
      toast.success(`Imported ${okOrders} order(s)${failed ? ` · ${failed} skipped` : ""}`);
      setRows([]); setHeaders([]); setMapping({});
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Orders</p>
        <h1 className="font-display text-3xl font-bold mt-1">Excel Import</h1>
        <p className="text-muted-foreground mt-1 text-sm">Upload .xlsx / .xls, auto-map columns, preview, import as new orders or opening pending balances.</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Mode</Label>
          <Select value={mode} onValueChange={(v: any) => setMode(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New Orders (all qty pending)</SelectItem>
              <SelectItem value="pending">Opening Pending Balance</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Default Party (if file has none)</Label>
          <Select value={defaultParty} onValueChange={setDefaultParty}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Upload File</Label>
          <Input type="file" accept=".xlsx,.xls,.csv" className="mt-1" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </div>

      {headers.length > 0 && (
        <>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Column Mapping</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.keys(COLUMN_HINTS).map((field) => (
                <div key={field}>
                  <Label className="text-xs capitalize">{field.replace("_", " ")}</Label>
                  <Select value={mapping[field] || ""} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {validation.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {validation.join(" · ")}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Ready · {grouped.length} order group(s) · {rows.length} row(s)
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 uppercase text-[10px] text-muted-foreground sticky top-0">
                  <tr>{headers.map((h) => <th key={h} className="text-left px-2 py-2">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {headers.map((h) => <td key={h} className="px-2 py-1">{String(r[h] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && <div className="p-2 text-center text-xs text-muted-foreground border-t border-border">Showing 50 of {rows.length}</div>}
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline">{grouped.length} order(s) will be created</Badge>
            <Button onClick={handleImport} disabled={importing || validation.length > 0} className="gradient-primary text-white border-0">
              <Upload className="h-4 w-4" />{importing ? "Importing..." : "Import Now"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExcelImport;
