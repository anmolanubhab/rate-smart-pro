import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportSheet } from "@/lib/excelTemplates";
import { deletePurchaseReturn } from "@/lib/returns";

const REASON_LABEL: Record<string, string> = {
  short_supply: "Short Supply",
  damaged: "Damaged Material",
  manufacturing_defect: "Manufacturing Defect",
  expired: "Expired Goods",
  wrong_item: "Wrong Item Supplied",
  rate_difference: "Rate Difference",
  other: "Other",
};

type ClaimRow = {
  id: string;
  return_number: string;
  return_date: string;
  supplier_name: string;
  supplier_id: string;
  invoice_number: string | null;
  reason_category: string | null;
  reason: string | null;
  source: string;
  total_amount: number;
  status: string;
};

export default function VendorClaimRegister() {
  useEffect(() => { document.title = "Vendor Claim Register — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id;
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ClaimRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("purchase_returns" as never)
      .select(
        "id, return_number, return_date, reason, reason_category, source, total_amount, status, parties(id, name), purchase_invoices(invoice_number)"
      )
      .eq("business_id", businessId)
      .order("return_date", { ascending: false });
    if (!error && data) {
      setRows(
        (data as any[]).map((r) => ({
          id: r.id,
          return_number: r.return_number,
          return_date: r.return_date,
          supplier_name: r.parties?.name ?? "—",
          supplier_id: r.parties?.id ?? "",
          invoice_number: r.purchase_invoices?.invoice_number ?? null,
          reason_category: r.reason_category,
          reason: r.reason,
          source: r.source ?? "manual",
          total_amount: Number(r.total_amount ?? 0),
          status: r.status ?? "posted",
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePurchaseReturn(deleteTarget.id);
      toast.success(`Claim ${deleteTarget.return_number} deleted`);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete claim");
    } finally {
      setDeleting(false);
    }
  };

  const bySupplier = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    for (const r of rows) {
      const cur = m.get(r.supplier_name) ?? { name: r.supplier_name, total: 0, count: 0 };
      cur.total += r.total_amount;
      cur.count += 1;
      m.set(r.supplier_name, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const totalClaims = rows.reduce((s, r) => s + r.total_amount, 0);
  const qcClaims = rows.filter((r) => r.source === "qc").reduce((s, r) => s + r.total_amount, 0);
  const manualClaims = totalClaims - qcClaims;

  const tableRows = rows.map((r) => ({
    id: r.id,
    return_no: r.return_number,
    date: r.return_date,
    supplier: r.supplier_name,
    against_invoice: r.invoice_number ?? "—",
    reason: r.reason_category ? REASON_LABEL[r.reason_category] ?? r.reason_category : (r.reason ?? "—"),
    origin: r.source === "qc" ? "QC (Auto)" : "Manual",
    origin_tone: r.source === "qc" ? "warning" : "default",
    amount: r.total_amount,
    status: r.status,
  }));

  const doExport = () =>
    exportSheet(
      rows.map((r) => ({
        "Return #": r.return_number,
        Date: r.return_date,
        Supplier: r.supplier_name,
        "Against Invoice": r.invoice_number,
        Reason: r.reason_category ? REASON_LABEL[r.reason_category] ?? r.reason_category : r.reason,
        Origin: r.source === "qc" ? "QC (Auto)" : "Manual",
        Amount: r.total_amount,
        Status: r.status,
      })),
      "vendor-claim-register",
      "Claims"
    );

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Vendor Claims"
        title="Vendor Claim Register"
        description={
          loading
            ? "Loading…"
            : "All Purchase Debit Notes (manual returns + QC-driven rejections) across suppliers. Original purchase invoices are never modified — every claim here is a separate, auditable document."
        }
        actions={
          <Button variant="outline" onClick={doExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        }
        kpis={[
          { label: "Total Claims", value: `₹ ${totalClaims.toLocaleString("en-IN")}` },
          { label: "From QC Rejections", value: `₹ ${qcClaims.toLocaleString("en-IN")}`, tone: "warning" },
          { label: "Manual Returns", value: `₹ ${manualClaims.toLocaleString("en-IN")}` },
          { label: "Suppliers with Claims", value: bySupplier.length },
        ]}
        columns={[
          { key: "return_no", label: "Debit Note #" },
          { key: "date", label: "Date" },
          { key: "supplier", label: "Supplier" },
          { key: "against_invoice", label: "Against Invoice" },
          { key: "reason", label: "Reason" },
          { key: "origin", label: "Origin", format: "badge" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={tableRows}
        rowActions={(row) =>
          row.status === "cancelled" ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(rows.find((r) => r.id === row.id) ?? null)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null
        }
      />

      {bySupplier.length > 0 && (
        <div className="max-w-7xl mx-auto mt-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-sm font-semibold mb-3">By Supplier</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {bySupplier.map((s) => (
                <div key={s.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.count} claim{s.count > 1 ? "s" : ""}</p>
                  </div>
                  <Badge variant="secondary">₹ {s.total.toLocaleString("en-IN")}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim {deleteTarget?.return_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this cancelled Debit Note and its line items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
