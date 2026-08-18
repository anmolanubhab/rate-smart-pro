import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, LockOpen, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { logAudit } from "@/lib/audit";

type FinancialYear = {
  id: string;
  fy_name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_closed: boolean;
  closed_at: string | null;
};

/** Default suggestion only -- the actual saved dates are whatever the user
 *  types, this just seeds sensible next-FY values (Apr 1 - Mar 31). */
function suggestNextFy(latest?: FinancialYear) {
  const start = latest ? new Date(latest.end_date) : new Date(`${new Date().getFullYear()}-04-01`);
  if (latest) start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default function FinancialYears() {
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [closeTarget, setCloseTarget] = useState<FinancialYear | null>(null);

  useEffect(() => { document.title = "Financial Years — RD Pro"; }, []);

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["financial-years", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years" as any)
        .select("id, fy_name, start_date, end_date, is_current, is_closed, closed_at")
        .eq("business_id", business!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FinancialYear[];
    },
  });

  useEffect(() => {
    if (!startDate && !endDate && !isLoading) {
      const s = suggestNextFy(years[0]);
      setStartDate(s.start);
      setEndDate(s.end);
      const startYear = new Date(s.start).getFullYear();
      setName(`FY ${startYear}-${String(startYear + 1).slice(2)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const openYear = async () => {
    if (!business?.id || !name.trim() || !startDate || !endDate) return;
    try {
      const { error } = await supabase.rpc("open_financial_year" as any, {
        _business_id: business.id,
        _fy_name: name.trim(),
        _start_date: startDate,
        _end_date: endDate,
        _set_current: true,
      });
      if (error) throw error;
      await logAudit({ business_id: business.id, action: "FINANCIAL_YEAR_OPEN", entity_type: "financial_years", new_value: { name, startDate, endDate } });
      toast.success(`${name} opened and set as current`);
      qc.invalidateQueries({ queryKey: ["financial-years", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const closeYear = async () => {
    if (!closeTarget) return;
    try {
      const { error } = await supabase.rpc("close_financial_year" as any, { _financial_year_id: closeTarget.id });
      if (error) throw error;
      await logAudit({ business_id: business?.id, action: "FINANCIAL_YEAR_CLOSE", entity_type: "financial_years", entity_id: closeTarget.id });
      toast.success(`${closeTarget.fy_name} closed — no further posting allowed inside it`);
      qc.invalidateQueries({ queryKey: ["financial-years", business?.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCloseTarget(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Financial Years</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Closing a financial year posts the closing-stock journal (and, from the second year
          onward, carries the prior closing balance into this year's Opening Stock), then blocks
          any new posting (or deletion of an already-posted voucher) dated inside it. Closing is
          only allowed once this business's Trial Balance is balanced. This is additional to, and
          independent of, the single Accounting Lock date.
        </p>
      </header>

      {editable && (
        <section className="rounded-2xl bg-card border p-6 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="FY 2026-27" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Start</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">End</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button onClick={openYear} disabled={!name.trim() || !startDate || !endDate}>
            <CalendarClock className="h-4 w-4 mr-1" /> Open year
          </Button>
        </section>
      )}

      <section className="rounded-2xl bg-card border p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.fy_name}</TableCell>
                  <TableCell>{y.start_date}</TableCell>
                  <TableCell>{y.end_date}</TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {y.is_closed
                        ? <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Closed</Badge>
                        : <Badge variant="outline"><LockOpen className="h-3 w-3 mr-1" />Open</Badge>}
                      {y.is_current && <Badge>Current</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {editable && !y.is_closed && (
                      <Button size="sm" variant="outline" onClick={() => setCloseTarget(y)}>
                        <Lock className="h-3.5 w-3.5 mr-1" /> Close
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && years.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No financial years configured yet. Posting is not restricted by financial year until you open one.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <AlertDialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {closeTarget?.fy_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This posts the closing-stock journal (Dr Stock-in-Hand / Cr Closing Stock) for this
              year, carries forward any prior year's closing balance into this year's Opening
              Stock, then blocks any new posted voucher, and the deletion of any already-posted
              voucher, dated between {closeTarget?.start_date} and {closeTarget?.end_date}. It only
              succeeds if this business's Trial Balance is currently balanced — if it isn't,
              closing will be refused and nothing changes. This cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={closeYear}>Close year</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
