import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import CreateQuotationDialog from "@/components/sales/CreateQuotationDialog";
import { fetchQuotations, convertQuotationToOrder, type Quotation } from "@/lib/quotations";
import { useFormatDate } from "@/lib/dateFormat";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", accepted: "default",
  rejected: "destructive", expired: "destructive", converted: "default",
};

export default function Quotations() {
  useEffect(() => { document.title = "Quotations — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", businessId],
    enabled: !!businessId,
    queryFn: () => fetchQuotations(businessId!),
  });
  const rows = data ?? [];

  const totalQuotations = rows.length;
  const draftCount = rows.filter((r) => r.status === "draft").length;
  const acceptedValue = rows.filter((r) => r.status === "accepted").reduce((s, r) => s + Number(r.grand_total), 0);
  const convertedCount = rows.filter((r) => r.status === "converted").length;

  const handleConvert = async (q: Quotation) => {
    if (!user) return;
    setConverting(q.id);
    try {
      const order = await convertQuotationToOrder(q.id, user.id);
      toast.success(`Converted to Order ${order.order_number}`);
      qc.invalidateQueries({ queryKey: ["quotations", businessId] });
      navigate(`/orders/edit/${order.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to convert quotation");
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales · Quotations</p>
          <h1 className="text-2xl font-bold mt-1">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">Send price quotes to customers before they commit to a Sales Order.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />New Quotation
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Quotations</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{totalQuotations}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Draft</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{draftCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Accepted Value</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums text-emerald-600">{inr(acceptedValue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Converted to Orders</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{convertedCount}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quotation #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No quotations yet</TableCell></TableRow>
            ) : rows.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-sm">{q.quotation_number}</TableCell>
                <TableCell>{q.party_name ?? "—"}</TableCell>
                <TableCell>{fd(q.quotation_date)}</TableCell>
                <TableCell>{fd(q.valid_until)}</TableCell>
                <TableCell className="text-right font-semibold">{inr(q.grand_total)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[q.status] ?? "secondary"}>{q.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {q.status === "converted" ? (
                    <span className="text-xs text-muted-foreground">Converted</span>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      disabled={converting === q.id}
                      onClick={() => handleConvert(q)}
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />
                      {converting === q.id ? "Converting…" : "Convert to Order"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateQuotationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["quotations", businessId] })}
      />
    </div>
  );
}
