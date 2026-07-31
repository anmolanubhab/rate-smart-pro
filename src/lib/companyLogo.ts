// Shared validation for the company logo upload feature (mirrors lib/avatar.ts's
// pattern for the personal profile photo, so both features enforce the same
// kind of limits with the same shape of error message).

export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const COMPANY_LOGO_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateCompanyLogoFile(file: File): string | null {
  if (!COMPANY_LOGO_ALLOWED_MIME_TYPES.includes(file.type as (typeof COMPANY_LOGO_ALLOWED_MIME_TYPES)[number])) {
    return "Please choose a PNG, JPG, or WEBP image.";
  }
  if (file.size > COMPANY_LOGO_MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}
