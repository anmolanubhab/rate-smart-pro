import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldAlert, ArrowLeft, Trash2, Undo2, Clock, Lock } from "lucide-react";
import { DeleteCompanyWizard } from "@/components/company/DeleteCompanyWizard";
import { verifyCurrentPassword } from "@/lib/companySafety";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function DangerZone() {
  const { business, role, loading } = useBusiness();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [openDelete, setOpenDelete] = useState(false);
  const [openExecute, setOpenExecute] = useState(false);
  const [pw, setPw] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Danger Zone — RD Pro"; }, []);

  const req = useQuery({
    queryKey: ["delete-request", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_delete_requests")
        .select("*")
        .eq("business_id", business!.id)
        .eq("status", "pending")
        .maybeSingle();
      return data;
    },
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!business) return <div className="p-8">No company selected.</div>;
  if (role !== "owner") {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <h1 className="font-semibold">Owner access required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Only the company owner can access the Danger Zone. Your current role is <span className="font-mono">{role}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cancelRequest = async () => {
    if (!confirm("Cancel the pending permanent-delete request? The company will be restored to normal use.")) return;
    const { error } = await supabase.rpc("cancel_permanent_delete", { _business_id: business.id } as never);
    if (error) return toast.error(error.message);
    toast.success("Deletion cancelled — company restored");
    qc.invalidateQueries({ queryKey: ["delete-request"] });
    qc.invalidateQueries({ queryKey: ["company-list"] });
  };

  const executeNow = async () => {
    setBusy(true);
    const pwErr = await verifyCurrentPassword(pw);
    if (pwErr) { setBusy(false); toast.error(pwErr); return; }
    try {
      const { error } = await supabase.rpc("execute_permanent_delete", { _business_id: business.id } as never);
      if (error) throw error;
      toast.success("Company permanently deleted");
      qc.clear();
      nav("/companies");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const eligible = req.data ? new Date(req.data.eligible_at) : null;
  const now = new Date();
  const canExecute = !!eligible && now >= eligible;
  const daysLeft = eligible ? Math.max(0, Math.ceil((eligible.getTime() - now.getTime()) / 86400000)) : 0;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <button onClick={() => nav("/settings")} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Settings
      </button>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-destructive">Danger Zone</h1>
          <p className="text-sm text-muted-foreground">{business.business_name}</p>
        </div>
      </header>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" /> Delete this company</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Permanent deletion is a multi-step process. The company is soft-deleted immediately and hidden from all users.
              After 90 days, an owner may execute the final, irreversible erase.
            </p>
          </div>
          {!req.data && (
            <Button variant="destructive" onClick={() => setOpenDelete(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Start deletion
            </Button>
          )}
        </div>

        {req.data && (
          <div className="rounded-md border bg-background p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="destructive">Pending</Badge>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                Requested {new Date(req.data.requested_at).toLocaleString()} · Eligible {eligible?.toLocaleDateString()} ({daysLeft} day{daysLeft === 1 ? "" : "s"} remaining)
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelRequest}>
                <Undo2 className="h-4 w-4 mr-2" /> Cancel & Restore
              </Button>
              <Button
                variant="destructive"
                disabled={!canExecute}
                onClick={() => setOpenExecute(true)}
                title={!canExecute ? `Available after ${eligible?.toLocaleDateString()}` : "Permanent, irreversible erase"}
              >
                <Lock className="h-4 w-4 mr-2" />
                {canExecute ? "Execute permanent delete" : `Locked · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <DeleteCompanyWizard
        open={openDelete}
        onOpenChange={setOpenDelete}
        businessId={business.id}
        businessName={business.business_name}
        onDeleted={() => {
          qc.invalidateQueries({ queryKey: ["delete-request"] });
          qc.invalidateQueries({ queryKey: ["company-list"] });
        }}
      />

      <Dialog open={openExecute} onOpenChange={(v) => !busy && setOpenExecute(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Permanent, irreversible deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Every record for <span className="font-semibold">{business.business_name}</span> will be erased. There is no way to recover it.</p>
            <div>
              <Label>Current account password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} />
              I understand this action is permanent and irreversible.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenExecute(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={executeNow} disabled={busy || !ack || pw.length < 4}>
              {busy ? "Erasing…" : "Erase forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
