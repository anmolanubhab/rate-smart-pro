import { User } from "@supabase/supabase-js";
import { Mail, Phone, User as UserIcon, Camera } from "lucide-react";
import { Profile } from "@/hooks/useProfileData";

interface Props {
  profile: Profile | null;
  user: User | null;
}

const PersonalInfoCard = ({ profile, user }: Props) => {
  const fullName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const mobile = profile?.mobile || "Not set";
  const avatarUrl = profile?.avatar_url;

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        {/* Avatar with upload */}
        <div className="relative flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-24 w-24 rounded-2xl object-cover border-2 border-border"
            />
          ) : (
            <div className="h-24 w-24 rounded-2xl gradient-primary text-white flex items-center justify-center font-display text-2xl font-bold shadow-elegant">
              {fullName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <button
            className="absolute -bottom-1 -right-1 bg-primary text-white p-1.5 rounded-full shadow-md hover:bg-primary-hover transition-colors"
            aria-label="Upload photo"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold truncate">{fullName}</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span className="truncate">{email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{mobile}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoCard;
