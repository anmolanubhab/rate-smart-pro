import { defineConfig, devices } from "@playwright/test";

// RD-Pro E2E config. Auth is handled entirely via a pre-authenticated
// storageState file (e2e/.auth/qa-user.json) — no test in this suite ever
// fills a login form or holds a QA account password. See e2e/README.md for
// how that file is produced.

export default defineConfig({
  testDir: "./e2e",
  // Playwright's default file matching only picks up *.spec.ts/*.test.ts —
  // auth.setup.ts needs an explicit opt-in, and the chromium project below
  // excludes it so `npm run test:e2e` never tries to log in on its own.
  testMatch: ["**/*.spec.ts", "**/*.setup.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // Not a dependency of "chromium" on purpose — re-authenticating on
      // every `npm run test:e2e` would mean the QA password has to be in
      // the environment every run. Run it explicitly, once, yourself:
      //   npx playwright test --project=setup
      name: "setup",
      testMatch: "**/*.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: "**/*.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
