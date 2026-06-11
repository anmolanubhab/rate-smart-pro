import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { rejectRequest, type ApprovalRequest } from "@/lib/approvals";
import { useBusiness } from "@/hooks/useBusiness";

export function RejectRequestDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: ApprovalRequest | null;
}) {
  const { role } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("No request selected.");
      await rejectRequest(request, role, reason.trim());
    },
    onSuccess: () => {
      toast({ title: "Request rejected" });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Failed to reject", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>
            Provide a reason. The requester will see this in their audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="reject-reason">Rejection reason</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this request being rejected?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
