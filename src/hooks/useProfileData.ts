import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useProfileData(userId?: string) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [business, setBusiness] = useState(null);
  const [membership, setMembership] = useState(null);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);

      // Profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      setProfile(profileData);

      // Business Membership
      const { data: memberData } = await supabase
        .from("business_users")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      setMembership(memberData);

      // Business
      if (memberData?.business_id) {
        const { data: businessData } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", memberData.business_id)
          .single();

        setBusiness(businessData);
      }

      setLoading(false);
    };

    load();
  }, [userId]);

  return {
    loading,
    profile,
    membership,
    business,
  };
}
