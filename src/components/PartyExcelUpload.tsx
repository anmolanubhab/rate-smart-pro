import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileDown, AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onImported: () => void;
}

type Parsed = {
  raw: any;
  name: string;
  phone: string;
  gst: string;
  address: string;
  billing_address: string;
  shipping_address: string;
  beat: string;
  credit_limit: number;
  outstanding_balance: number;
  default_discount: number;
  agreed_discount: number;
  notes: string;
  duplicateId?: string;
  error?: string;
};

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/[, ₹]/g, ""));
  return isFinite(n) ? n : 0;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const pick = (row: any, keys: string[]) => {
  const lower: Record<string, any> = {};
  Object.keys(row).forEach((k) => (lower[k.toLowerCase().trim()] = row[k]));
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};

const downloadPartyTemplate = () => {
  const ws = XLSX.utils.json_to_sheet([
    {
      "Party Name": "Ajit",
      "Phone": "7992480496",
      "GST Number": "29ABCDE1234F1Z5",
      "Billing Address": "Patna",
      "Shipping Address": "Patna",
      "Beat / Area": "Market Road",
      "Default Discount %": 20,
      "Agreed Discount %": 22,
      "Credit Limit": 0,
      "Outstanding Balance": 0,
      "Notes": "",
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Parties");
  XLSX.writeFile(wb, "parties-template.xlsx");
};

function PartyExcelUpload({ open, onOpenChange, userId, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupMode, setDupMode] = useState<"skip" | "update">("update");

  const reset = () => {
    setRows([]);
    setFileName("");
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) throw new Error("Empty file");

      const { data: existing, error } = await supabase
        .from("parties")
        .select("id,name")
        .eq("user_id", userId);
      if (error) throw error;
      const byName = new Map((existing || []).map((p: any) => [norm(String(p.name || "")), p.id]));

      const parsed: Parsed[] = json.map((r) => {
        const name = String(pick(r, ["party name", "name", "party", "customer", "customer name"]) || "").trim();
        const phone = String(pick(r, ["phone", "mobile", "contact", "phone no", "mobile no"]) || "").trim();
        const gst = String(pick(r, ["gst", "gst number", "gstin", "gst no"]) || "").trim();
        const address = String(pick(r, ["address", "short address"]) || "").trim();
        const billing_address = String(pick(r, ["billing address", "bill address"]) || "").trim();
        const shipping_address = String(pick(r, ["shipping address", "ship address"]) || "").trim();
        const beat = String(pick(r, ["beat", "beat / area", "area"]) || "").trim();
        const credit_limit = num(pick(r, ["credit limit", "limit"]) || 0);
        const outstanding_balance = num(pick(r, ["outstanding", "outstanding balance", "balance"]) || 0);
        const default_discount = num(pick(r, ["default discount", "default discount %", "default %", "default"]) || 0);
        const agreed_discount = num(pick(r, ["agreed discount", "agreed discount %", "agreed %", "agreed"]) || 0);
        const notes = String(pick(r, ["notes", "remark", "remarks"]) || "").trim();

        let errorMsg: string | undefined;
        if (!name) errorMsg = "Missing party name";

        const duplicateId = name ? byName.get(norm(name)) : undefined;
        return {
          raw: r,
          name,
          phone,
          gst,
          address,
          billing_address,
          shipping_address,
          beat,
          credit_limit,
          outstanding_balance,
          default_discount,
          agreed_discount,
          notes,
          duplicateId,
          error: errorMsg,
        };
      });

      setRows(parsed);
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);
  const dupCount = valid.filter((r) => r.duplicateId).length;

  const handleConfirm = async () => {
    const inserts = valid.filter((r) => !r.duplicateId);
    const updates = dupMode === "update" ? valid.filter((r) => r.duplicateId) : [];

    const toInsert = inserts.map((r) => ({
      user_id: userId,
      name: r.name.trim(),
      phone: r.phone || null,
      gst: r.gst || null,
      address: r.address || null,
      billing_address: r.billing_address || null,
      shipping_address: r.shipping_address || null,
      beat: r.beat || null,
      credit_limit: r.credit_limit || 0,
      outstanding_balance: r.outstanding_balance || 0,
      default_discount: r.default_discount || 0,
      discount_type: "RD" as const,
      agreed_discount: r.agreed_discount || 0,
      notes: r.notes || null,
    }));

    try {
      if (toInsert.length) {
        const { error } = await supabase.from("parties").insert(toInsert);
        if (error) throw error;
      }

      for (const r of updates) {
        const payload = {
          name: r.name.trim(),
          phone: r.phone || null,
          gst: r.gst || null,
          address: r.address || null,
          billing_address: r.billing_address || null,
          shipping_address: r.shipping_address || null,
          beat: r.beat || null,
          credit_limit: r.credit_limit || 0,
          outstanding_balance: r.outstanding_balance || 0,
          default_discount: r.default_discount || 0,
          discount_type: "RD",
          agreed_discount: r.agreed_discount || 0,
          notes: r.notes || null,
        };
        const { error } = await supabase.from("parties").update(payload).eq("id", r.duplicateId as string);
        if (error) throw error;
      }

      toast.success(
        `Imported ${toInsert.length} party(s)` +
          (updates.length ? `, updated ${updates.length}` : "") +
          (dupMode === "skip" && dupCount ? `, skipped ${dupCount}` : ""),
      );
      reset();
      onOpenChange(false);
      onImported();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload Parties from Excel</DialogTitle>
          <DialogDescription>Drop an .xlsx / .xls / .csv file. Party name is required.</DialogDescription>
        </DialogHeader>

        {!rows.length ? (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:bg-muted/30 cursor-pointer transition"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Click or drag file here</p>
              <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv up to 10MB</p>
              {busy && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-3" />}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Need a starting point?</span>
              <Button variant="outline" size="sm" onClick={downloadPartyTemplate}>
                <FileDown className="h-4 w-4" /> Download Sample Template
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile icon={CheckCircle2} label="Valid" value={valid.length} color="text-emerald-600" />
              <Tile icon={AlertCircle} label="Invalid" value={invalid.length} color="text-destructive" />
              <Tile label="Duplicates" value={dupCount} />
              <Tile label="New" value={valid.length - dupCount} />
            </div>

            <div className="flex items-center gap-4 px-1">
              <Label className="text-sm font-medium">Duplicates:</Label>
              <RadioGroup value={dupMode} onValueChange={(v: any) => setDupMode(v)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="update" id="u" />
                  <Label htmlFor="u">Update existing</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="skip" id="k" />
                  <Label htmlFor="k">Skip</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex-1 overflow-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Party</th>
                    <th className="px-2 py-2">Phone</th>
                    <th className="px-2 py-2">GST</th>
                    <th className="px-2 py-2 text-right">Default%</th>
                    <th className="px-2 py-2 text-right">Agreed%</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium">{r.name || "—"}</td>
                      <td className="px-2 py-1.5">{r.phone || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.gst || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.default_discount || 0}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.agreed_discount || 0}</td>
                      <td className="px-2 py-1.5">
                        {r.error ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">
                            {r.error}
                          </Badge>
                        ) : r.duplicateId ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5">
                            Duplicate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/5">
                            New
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                <X className="h-4 w-4" /> Discard
              </Button>
              <Button onClick={handleConfirm} disabled={!valid.length} className="gradient-primary text-white border-0">
                Confirm Import ({valid.length})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon?: any;
  label: string;
  value: any;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      {Icon && <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export default PartyExcelUpload;

