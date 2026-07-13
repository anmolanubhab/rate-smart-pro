import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  full_name: string;
  mobile: string;
  avatar_url?: string;
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
  created_at?: string;
  last_password_change?: string | null;
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
    if (!userId) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData);

        // 2. Business Membership
        const { data: memberData, error: memberError } = await supabase
          .from("business_users")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .single();

        if (memberError && memberError.code !== "PGRST116") throw memberError;
        setMembership(memberData);

        // 3. Business
        if (memberData?.business_id) {
          const { data: businessData, error: businessError } = await supabase
            .from("businesses")
            .select("*")
            .eq("id", memberData.business_id)
            .single();

          if (businessError) throw businessError;
          setBusiness(businessData);
        }

        // 4. Permissions - based on role
        // You can fetch from roles_permissions table or define logic based on role
        const roleBasedPermissions: Permission[] = getPermissionsForRole(memberData?.role);
        setPermissions(roleBasedPermissions);

        // 5. Preferences - from profile or separate table
        if (profileData) {
          setPreferences({
            theme: profileData.theme || "light",
            language: profileData.language || "English",
            date_format: profileData.date_format || "DD/MM/YYYY",
            currency: profileData.currency || "INR",
          });
        }

        // 6. Activity - from auth.users
        const { data: userData, error: userError } = await supabase
          .from("auth.users")
          .select("last_sign_in_at, created_at, updated_at")
          .eq("id", userId)
          .single();

        if (!userError && userData) {
          setActivity({
            last_login: userData.last_sign_in_at || null,
            created_at: userData.created_at,
            last_password_change: userData.updated_at || null,
          });
        }

      } catch (err) {
        console.error("Error loading profile data:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  // Helper function to determine permissions based on role
  function getPermissionsForRole(role?: string): Permission[] {
    // Default permissions for Viewer
    const viewerPermissions: Permission[] = [
      { module: "Sales", access: "readonly" },
      { module: "Purchase", access: "readonly" },
      { module: "Inventory", access: "readonly" },
      { module: "GST", access: "readonly" },
      { module: "Accounts", access: "readonly" },
    ];

    // Enhanced permissions for Manager
    const managerPermissions: Permission[] = [
      { module: "Sales", access: "write" },
      { module: "Purchase", access: "write" },
      { module: "Inventory", access: "write" },
      { module: "GST", access: "readonly" },
      { module: "Accounts", access: "write" },
    ];

    // Full permissions for Owner/Admin
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
