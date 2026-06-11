import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/hooks/useBusiness";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { createApprovalRequest } from "@/lib/approvals";
import {
  canDeleteDirectly,
  requiresApprovalForMutation,
  type ApprovalModule,
  MODULE_LABEL,
} from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

const PRESET_REASONS = [
  "Duplicate Entry",
  "Wrong Party",
  "Wrong Amount",
  "Other",
];

export function RequestDeleteDialog({
  open,
  onOpenChange,
  module,
  recordId,
  documentNo,
  beforeSnapshot,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  module: ApprovalModule;
  recordId: string;
  documentNo?: string | null;
  beforeSnapshot?: Record<string, unknown>;
  onCompleted?: () => void;
}) {
  const { business, role } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<string>(PRESET_REASONS[0]);
  const [detail, setDetail] = useState("");

  const needsApproval = requiresApprovalForMutation(role);
  const canDirect = canDeleteDirectly(role);

  const mut = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("No active business.");
      const fullReason = preset === "Other"
        ? detail.trim()
        : detail.trim() ? `${preset} — ${detail.trim()}` : preset;
      if (!fullReason) throw new Error("Please provide a reason.");

      if (canDirect && !needsApproval) {
        // Owner / admin → soft delete directly.
        const table = ({
          sales_invoice: "sales_invoices", dispatch: "dispatches", order: "orders",
          voucher: "vouchers", inventory_adjustment: "inventory_adjustments",
          party: "parties", product: "products",
        } as const)[module];
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from(table).update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
          delete_reason: fullReason,
        }).eq("id", recordId);
        if (error) throw error;
        await logAudit({
          business_id: business.id,
          action: `${module}.delete`,
          entity_type: module,
          entity_id: recordId,
          old_value: beforeSnapshot ?? null,
          reason: fullReason,
        });
        return { approval: false as const };
      }

      const req = await createApprovalRequest({
        business_id: business.id,
        module,
        record_id: recordId,
        document_no: documentNo ?? null,
        action_type: "delete",
        reason: fullReason,
        before_snapshot: beforeSnapshot ?? null,
        requester_role: role,
      });
      return { approval: true as const, req };
    },
    onSuccess: (res) => {
      toast({
        title: res.approval ? "Delete request submitted" : "Record deleted",
        description: res.approval
          ? "An approver will review your request shortly."
          : `${MODULE_LABEL[module]} marked as deleted.`,
      });
      qc.invalidateQueries();
      onOpenChange(false);
      setDetail("");
      setPreset(PRESET_REASONS[0]);
      onCompleted?.();
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canDirect && !needsApproval ? "Delete record" : "Request delete approval"}
          </DialogTitle>
          <DialogDescription>
            {canDirect && !needsApproval
              ? `This will soft-delete the ${MODULE_LABEL[module].toLowerCase()}. The record is preserved in the audit trail.`
              : `Submit a delete request for ${MODULE_LABEL[module].toLowerCase()} ${documentNo ?? ""}. A manager or admin must approve.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reason</Label>
            <RadioGroup value={preset} onValueChange={setPreset}>
              {PRESET_REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`reason-${r}`} />
                  <Label htmlFor={`reason-${r}`} className="font-normal">{r}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="detail">
              {preset === "Other" ? "Details (required)" : "Additional notes (optional)"}
            </Label>
            <Textarea
              id="detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Provide more context for the approver…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (preset === "Other" && !detail.trim())}
          >
            {mut.isPending
              ? "Submitting…"
              : canDirect && !needsApproval ? "Delete" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
