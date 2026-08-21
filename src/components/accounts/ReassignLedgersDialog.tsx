import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import GroupSelector from "@/components/accounts/GroupSelector";
import { moveLedgersToGroup, type AccountGroupNode } from "@/lib/accounting";

interface Props {
  /** Non-empty array opens the dialog (single ledger from Chart of Accounts,
   *  or a multi-select from Ledger Accounts' bulk "Move Ledgers" action). */
  ledgerIds: string[];
  label: string;
  onClose: () => void;
  groups: AccountGroupNode[];
  onDone: () => void;
}

/** Plain "reassign these ledgers to a different group" dialog — unlike
 *  MoveLedgersDialog, this does not delete anything afterward. Used by
 *  Chart of Accounts (single ledger) and Ledger Accounts (bulk selection). */
export default function ReassignLedgersDialog({ ledgerIds, label, onClose, groups, onDone }: Props) {
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!targetGroupId) return;
    setSaving(true);
    try {
      await moveLedgersToGroup(ledgerIds, targetGroupId);
      toast.success(`Moved ${label} to the selected group`);
      setTargetGroupId(null);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not move ledgers");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={ledgerIds.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move {label}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>Move to group</Label>
          <GroupSelector groups={groups} value={targetGroupId} onChange={setTargetGroupId} placeholder="Select target group" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !targetGroupId}>{saving ? "Moving…" : "Move"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
