import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/lib/approvals";

const VARIANTS: Record<
  ApprovalStatus | "locked" | "cancelled" | "deleted" | "active",
  { label: string; className: string }
> = {
  pending: { label: "Pending Approval", className: "bg-amber-100 text-amber-900 hover:bg-amber-100" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-900 hover:bg-rose-100" },
  cancelled: { label: "Cancelled", className: "bg-slate-200 text-slate-700 hover:bg-slate-200" },
  locked: { label: "Locked", className: "bg-blue-100 text-blue-900 hover:bg-blue-100" },
  deleted: { label: "Deleted", className: "bg-rose-200 text-rose-900 hover:bg-rose-200" },
  active: { label: "Active", className: "bg-emerald-50 text-emerald-800 hover:bg-emerald-50" },
};

export function StatusBadge({
  status,
}: {
  status: keyof typeof VARIANTS;
}) {
  const v = VARIANTS[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={v.className}>
      {v.label}
    </Badge>
  );
}
