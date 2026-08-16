import { test, expect, type Page } from "@playwright/test";

// LIVE COMPANY SWITCH — A -> B -> C -> A
//
// Exercises the real, authenticated app against three real companies that
// hold deliberately different data, so "the new company's data loaded" and
// "the old company's data is gone" are checked against concrete numbers
// rather than just a changed id:
//
//   A  AKL TRADERS AND SONS      542 parties, 1 order,  6 products
//   B  BOOTSTRAP FIX VERIFY TEST   1 party,   5 orders, 2 products
//   C  MC TEST COMPANY C            0 parties, 0 orders, 0 products
//
// Two switch paths are covered, because they fail differently:
//
//   * through the Select Company screen — the ordinary user path, which
//     unmounts whatever was open and re-enters the app fresh.
//   * through setActiveBusinessId() while an order editor is still MOUNTED —
//     the path CreateOrder's onActiveBusinessChange listener exists for.
//     This is the one that can strand a draft, keep a dirty flag alive, or
//     let a 30s autosave fire into the wrong company.
//
// Credentials: only the company-access verification dialog needs the
// password, and only when a verification session has expired. It is read
// from the environment — never hardcoded, never logged.

test.use({ storageState: "e2e/.auth/qa-user.json" });

const QA_PASSWORD = process.env.E2E_QA_PASSWORD;

const COMPANIES = {
  A: { name: "AKL TRADERS AND SONS", id: "63d6ceb0-74f6-484a-adcd-e8da0d670f98", parties: 542, orders: 1 },
  B: { name: "BOOTSTRAP FIX VERIFY TEST", id: "79abafe9-1c3a-4d05-8f77-b98fcbac01c6", parties: 1, orders: 5 },
  C: { name: "MC TEST COMPANY C", id: "f46a51cc-ab96-437f-befe-99a32ac117d4", parties: 0, orders: 0 },
} as const;

/** Switch companies the way a user does: via the Select Company screen. */
async function switchCompanyViaUi(page: Page, company: { name: string; id: string }) {
  await page.goto("/companies");

  const card = page.getByRole("button", { name: new RegExp(company.name, "i") }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  // Company Access Verification may or may not appear depending on whether an
  // unexpired verification session already exists for this company.
  const passwordField = page.locator("#cav-password");
  const needsVerification = await passwordField
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (needsVerification) {
    if (!QA_PASSWORD) throw new Error("E2E_QA_PASSWORD is not set — needed to clear Company Access Verification.");
    await passwordField.fill(QA_PASSWORD);
    await page.getByRole("dialog").getByRole("button", { name: "OK", exact: true }).click();
  }

  await page.waitForURL((url) => !url.pathname.startsWith("/companies"), { timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("rdpro.activeBusinessId")), { timeout: 10_000 })
    .toBe(company.id);
}

/** What the APP itself reports for the active company, through its own client. */
async function readScopedCounts(page: Page) {
  return page.evaluate(async () => {
    const { supabase } = await import(/* @vite-ignore */ "/src/integrations/supabase/client.ts");
    const businessId = localStorage.getItem("rdpro.activeBusinessId");
    const { count: parties } = await supabase
      .from("parties").select("id", { count: "exact", head: true }).eq("business_id", businessId);
    const { count: orders } = await supabase
      .from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_deleted", false);
    return { businessId, parties: parties ?? 0, orders: orders ?? 0 };
  });
}

test.describe("Live company switch A -> B -> C -> A", () => {
  test("each hop loads the new company's data and leaves none of the old behind", async ({ page }) => {
    for (const hop of [COMPANIES.A, COMPANIES.B, COMPANIES.C, COMPANIES.A]) {
      await switchCompanyViaUi(page, hop);

      const counts = await readScopedCounts(page);
      expect(counts.businessId, `active company must be ${hop.name}`).toBe(hop.id);
      expect(counts.parties, `${hop.name} must show its own party count`).toBe(hop.parties);
      expect(counts.orders, `${hop.name} must show its own order count`).toBe(hop.orders);

      // The Orders screen must render only rows belonging to this company.
      //
      // Note this cannot be checked by looking for another company's order
      // NUMBERS on screen: numbering is business-scoped, so ORD-20260816-0001
      // legitimately exists in more than one company and a substring match
      // reports a collision as if it were a leak. Ask the inverse question —
      // is every number displayed one of THIS company's own?
      await page.goto("/orders");
      await page.waitForTimeout(2000);
      const unexpected = await page.evaluate(async () => {
        const { supabase } = await import(/* @vite-ignore */ "/src/integrations/supabase/client.ts");
        const businessId = localStorage.getItem("rdpro.activeBusinessId");
        const { data } = await supabase
          .from("orders").select("order_number").eq("business_id", businessId).eq("is_deleted", false);
        const mine = new Set((data ?? []).map((o: { order_number: string }) => o.order_number));

        const shown = Array.from(document.querySelectorAll("table tbody tr"))
          .map((tr) => (tr.textContent ?? "").match(/ORD-\d{8}-\d{4}/)?.[0])
          .filter((n): n is string => Boolean(n));

        return { shown, notMine: shown.filter((n) => !mine.has(n)) };
      });
      expect(
        unexpected.notMine,
        `${hop.name}: order numbers on screen that do not belong to this company`
      ).toEqual([]);
    }
  });

  test("switching with an order editor open clears the draft, dirty flag and editor", async ({ page }) => {
    await switchCompanyViaUi(page, COMPANIES.B);

    await page.goto("/orders/new");
    await page.getByPlaceholder(/search party/i).fill("E2E_PRICING_PARTY");
    await expect(page.getByText("Current Balance")).toBeVisible({ timeout: 15_000 });

    // Make the form genuinely dirty — this is what arms the autosave.
    await page.locator('[data-col="part"]').first().click();
    await page.locator('[data-col="part"]').first().fill("E2E_PRICING_PRODUCT");
    await page.getByRole("button", { name: /E2E_PRICING_PRODUCT/i }).first().click();
    await expect(page.locator('[data-col="mrp"]').first()).not.toHaveValue("", { timeout: 15_000 });

    const beforeOrderCount = (await readScopedCounts(page)).orders;

    // Switch companies with the editor STILL MOUNTED — the case
    // CreateOrder's onActiveBusinessChange listener exists to handle. This is
    // exactly what the app's own switcher does internally.
    await page.evaluate(async (targetId: string) => {
      const mod = await import(/* @vite-ignore */ "/src/hooks/useBusiness.tsx");
      mod.setActiveBusinessId(targetId);
    }, COMPANIES.C.id);

    // The editor must be torn down, not left open over the new company.
    await page.waitForURL(/\/orders(?!\/new)/, { timeout: 15_000 });
    expect(page.url()).not.toContain("/orders/new");

    // And the company actually changed.
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("rdpro.activeBusinessId")), { timeout: 10_000 })
      .toBe(COMPANIES.C.id);

    // No stale mutation: the abandoned draft must not have been written into
    // EITHER company. B's order count is unchanged and C gained nothing.
    const cCounts = await readScopedCounts(page);
    expect(cCounts.orders, "the abandoned draft must not appear in company C").toBe(COMPANIES.C.orders);

    await switchCompanyViaUi(page, COMPANIES.B);
    const bCounts = await readScopedCounts(page);
    expect(bCounts.orders, "the abandoned draft must not have been saved into company B either").toBe(beforeOrderCount);
  });

  test("no autosave fires into either company after the switch", async ({ page }) => {
    await switchCompanyViaUi(page, COMPANIES.B);

    await page.goto("/orders/new");
    await page.getByPlaceholder(/search party/i).fill("E2E_PRICING_PARTY");
    await expect(page.getByText("Current Balance")).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-col="part"]').first().click();
    await page.locator('[data-col="part"]').first().fill("E2E_PRICING_PRODUCT");
    await page.getByRole("button", { name: /E2E_PRICING_PRODUCT/i }).first().click();
    await expect(page.locator('[data-col="mrp"]').first()).not.toHaveValue("", { timeout: 15_000 });

    const bBefore = (await readScopedCounts(page)).orders;

    await page.evaluate(async (targetId: string) => {
      const mod = await import(/* @vite-ignore */ "/src/hooks/useBusiness.tsx");
      mod.setActiveBusinessId(targetId);
    }, COMPANIES.A.id);

    // The autosave interval is 30s. Sit past a full tick with the company
    // switched underneath the (now torn-down) editor and confirm nothing was
    // written anywhere — the pre-fix behaviour rewrote the order it had open.
    await page.waitForTimeout(35_000);

    const aCounts = await readScopedCounts(page);
    expect(aCounts.orders, "autosave must not write a stray order into company A").toBe(COMPANIES.A.orders);

    await switchCompanyViaUi(page, COMPANIES.B);
    const bAfter = (await readScopedCounts(page)).orders;
    expect(bAfter, "autosave must not write into company B after the switch either").toBe(bBefore);
  });
});
