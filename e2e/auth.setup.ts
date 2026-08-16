import { test as setup, expect } from "@playwright/test";

// One-time login + company selection that saves an authenticated,
// business-scoped session to e2e/.auth/qa-user.json for every other spec
// to reuse via `test.use({ storageState: "e2e/.auth/qa-user.json" })`.
//
// Run this yourself, outside of any AI-assisted session:
//   E2E_QA_EMAIL=... E2E_QA_PASSWORD=... E2E_QA_BUSINESS_NAME=... \
//     npx playwright test --project=setup
//
// Credentials come only from your own shell environment — never commit
// them, never paste them into a prompt to an AI agent, and never let an
// agent type them into this form on your behalf. See e2e/README.md.
//
// The actual flow, traced from source (src/pages/Auth.tsx, src/pages/Index.tsx,
// src/pages/companies/CompanySelection.tsx):
//   1. POST credentials via supabase.auth.signInWithPassword() inside handleLogin.
//      On failure it toasts an error and stays on /auth — it never navigates
//      itself either way; there is no synchronous "login succeeded" signal.
//   2. Success is only visible reactively: useAuth()'s onAuthStateChange
//      listener updates `user`, which makes Auth.tsx render <Navigate to="/" />.
//   3. Index.tsx (the "/" route) redirects any authenticated user to
//      /companies — that is the real "post-login" destination, not a
//      business dashboard.
//   4. /companies (CompanySelection.tsx) still requires picking a specific
//      company: openCompany() sets localStorage["rdpro.activeBusinessId"]
//      and navigates to that role's landing page. Nothing is scoped to a
//      business until this click happens.
// So a genuinely-ready session needs: login succeeded (no error toast) +
// left /auth + a specific QA company selected + both the Supabase auth
// token and the active-business id are actually present in localStorage.

const QA_EMAIL = process.env.E2E_QA_EMAIL;
const QA_PASSWORD = process.env.E2E_QA_PASSWORD;
const QA_BUSINESS_NAME = process.env.E2E_QA_BUSINESS_NAME;

setup("authenticate as QA user and select the QA business", async ({ page }) => {
  if (!QA_EMAIL || !QA_PASSWORD) {
    throw new Error(
      "E2E_QA_EMAIL / E2E_QA_PASSWORD are not set. Run this setup script yourself with a dedicated QA account's credentials in your own shell environment — see e2e/README.md."
    );
  }
  if (!QA_BUSINESS_NAME) {
    throw new Error(
      "E2E_QA_BUSINESS_NAME is not set. This must name a dedicated QA company (never a real customer business) that the QA account has access to — see e2e/README.md."
    );
  }

  await page.goto("/auth");
  await page.locator("#login-email").fill(QA_EMAIL);
  await page.locator("#login-password").fill(QA_PASSWORD);
  const loginForm = page.locator("form", { has: page.locator("#login-password") });
  await loginForm.getByRole("button", { name: "Login", exact: true }).click();

  // handleLogin toasts unconditionally on both outcomes (sonner, rendered
  // with a [data-sonner-toast] attribute per toast) — so instead of racing
  // a URL change against a blind timeout, wait for the concrete signal the
  // app itself produces and branch on it.
  const anyToast = page.locator("[data-sonner-toast]").first();
  await expect(anyToast).toBeVisible({ timeout: 15_000 });
  const toastType = await anyToast.getAttribute("data-type");
  const toastText = (await anyToast.textContent())?.trim() ?? "";

  if (toastType === "error" || /fail|invalid|error|incorrect/i.test(toastText)) {
    throw new Error(`QA authentication failed — verify E2E_QA_EMAIL/E2E_QA_PASSWORD. App said: "${toastText}"`);
  }

  // Login succeeded. Index.tsx ("/") redirects an authenticated user to
  // /companies — wait for that specific, real destination, not just "left /auth".
  await page.waitForURL(/\/companies/, { timeout: 15_000 });

  // Select the dedicated QA business. The company card's clickable button's
  // accessible name is its business_name text (see CompanySelection.tsx
  // line ~284-291) — matched as a substring since the button also contains
  // the business_type line.
  const companyButton = page.getByRole("button", { name: new RegExp(QA_BUSINESS_NAME, "i") }).first();
  await expect(companyButton, `QA business "${QA_BUSINESS_NAME}" was not found on the Select Company screen — does this QA account actually have access to it?`).toBeVisible({
    timeout: 15_000,
  });
  await companyButton.click();

  // Opening a company is gated by Company Access Verification
  // (src/components/company/CompanyAccessVerification.tsx, backed by the
  // company_access_verification_sessions table). The dialog re-confirms the
  // account password before setActiveBusinessId() runs, so without clearing
  // it the session never becomes business-scoped and every downstream spec
  // would run unscoped. It is not always shown — an unexpired verification
  // session for this company skips straight to navigation — so this races
  // the dialog against the navigation rather than assuming either.
  const verifyDialog = page.getByRole("dialog").filter({ hasText: "Verify Company Access" });
  const passwordField = page.locator("#cav-password");
  const leftCompanies = page.waitForURL(
    (url) => !url.pathname.startsWith("/companies") && !url.pathname.startsWith("/auth"),
    { timeout: 20_000 }
  );

  const needsVerification = await passwordField
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (needsVerification) {
    await passwordField.fill(QA_PASSWORD);
    await verifyDialog.getByRole("button", { name: "OK", exact: true }).click();

    // A wrong password re-renders the dialog with an inline error instead of
    // navigating; surface that as a credentials problem rather than letting
    // it time out as a mystery navigation failure.
    const inlineError = verifyDialog.locator("p.text-destructive");
    const failed = await inlineError
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (failed) {
      throw new Error(
        `Company Access Verification rejected the password — verify E2E_QA_PASSWORD. App said: "${(await inlineError.textContent())?.trim()}"`
      );
    }
  }

  // openCompany() navigates to the role's landing page once
  // setActiveBusinessId() has run — wait for that navigation, not a timeout.
  await leftCompanies;

  // Concrete proof of a genuinely authenticated, business-scoped session —
  // not "the login button was clicked and nothing crashed". supabase-js v2's
  // default localStorage key is sb-<project-ref>-auth-token; matched
  // generically so this doesn't hardcode a project ref.
  const storageCheck = await page.evaluate(() => ({
    hasAuthToken: Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
    activeBusinessId: localStorage.getItem("rdpro.activeBusinessId"),
  }));
  expect(storageCheck.hasAuthToken, "No Supabase auth token found in localStorage after login — session did not actually persist.").toBe(true);
  expect(storageCheck.activeBusinessId, "rdpro.activeBusinessId was not set — company selection did not actually complete.").not.toBeNull();

  await page.context().storageState({ path: "e2e/.auth/qa-user.json" });
});
