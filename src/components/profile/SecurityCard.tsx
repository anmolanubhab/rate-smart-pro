import { User } from "@supabase/supabase-js";
import { Shield, Key, Lock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  user: User | null;
}

const SecurityCard = ({ user }: Props) => {
  const { signOut } = useAuth();

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Shield className="h-4 w-4" /> Security
      </div>

      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start gap-2">
          <Key className="h-4 w-4" /> Change Password
        </Button>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Lock className="h-4 w-4" /> Two-Factor Authentication
        </Button>
        <Button
          variant="destructive"
          className="w-full justify-start gap-2"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>

      {user?.last_sign_in_at && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Last login: {new Date(user.last_sign_in_at).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default SecurityCard;
