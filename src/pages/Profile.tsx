import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileData } from "@/hooks/useProfileData";
import {
  ProfileHeader,
  PersonalInfoCard,
  CompanyCard,
  SecurityCard,
  PermissionCard,
  PreferenceCard,
  ActivityCard,
} from "@/components/profile";

const Profile = () => {
  const { user } = useAuth();
  const { profile, business, role, permissions, preferences, activity, isLoading, error } =
    useProfileData(user?.id);

  useEffect(() => {
    document.title = "Profile — RD Calculator Pro";
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 animate-pulse space-y-6">
        <div className="h-12 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-48 bg-muted rounded-2xl" />
            <div className="h-64 bg-muted rounded-2xl" />
            <div className="h-56 bg-muted rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="h-56 bg-muted rounded-2xl" />
            <div className="h-48 bg-muted rounded-2xl" />
            <div className="h-40 bg-muted rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-center text-destructive">
        <p>Unable to load profile data. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in-up">
      <ProfileHeader user={user} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Personal info + Company */}
        <div className="lg:col-span-2 space-y-6">
          <PersonalInfoCard profile={profile} user={user} />
          <CompanyCard business={business} role={role} />
          <PermissionCard permissions={permissions} />
        </div>

        {/* Right column: Security, Preferences, Activity */}
        <div className="space-y-6">
          <SecurityCard user={user} />
          <PreferenceCard preferences={preferences} />
          <ActivityCard activity={activity} />
        </div>
      </div>
    </div>
  );
};

export default Profile;
