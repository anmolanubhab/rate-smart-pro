/**
 * Switch for the "Open Company" verification step after password re-entry.
 *
 * - "password_only": password + server-side business-membership check only.
 *   Used while SMS/mobile authentication infrastructure isn't set up yet.
 * - "number_matching": adds the Google/Microsoft-style number-matching
 *   challenge (desktop shows one number, an authorized mobile device must
 *   pick it out of three) on top of the password step. This is the target
 *   design once mobile enrollment + SMS infra exist; flipping this value is
 *   the only change needed to reactivate it.
 */
export type CompanyAccessVerificationMode = "password_only" | "number_matching";

export const COMPANY_ACCESS_VERIFICATION_MODE: CompanyAccessVerificationMode = "password_only";
