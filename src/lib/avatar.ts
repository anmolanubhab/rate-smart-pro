// Shared avatar resolution logic used by the navbar, profile page, and any
// future team-member views so the priority order never drifts between them:
//   1. uploaded photo (profiles.avatar_url)
//   2. Google profile photo (user_metadata.avatar_url / .picture)
//   3. initials fallback

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type UserMetadataLike = { user_metadata?: Record<string, unknown> | null } | null | undefined;

export function resolveAvatarSrc(opts: { avatarUrl?: string | null; user?: UserMetadataLike }): string | null {
  if (opts.avatarUrl) return opts.avatarUrl;

  const meta = opts.user?.user_metadata;
  const google = (meta?.avatar_url as string | undefined) || (meta?.picture as string | undefined);
  return typeof google === "string" && google.length > 0 ? google : null;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])) {
    return "Please choose a JPG, PNG, or WEBP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}
