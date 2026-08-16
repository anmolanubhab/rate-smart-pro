// Shared password-strength rules — single source of truth for both the
// Signup form (src/pages/Auth.tsx) and the password-reset form
// (src/pages/ResetPassword.tsx), so the two flows can never silently drift
// apart on what counts as a strong-enough password.

export const passwordRules = [
  { label: "8 characters", test: (value: string) => value.length >= 8 },
  { label: "1 uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { label: "1 lowercase", test: (value: string) => /[a-z]/.test(value) },
  { label: "1 number", test: (value: string) => /\d/.test(value) },
  { label: "1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export const isStrongPassword = (value: string) => passwordRules.every((rule) => rule.test(value));
