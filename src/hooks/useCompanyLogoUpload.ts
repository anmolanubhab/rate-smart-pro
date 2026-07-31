import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "company-logos";

// Before writing the new file, remove whatever's already in the business's
// folder (regardless of its extension) so replacing a .png with a .webp
// doesn't leave the old file orphaned in storage.
async function clearExisting(businessId: string) {
  const { data: existing } = await supabase.storage.from(BUCKET).list(businessId);
  if (existing?.length) {
    await supabase.storage.from(BUCKET).remove(existing.map((f) => `${businessId}/${f.name}`));
  }
}

export function useCompanyLogoUpload() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function uploadLogo(businessId: string, file: File): Promise<string> {
    setUploading(true);
    try {
      await clearExisting(businessId);

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${businessId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Path stays constant on re-upload, so a query-param version is what
      // actually busts the browser/CDN cache.
      const versionedUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: dbError } = await supabase.from("businesses").update({ logo_url: versionedUrl }).eq("id", businessId);
      if (dbError) throw dbError;

      await queryClient.invalidateQueries({ queryKey: ["current-business"] });
      return versionedUrl;
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo(businessId: string): Promise<void> {
    setRemoving(true);
    try {
      await clearExisting(businessId);

      const { error: dbError } = await supabase.from("businesses").update({ logo_url: null }).eq("id", businessId);
      if (dbError) throw dbError;

      await queryClient.invalidateQueries({ queryKey: ["current-business"] });
    } finally {
      setRemoving(false);
    }
  }

  return { uploadLogo, removeLogo, uploading, removing };
}
