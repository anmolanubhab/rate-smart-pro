import { Badge } from "@/components/ui/badge";
import type { PlatformStaffStatus } from "@/lib/platformStaff";

// P5: five lifecycle states, only one of which grants console access.
// "invited" and "inactive" are neutral (nothing went wrong); "suspended" and
// "locked" are the two that mean someone or something revoked access.
const VARIANT: Record<PlatformStaffStatus, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  invited: "secondary",
  inactive: "outline",
  suspended: "destructive",
  locked: "destructive",
};

const LABEL: Record<PlatformStaffStatus, string> = {
  active: "Active",
  invited: "Invited",
  inactive: "Inactive",
  suspended: "Suspended",
  locked: "Locked",
};

export default function StaffStatusBadge({ status }: { status: PlatformStaffStatus }) {
  return <Badge variant={VARIANT[status] ?? "outline"}>{LABEL[status] ?? status}</Badge>;
}
