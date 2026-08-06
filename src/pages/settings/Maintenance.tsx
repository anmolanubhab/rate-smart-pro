// src/pages/settings/Maintenance.tsx
// Route: /settings/maintenance — Owner/Admin only.
//
// Data-rebuild actions that a normal operator should never need and should
// never see on the main working pages. "Rebuild Ledger Balances" replaces
// the "Recalculate Balances" button that used to live on the Ledger
// Accounts page — current_balance is now kept correct automatically by DB
// triggers on every voucher post/cancel (see
// supabase/migrations/20260804120000_fix_ledger_balance_trigger_and_status_sync.sql),
// so this is only for recovery after a bulk import, migration, or bug.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Wrench, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canAccessMaintenance } from "@/lib/permissions";
import { backfillAccounting } from "@/lib/accounting";

export default function Maintenance() {
  useEffect(() => { document.title = "Maintenance — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, loading } = useBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rebuilding, setRebuilding] = useState(false);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!business) return <div className="p-8">No company selected.</div>;

  if (!canAccessMaintenance(role)) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <h1 className="font-semibold">Owner or Admin access required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Maintenance actions can change stored balances across the whole company. Your current role is{" "}
              <span className="font-mono">{role}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rebuildLedgerBalances = async () => {
    if (!user?.id) return;
    setRebuilding(true);
    try {
      const r = await backfillAccounting(user.id);
      toast.success(`Rebuilt balances for ${r.parties} parties from posted voucher history.`);
      qc.invalidateQueries({ queryKey: ["ledgers"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    } catch (e: any) {
      toast.error(e.message ?? "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <button onClick={() => navigate("/settings")} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Settings
      </button>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-sm text-muted-foreground">{business.business_name}</p>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Rebuild Ledger Balances</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Every ledger's balance updates automatically the moment a voucher is posted or cancelled —
              this should never be needed in normal use. Use it only after a bulk data import, a database
              migration, or to recover from a reported bug: it recalculates every ledger's balance from
              scratch off the actual posted-voucher history.
            </p>
          </div>
          <Button onClick={rebuildLedgerBalances} disabled={rebuilding}>
            {rebuilding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {rebuilding ? "Rebuilding…" : "Rebuild Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
