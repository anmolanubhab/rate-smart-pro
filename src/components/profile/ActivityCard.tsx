import { Activity } from "@/hooks/useProfileData";
import { Clock, UserPlus, KeyRound } from "lucide-react";

interface Props {
  activity?: Activity;
}

const ActivityCard = ({ activity }: Props) => {
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return "—";
    }
  };

  // Safe access with defaults
  const lastLogin = activity?.last_login || null;
  const createdAt = activity?.created_at || null;
  // last_password_change isn't tracked yet (Supabase auth doesn't
  // expose this directly) -- shown as "—" until that's added.
  const lastPasswordChange = null;

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Recent Activity</h4>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last Login: <span className="font-medium text-foreground">{formatDate(lastLogin)}</span></span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <UserPlus className="h-4 w-4" />
          <span>Account Created: <span className="font-medium text-foreground">{formatDate(createdAt)}</span></span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <KeyRound className="h-4 w-4" />
          <span>Last Password Change: <span className="font-medium text-foreground">{formatDate(lastPasswordChange)}</span></span>
        </div>
      </div>
    </div>
  );
};

export default ActivityCard;
