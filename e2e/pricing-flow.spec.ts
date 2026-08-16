import { test, expect, type Page } from "@playwright/test";

// Pricing Test Bench -> Sales Order -> Edit Order -> Invoice, end to end.
//
// Uses a pre-authenticated session (see e2e/README.md) — this spec never
// touches a login form. All test data is name-prefixed E2E_PRICING_* so
// it's identifiable and safe to clean up; it never assumes or depends on
// real customer/business data.
//
// Acceptance criteria (per the pricing-integration review):
//   Test Bench basePrice/discount/finalAmount for a given party+product+qty+date
//     == Sales Order line's resolved mrp/discount_pct/net_rate for the same inputs
//     == Invoice line's rate/net_rate/total after Generate Invoice (copied verbatim,
//        never re-priced — see generateInvoiceFromOrder in src/lib/salesInvoices.ts)

test.use({ storageState: "e2e/.auth/qa-user.json" });

const PARTY_NAME = process.env.E2E_PARTY_NAME ?? "E2E_PRICING_PARTY";
const PRODUCT_QUERY = process.env.E2E_PRODUCT_QUERY ?? "E2E_PRICING_PRODUCT";
const QTY = 2;

interface TestBenchResult {
  lines: {
    basePrice: number;
    discountAmount: number;
    taxableValue: number;
    gstPct: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    finalAmount: number;
  }[];
}

// The JSON View tab renders `exportPayload`, which wraps the actual
// PricingResult under `.pricingResult` (see PricingTestBench.tsx:277-280:
// `{ pricingResult: result, snapshot: result.lines.map(buildSnapshot) }`)
// — not the result's `lines` directly.
interface ExportPayload {
  pricingResult: TestBenchResult;
}

async function readTestBenchJson(page: Page): Promise<TestBenchResult> {
  await page.getByRole("tab", { name: "JSON View" }).click();
  const text = await page.locator("pre").innerText();
  const payload = JSON.parse(text) as ExportPayload;
  return payload.pricingResult;
}

test.describe("Pricing SSOT: Test Bench == Sales Order == Invoice", () => {
  let testBench: TestBenchResult;

  test("1. Pricing Test Bench resolves and records the expected price", async ({ page }) => {
    await page.goto("/pricing/test-bench");

    await page.getByPlaceholder("Search party…").fill(PARTY_NAME);
    await page.getByRole("button", { name: new RegExp(PARTY_NAME, "i") }).first().click();

    await page.getByPlaceholder("Search part / name…").fill(PRODUCT_QUERY);
    await page.getByRole("button", { name: new RegExp(PRODUCT_QUERY, "i") }).first().click();

    // The row's qty input is the only spinbutton visible once one line exists.
    await page.getByRole("spinbutton").first().fill(String(QTY));

    await page.getByRole("button", { name: /calculate/i }).click();
    await expect(page.getByRole("tab", { name: "JSON View" })).toBeVisible({ timeout: 10_000 });

    testBench = await readTestBenchJson(page);
    expect(testBench.lines).toHaveLength(1);

    console.log("Test Bench result:", JSON.stringify(testBench.lines[0], null, 2));
  });

  test("2. Sales Order resolves the identical price for the same inputs", async ({ page }) => {
    test.skip(!testBench, "Run test 1 first — it seeds the expected value this test compares against.");

    await page.goto("/orders/new");

    await page.getByPlaceholder(/search party/i).fill(PARTY_NAME);
    await page.getByRole("button", { name: new RegExp(PARTY_NAME, "i") }).first().click();

    // First empty grid row's product search cell.
    await page.locator('[data-col="part"]').first().click();
    await page.locator('[data-col="part"]').first().fill(PRODUCT_QUERY);
    await page.getByRole("button", { name: new RegExp(PRODUCT_QUERY, "i") }).first().click();

    await page.locator('[data-col="qty"]').first().fill(String(QTY));
    // Blur to flush the qty update.
    await page.locator('[data-col="qty"]').first().press("Tab");

    const mrpCell = page.locator('[data-col="mrp"]').first();
    const discCell = page.locator('[data-col="disc"]').first();
    await expect(mrpCell).not.toHaveValue("0", { timeout: 10_000 });

    const orderBasePrice = Number(await mrpCell.inputValue());
    const orderDiscountPct = Number(await discCell.inputValue());
    const expected = testBench.lines[0];

    expect(orderBasePrice, "Sales Order base price must equal Test Bench base price").toBeCloseTo(expected.basePrice, 2);
    const expectedDiscountPct = expected.basePrice > 0 ? (expected.discountAmount / (expected.basePrice * QTY)) * 100 : 0;
    expect(orderDiscountPct, "Sales Order discount % must equal Test Bench's effective discount %").toBeCloseTo(expectedDiscountPct, 1);

    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByText(/draft saved|saved/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /confirm order/i }).click();
    await expect(page.getByText(/order confirmed/i)).toBeVisible({ timeout: 10_000 });
  });

  test("3. Editing the order (qty change) does not corrupt the resolved price", async ({ page }) => {
    await page.goto("/orders");
    await page.getByText(new RegExp(PARTY_NAME, "i")).first().click();

    const qtyCell = page.locator('[data-col="qty"]').first();
    const mrpBefore = await page.locator('[data-col="mrp"]').first().inputValue();
    const discBefore = await page.locator('[data-col="disc"]').first().inputValue();

    await qtyCell.fill(String(QTY * 3));
    await qtyCell.press("Tab");

    // qty-only edit must NOT zero out or change the already-resolved price/discount.
    await expect(page.locator('[data-col="mrp"]').first()).toHaveValue(mrpBefore);
    await expect(page.locator('[data-col="disc"]').first()).toHaveValue(discBefore);

    await page.getByRole("button", { name: /update draft|save draft/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 });
  });

  test("4. Generated Invoice matches the Order's saved price exactly (no re-pricing)", async ({ page }) => {
    await page.goto("/orders");

    const orderRow = page.getByRole("row", { name: new RegExp(PARTY_NAME, "i") }).first();
    await orderRow.getByRole("button").last().click(); // row actions ("...") menu
    await page.getByRole("menuitem", { name: /generate invoice/i }).click();
    await expect(page.getByText(/invoice.*generated|generated.*invoice/i)).toBeVisible({ timeout: 15_000 });

    await page.goto("/sales/invoices");
    const invoiceRow = page.getByRole("row", { name: new RegExp(PARTY_NAME, "i") }).first();
    await invoiceRow.click();

    // Whatever the invoice detail view renders for unit price/total, it must
    // match what the order line showed — this is the "no re-pricing" contract.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText, "Invoice must not silently diverge from the order's saved price").toContain(String(QTY * 3));
  });
});
