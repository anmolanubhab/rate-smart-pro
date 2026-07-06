import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Lock } from "lucide-react";
import { toast } from "sonner";
import { verifyCurrentPassword } from "@/lib/companySafety";

export function ArchiveCompanyDialog({
  open, onOpenChange, businessId, businessName, onArchived,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  businessName: string;
  onArchived?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setPassword(""); setReason(""); } }, [open]);

  const submit = async () => {
    setBusy(true);
    const pwErr = await verifyCurrentPassword(password);
    if (pwErr) { setBusy(false); toast.error(pwErr); return; }
    try {
      const { error } = await supabase.rpc("archive_business", { _business_id: businessId });
      if (error) throw error;
      await supabase.from("company_audit_logs").insert({
        business_id: businessId,
        user_id: (await supabase.auth.getUser()).data.user!.id,
        action: "COMPANY_ARCHIVED",
        reason: reason || null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      });
      toast.success(`Archived "${businessName}"`);
      onArchived?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-amber-600" /> Archive company</DialogTitle>
          <DialogDescription>
            "{businessName}" will be hidden from the active list and become read-only. Data is preserved and can be restored anytime by an owner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason (optional, logged)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Business sold to partner" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Lock className="h-3 w-3" /> Current account password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || password.length < 4}
            className="bg-amber-600 hover:bg-amber-700 text-white">
            {busy ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
