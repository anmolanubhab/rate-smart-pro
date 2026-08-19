import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DatabaseBackup } from "lucide-react";

export function CreateBackupDialog({
  open,
  onOpenChange,
  businessId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const createBackup = async () => {
    setBusy(true);
    try {
      const { data: backupId, error: jobError } = await supabase.rpc("create_backup_job" as never, {
        _business_id: businessId,
        _backup_type: "manual",
      } as never);
      if (jobError) throw jobError;

      const { data: { session } } = await supabase.auth.getSession();
      const { error: exportError } = await supabase.functions.invoke("backup-export", {
        body: { business_id: businessId, backup_id: backupId },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (exportError) throw exportError;

      toast.success("Backup created");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create backup");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5" /> Create a backup now
          </DialogTitle>
          <DialogDescription>
            Every party, product, invoice, voucher, ledger entry and setting for this company will be
            exported, compressed and encrypted. This may take a moment for large companies.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={createBackup} disabled={busy}>
            {busy ? "Creating backup…" : "Create backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
