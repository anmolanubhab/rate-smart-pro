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
        console.log("🔍 userId type:", typeof userId);
        console.log("🔍 userId length:", userId?.length);

        // 1. Profile - Using maybeSingle() to avoid 406 errors
        console.log("📡 Querying profiles table...");
        const { data: profileData, error: profileError, status, statusText } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        console.log("📋 PROFILE - Data:", profileData);
        console.log("📋 PROFILE - Error:", profileError);
        console.log("📋 PROFILE - Status:", status, statusText);

        if (profileError) {
          console.error("❌ Profile error details:", {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
            hint: profileError.hint,
          });
          // Don't throw - allow profile to be null
        } else {
          setProfile(profileData);
        }

        // 2. Business Membership - Using maybeSingle()
        console.log("📡 Querying business_users table...");
        const { data: memberData, error: memberError, status: memberStatus, statusText: memberStatusText } = await supabase
          .from("business_users")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();

        console.log("👥 MEMBERSHIP - Data:", memberData);
        console.log("👥 MEMBERSHIP - Error:", memberError);
        console.log("👥 MEMBERSHIP - Status:", memberStatus, memberStatusText);

        if (memberError && memberError.code !== "PGRST116") {
          console.error("❌ Membership error details:", {
            message: memberError.message,
            code: memberError.code,
            details: memberError.details,
            hint: memberError.hint,
          });
        } else if (!memberError) {
          setMembership(memberData);
        }

        // 3. Business - Using maybeSingle()
        if (memberData?.business_id) {
          console.log("📡 Querying businesses table with business_id:", memberData.business_id);
          const { data: businessData, error: businessError, status: bizStatus, statusText: bizStatusText } = await supabase
            .from("businesses")
            .select("*")
            .eq("id", memberData.business_id)
            .maybeSingle();

          console.log("🏢 BUSINESS - Data:", businessData);
          console.log("🏢 BUSINESS - Error:", businessError);
          console.log("🏢 BUSINESS - Status:", bizStatus, bizStatusText);

          if (businessError) {
            console.error("❌ Business error details:", {
              message: businessError.message,
              code: businessError.code,
              details: businessError.details,
              hint: businessError.hint,
            });
          } else {
            setBusiness(businessData);
          }
        } else {
          console.log("ℹ️ No business_id found in membership");
          setBusiness(null);
        }

        // 4. Permissions - based on role
        const roleBasedPermissions: Permission[] = getPermissionsForRole(memberData?.role);
        setPermissions(roleBasedPermissions);
        console.log("🔐 Permissions set:", roleBasedPermissions);

        // 5. Preferences - from profile
        if (profileData) {
          setPreferences({
            theme: "light",
            language: profileData.language || "English",
            date_format: "DD/MM/YYYY",
            currency: "INR",
          });
          console.log("⚙️ Preferences set:", {
            theme: "light",
            language: profileData.language || "English",
            date_format: "DD/MM/YYYY",
            currency: "INR",
          });
        } else {
          console.log("ℹ️ No profile data - using default preferences");
        }

        // 6. Activity - TEMPORARY: Set to null
        setActivity({
          last_login: null,
        });

        console.log("✅ Profile data loading complete");
        console.log("📊 Final state:", {
          hasProfile: !!profileData,
          hasMembership: !!memberData,
          hasBusiness: !!business,
          role: memberData?.role || "Viewer",
          permissionsCount: roleBasedPermissions.length,
        });

      } catch (err) {
        console.error("❌ Unhandled error in useProfileData:", err);
        console.error("❌ Error stack:", err instanceof Error ? err.stack : "No stack available");
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
