import { test as setup, expect } from "@playwright/test";

// One-time login that saves an authenticated session to
// e2e/.auth/qa-user.json for every other spec to reuse via
// `test.use({ storageState: "e2e/.auth/qa-user.json" })`.
//
// Run this yourself, outside of any AI-assisted session:
//   E2E_QA_EMAIL=... E2E_QA_PASSWORD=... npx playwright test e2e/auth.setup.ts
//
// Credentials come only from your own shell environment — never commit
// them, never paste them into a prompt to an AI agent, and never let an
// agent type them into this form on your behalf. See e2e/README.md.

const QA_EMAIL = process.env.E2E_QA_EMAIL;
const QA_PASSWORD = process.env.E2E_QA_PASSWORD;

setup("authenticate as QA user", async ({ page }) => {
  if (!QA_EMAIL || !QA_PASSWORD) {
    throw new Error(
      "E2E_QA_EMAIL / E2E_QA_PASSWORD are not set. Run this setup script yourself with a dedicated QA account's credentials in your own shell environment — see e2e/README.md."
    );
  }

  await page.goto("/auth");
  await page.locator("#login-email").fill(QA_EMAIL);
  await page.locator("#login-password").fill(QA_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Successful login redirects off /auth (to /companies or a business dashboard).
  await expect(page).not.toHaveURL(/\/auth$/, { timeout: 15_000 });

  await page.context().storageState({ path: "e2e/.auth/qa-user.json" });
});
