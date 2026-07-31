import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "profile-images";

function avatarPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export function useAvatarUpload() {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
    setUploading(true);
    try {
      const path = avatarPath(userId);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Path/filename stay constant on every re-upload, so a query-param
      // version is what actually busts the browser/CDN cache.
      const versionedUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: dbError } = await supabase
        .from("profiles")
        .upsert({ id: userId, avatar_url: versionedUrl }, { onConflict: "id" });
      if (dbError) throw dbError;

      return versionedUrl;
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar(userId: string): Promise<void> {
    setRemoving(true);
    try {
      const path = avatarPath(userId);

      const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      if (dbError) throw dbError;
    } finally {
      setRemoving(false);
    }
  }

  return { uploadAvatar, removeAvatar, uploading, removing };
}
