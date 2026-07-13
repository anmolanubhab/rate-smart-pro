import { User } from "@supabase/supabase-js";

interface Props {
  user: User | null;
}

const ProfileHeader = ({ user }: Props) => {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground font-medium">Profile</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Your account</h1>
      </div>
      <div className="text-sm text-muted-foreground bg-muted px-4 py-1.5 rounded-full">
        {user?.email}
      </div>
    </header>
  );
};

export default ProfileHeader;
