import { useEffect } from "react";
import { LogOut, Mail, Calendar, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const Profile = () => {
  const { user, signOut } = useAuth();

  useEffect(() => {
    document.title = "Profile — RD Calculator Pro";
  }, []);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Profile</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Your account</h1>
      </header>

      <div className="rounded-2xl bg-card border border-border shadow-soft p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl gradient-primary text-white flex items-center justify-center font-display text-2xl font-bold shadow-elegant">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold truncate">{user?.email}</h2>
            <p className="text-sm text-muted-foreground">Signed in</p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <InfoRow icon={Mail} label="Email" value={user?.email ?? "—"} />
          <InfoRow icon={Calendar} label="Joined" value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"} />
          <InfoRow icon={Shield} label="User ID" value={user?.id?.slice(0, 8) + "…" ?? "—"} mono />
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <Button variant="destructive" onClick={signOut} className="w-full md:w-auto">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
    <div className={mono ? "font-mono text-sm" : "text-sm font-medium"}>{value}</div>
  </div>
);

export default Profile;
