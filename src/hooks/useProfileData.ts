import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  full_name: string;
  mobile: string;
  avatar_url?: string;
  theme?: string;
  language?: string;
  date_format?: string;
  currency?: string;
}

export interface Business {
  id: string;
  name: string;
  legal_type: string;
  financial_year_start: string;
  financial_year_end: string;
}

export interface Membership {
  business_id: string;
  role: string;
  status: string;
}

export interface Permission {
  module: string;
  access: "readonly" | "write" | "admin";
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  language: string;
  date_format: string;
  currency: string;
}

export interface Activity {
  last_login: string | null;
}

export function useProfileData(userId?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  
  // Additional states
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    theme: "light",
    language: "English",
    date_format: "DD/MM/YYYY",
    currency: "INR",
  });
  const [activity, setActivity] = useState<Activity>({
    last_login: null,
  });

  useEffect(() => {
    if (!userId) {
      console.log("❌ No userId provided to useProfileData");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log("🔍 Loading profile data for userId:", userId);

        // 1. Profile - Using maybeSingle() to avoid 406 errors
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        if (profileError) {
          console.warn("⚠️ Profile query error:", profileError.message);
        } else if (profileData) {
          console.log("✅ Profile found:", profileData);
          setProfile(profileData);
        } else {
          console.log("ℹ️ No profile found for user");
          // Create default profile data for display
          setProfile({
            full_name: "",
            mobile: "",
            language: "English",
          });
        }

        // 2. Business Membership - Using maybeSingle()
        const { data: memberData, error: memberError } = await supabase
          .from("business_users")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();

        if (memberError) {
          console.warn("⚠️ Membership query error:", memberError.message);
        } else if (memberData) {
          console.log("✅ Membership found:", memberData);
          setMembership(memberData);
        } else {
          console.log("ℹ️ No active membership found for user");
        }

        // 3. Business - Only query if we have a business_id
        if (memberData?.business_id) {
          const { data: businessData, error: businessError } = await supabase
            .from("businesses")
            .select("*")
            .eq("id", memberData.business_id)
            .maybeSingle();

          if (businessError) {
            console.warn("⚠️ Business query error:", businessError.message);
          } else if (businessData) {
            console.log("✅ Business found:", businessData);
            setBusiness(businessData);
          } else {
            console.log("ℹ️ No business found for ID:", memberData.business_id);
          }
        } else {
          console.log("ℹ️ No business_id in membership");
        }

        // 4. Permissions - based on role (or default)
        const roleBasedPermissions: Permission[] = getPermissionsForRole(memberData?.role);
        setPermissions(roleBasedPermissions);
        console.log("🔐 Permissions set based on role:", memberData?.role || "default");

        // 5. Preferences - from profile if available
        if (profileData) {
          setPreferences({
            theme: "light",
            language: profileData.language || "English",
            date_format: "DD/MM/YYYY",
            currency: "INR",
          });
        } else {
          // Keep default preferences
          console.log("ℹ️ Using default preferences");
        }

        // 6. Activity - Set to null for now
        setActivity({
          last_login: null,
        });

        console.log("✅ Profile data loading complete");

      } catch (err) {
        console.error("❌ Error in useProfileData:", err);
        // Don't set error - we want the page to render even if data is missing
        // setError(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  // Helper function to determine permissions based on role
  function getPermissionsForRole(role?: string): Permission[] {
    const viewerPermissions: Permission[] = [
      { module: "Sales", access: "readonly" },
      { module: "Purchase", access: "readonly" },
      { module: "Inventory", access: "readonly" },
      { module: "GST", access: "readonly" },
      { module: "Accounts", access: "readonly" },
    ];

    const managerPermissions: Permission[] = [
      { module: "Sales", access: "write" },
      { module: "Purchase", access: "write" },
      { module: "Inventory", access: "write" },
      { module: "GST", access: "readonly" },
      { module: "Accounts", access: "write" },
    ];

    const ownerPermissions: Permission[] = [
      { module: "Sales", access: "admin" },
      { module: "Purchase", access: "admin" },
      { module: "Inventory", access: "admin" },
      { module: "GST", access: "admin" },
      { module: "Accounts", access: "admin" },
    ];

    switch (role?.toLowerCase()) {
      case "owner":
      case "admin":
        return ownerPermissions;
      case "manager":
      case "sales manager":
        return managerPermissions;
      default:
        return viewerPermissions;
    }
  }

  return {
    loading,
    error,
    profile,
    membership,
    business,
    role: membership?.role ?? "Viewer",
    permissions,
    preferences,
    activity,
  };
}
