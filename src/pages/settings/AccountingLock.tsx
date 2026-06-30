import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Unlock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness, can } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchLockDate, setLockDate } from "@/lib/accountingLock";
import { logAudit } from "@/lib/audit";

export default function AccountingLock() {
  const { user } = useAuth();
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const editable = can(role, "settings.edit");
  const [draftDate, setDraftDate] = useState("");

  useEffect(() => { document.title = "Accounting Lock — RD Pro"; }, []);

  const { data: lock, isLoading, error } = useQuery({
    queryKey: ["accounting-lock", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchLockDate(business!.id),
  });

  useEffect(() => {
    if (lock?.lock_date) setDraftDate(lock.lock_date);
  }, [lock?.lock_date]);

  const tableMissing = error && /Could not find the table|PGRST205/i.test((error as any).message ?? "");

  const applyLock = async () => {
    if (!business?.id || !user?.id || !draftDate) return;
    try {
      await setLockDate(business.id, draftDate, user.id);
      await logAudit({ business_id: business.id, action: "ACCOUNTING_LOCK_SET", entity_type: "accounting_settings", new_value: { lock_date: draftDate } });
      toast.success(`Locked all vouchers on/before ${draftDate}`);
      qc.invalidateQueries({ queryKey: ["accounting-lock", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const clearLock = async () => {
    if (!business?.id || !user?.id) return;
    try {
      await setLockDate(business.id, null, user.id);
      await logAudit({ business_id: business.id, action: "ACCOUNTING_LOCK_CLEAR", entity_type: "accounting_settings" });
      toast.success("Accounting lock removed");
      setDraftDate("");
      qc.invalidateQueries({ queryKey: ["accounting-lock", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Accounting Lock</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Lock a date and every voucher dated on or before it becomes uneditable — create, edit,
          post, and delete are all blocked for that period. Use this once a month or year is
          finalized, the same way Tally's "Set Books Lock Date" works.
        </p>
      </header>

      {tableMissing && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            This feature needs a small database migration that hasn't been applied yet
            (<code>20260701000000_voucher_lock.sql</code>). Ask your developer to run it, then
            reload this page.
          </AlertDescription>
        </Alert>
      )}

      {!tableMissing && (
        <section className="rounded-2xl bg-card border p-6 space-y-5">
          <div className="flex items-center gap-3">
            {lock?.lock_date ? (
              <Lock className="h-5 w-5 text-amber-600" />
            ) : (
              <Unlock className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {isLoading ? "Loading…" : lock?.lock_date ? `Locked through ${lock.lock_date}` : "No lock set"}
              </p>
              {lock?.locked_at && (
                <p className="text-xs text-muted-foreground">
                  Set on {new Date(lock.locked_at).toLocaleString("en-IN")}
                </p>
              )}
            </div>
          </div>

          {editable ? (
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lock date</Label>
                <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
              </div>
              <Button onClick={applyLock} disabled={!draftDate}>
                <Lock className="h-4 w-4 mr-1" /> Apply lock
              </Button>
              {lock?.lock_date && (
                <Button variant="outline" onClick={clearLock}>
                  <Unlock className="h-4 w-4 mr-1" /> Remove lock
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You don't have permission to change the accounting lock. Contact an admin.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
