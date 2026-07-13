import { Activity } from "@/hooks/useProfileData";
import { Clock, UserPlus, KeyRound } from "lucide-react";

interface Props {
  activity: Activity;
}

const ActivityCard = ({ activity }: Props) => {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Recent Activity</h4>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last Login: <span className="font-medium text-foreground">{formatDate(activity.last_login)}</span></span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <UserPlus className="h-4 w-4" />
          <span>Account Created: <span className="font-medium text-foreground">{formatDate(activity.created_at)}</span></span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <KeyRound className="h-4 w-4" />
          <span>Last Password Change: <span className="font-medium text-foreground">{formatDate(activity.last_password_change)}</span></span>
        </div>
      </div>
    </div>
  );
};

export default ActivityCard;
