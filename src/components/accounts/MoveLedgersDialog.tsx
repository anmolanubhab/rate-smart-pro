import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import GroupSelector from "@/components/accounts/GroupSelector";
import { moveLedgersToGroup, deleteAccountGroup, type AccountGroupNode } from "@/lib/accounting";

interface Props {
  /** Non-null opens the dialog; null closes it. */
  target: { group: AccountGroupNode; ledgerIds: string[] } | null;
  onClose: () => void;
  groups: AccountGroupNode[];
  /** Called after ledgers are moved and the (now-empty) source group is
   *  deleted, so the caller can refresh its group/ledger queries. */
  onDone: () => void;
}

/** Bulk-reassign every ledger currently posted to `target.group` to a
 *  different group, then delete the now-empty source group — the
 *  remediation flow `delete_account_group()` points a caller at when it
 *  refuses to delete a group that still has ledgers attached. Shared by
 *  Group Master and Chart of Accounts. */
export default function MoveLedgersDialog({ target, onClose, groups, onDone }: Props) {
  const [moveToGroupId, setMoveToGroupId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const confirm = async () => {
    if (!target || !moveToGroupId) return;
    setMoving(true);
    try {
      await moveLedgersToGroup(target.ledgerIds, moveToGroupId);
      await deleteAccountGroup(target.group.id);
      toast.success(`Ledgers moved and "${target.group.name}" deleted`);
      setMoveToGroupId(null);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not move ledgers");
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move Ledgers Before Deleting</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          "{target?.group.name}" has {target?.ledgerIds.length} ledger(s) assigned to it. Choose a group to move them to
          before it can be deleted.
        </p>
        <div className="space-y-1.5">
          <Label>Move ledgers to</Label>
          <GroupSelector
            groups={groups}
            value={moveToGroupId}
            onChange={setMoveToGroupId}
            excludeIds={target ? new Set([target.group.id]) : undefined}
            placeholder="Select target group"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={moving}>Cancel</Button>
          <Button onClick={confirm} disabled={moving || !moveToGroupId}>{moving ? "Moving…" : "Move & Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
