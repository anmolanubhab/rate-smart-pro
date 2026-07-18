import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { PERMS, type BusinessRole } from "@/hooks/useBusiness";

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
  created_at: string | null;
}

export function useProfileData(userId?: string, authUser?: { last_sign_in_at?: string | null; created_at?: string | null } | null) {
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
    created_at: null,
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

        // 2. Business Membership - scoped to the currently ACTIVE business.
        // Without this, a user who belongs to more than one company (a
        // normal case now that one user can join multiple businesses)
        // would make .maybeSingle() match multiple rows and silently
        // fail, showing "No company associated" even when one is
        // clearly active elsewhere in the app.
        const activeBizId = getActiveBusinessIdSync();
        let memberQuery = supabase
          .from("business_users")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active");
        memberQuery = activeBizId ? memberQuery.eq("business_id", activeBizId) : memberQuery.limit(1);
        const { data: memberData, error: memberError } = await memberQuery.maybeSingle();

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

        // 4. Permissions - derived from the REAL role/permission matrix
        // used everywhere else in the app (useBusiness.tsx's PERMS),
        // not a separate simplified 3-tier mock. A module shows "admin"
        // if the role has "*" or an admin-ish key for it, "write" if it
        // can create/edit in that module, else "readonly".
        const roleKey = (memberData?.role ?? "viewer") as BusinessRole;
        const rolePerms = PERMS[roleKey] ?? PERMS.viewer;
        const moduleAccess = (writeKeys: string[]): Permission["access"] => {
          if (rolePerms.includes("*")) return "admin";
          if (writeKeys.some((k) => rolePerms.includes(k))) return "write";
          return "readonly";
        };
        const roleBasedPermissions: Permission[] = [
          { module: "Sales", access: moduleAccess(["voucher.create", "voucher.edit"]) },
          { module: "Purchase", access: moduleAccess(["purchase.create", "purchase.approve"]) },
          { module: "Inventory", access: moduleAccess(["data.import"]) },
          { module: "GST", access: moduleAccess(["settings.edit"]) },
          { module: "Accounts", access: moduleAccess(["voucher.create", "voucher.edit", "voucher.delete"]) },
        ];
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

        // 6. Activity - real timestamps from the auth user record.
        setActivity({
          last_login: authUser?.last_sign_in_at ?? null,
          created_at: authUser?.created_at ?? null,
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
