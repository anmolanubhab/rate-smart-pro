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

// Must match e2e/pricing.fixtures.ts — that fixture is what makes these
// numbers deterministic instead of "whatever the party's discount happens
// to be today".
const PRICE_LIST_RATE = 145;
const EXPECTED_TAXABLE = PRICE_LIST_RATE * QTY; // 290.00
const EXPECTED_GST = +(EXPECTED_TAXABLE * 0.18).toFixed(2); // 52.20
const EXPECTED_TOTAL = +(EXPECTED_TAXABLE + EXPECTED_GST).toFixed(2); // 342.20

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

    // Exact business values, not "a number came back". The fixture pins the
    // whole chain: price list @145 assigned to the party, product at 18% GST.
    const line = testBench.lines[0];
    expect(line.basePrice, "base price must come from the fixture price list").toBeCloseTo(PRICE_LIST_RATE, 2);
    expect(line.discountAmount, "a resolved Price List outranks the party's legacy RD discount — they never stack").toBeCloseTo(0, 2);
    expect(line.gstPct).toBeCloseTo(18, 2);
    expect(line.taxableValue).toBeCloseTo(PRICE_LIST_RATE * QTY, 2);
    expect(line.cgstAmount + line.sgstAmount + line.igstAmount).toBeCloseTo(EXPECTED_GST, 2);
    expect(line.finalAmount).toBeCloseTo(EXPECTED_TOTAL, 2);

    console.log("Test Bench result:", JSON.stringify(line, null, 2));
  });

  test("2. Sales Order resolves the identical price for the same inputs", async ({ page }) => {
    test.skip(!testBench, "Run test 1 first — it seeds the expected value this test compares against.");

    await page.goto("/orders/new");

    // Unlike the Test Bench's party field, CreateOrder.tsx auto-selects on
    // an exact name match (checkExactPartyMatch, called from onQueryChange)
    // and deliberately hides the dropdown once selected (partResults
    // returns [] when the query already equals the selected party's name —
    // see CreateOrder.tsx's partResults useMemo). fill() sets the whole
    // string in one synthetic event, so the exact match — and the
    // auto-select — happens immediately; there is no dropdown button to
    // click. "Current Balance" only renders once a party is selected
    // (`{party && (...)}`), so that's the real, observable confirmation.
    await page.getByPlaceholder(/search party/i).fill(PARTY_NAME);
    await expect(page.getByText("Current Balance")).toBeVisible({ timeout: 10_000 });

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

    // …and against the absolute expected values, so a bug that shifts BOTH
    // the bench and the order the same way still fails this test.
    expect(orderBasePrice).toBeCloseTo(PRICE_LIST_RATE, 2);
    expect(orderDiscountPct, "party's legacy RD 10% must not be applied on top of the price list").toBeCloseTo(0, 2);

    // The order screen must show the grand total it will actually store —
    // it used to display an unconditional Math.round() of it (₹342 for a
    // ₹342.20 order) while saving the unrounded value.
    await expect(page.getByText(new RegExp(`₹\\s*${EXPECTED_TOTAL.toFixed(2)}`))).toBeVisible({ timeout: 10_000 });

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

    // The invoice must carry the order's finalized pricing verbatim — same
    // base rate, same (absent) discount, same GST, same line total. Read the
    // persisted rows rather than scraping formatted text, so the assertion is
    // about stored business values and not about layout.
    const invoiceLine = await page.evaluate(async (partyName: string) => {
      const { supabase } = await import(/* @vite-ignore */ "/src/integrations/supabase/client.ts");
      const businessId = localStorage.getItem("rdpro.activeBusinessId");
      const { data } = await supabase
        .from("sales_invoices")
        .select("invoice_number, status, grand_total, round_off_amount, order_id, sales_invoice_items(qty, mrp, net_rate, discount_pct, gst_pct, total, price_list_id, price_source)")
        .eq("business_id", businessId)
        .eq("party_name", partyName)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as never;
    }, PARTY_NAME);

    expect(invoiceLine, "an invoice should exist for the fixture party").toBeTruthy();
    const inv = invoiceLine as unknown as {
      status: string;
      order_id: string | null;
      sales_invoice_items: {
        qty: number; mrp: number; net_rate: number; discount_pct: number;
        gst_pct: number; total: number; price_list_id: string | null; price_source: string | null;
      }[];
    };

    expect(inv.status).toBe("posted");
    expect(inv.order_id, "invoice must stay linked to the order it came from").toBeTruthy();
    expect(inv.sales_invoice_items).toHaveLength(1);

    const item = inv.sales_invoice_items[0];
    expect(Number(item.mrp), "invoice base rate must be the order's, not a re-resolved one").toBeCloseTo(PRICE_LIST_RATE, 2);
    expect(Number(item.net_rate)).toBeCloseTo(PRICE_LIST_RATE, 2);
    expect(Number(item.discount_pct)).toBeCloseTo(0, 2);
    expect(Number(item.gst_pct)).toBeCloseTo(18, 2);
    expect(Number(item.qty)).toBeCloseTo(QTY * 3, 2);
    expect(Number(item.total)).toBeCloseTo(+(PRICE_LIST_RATE * QTY * 3 * 1.18).toFixed(2), 2);

    // The pricing trace itself must survive the copy — this is what proves
    // the invoice inherited the order's resolution instead of re-pricing.
    expect(item.price_source, "price_source must be copied verbatim from the order line").toBe("price_list");
    expect(item.price_list_id, "price_list_id must be copied verbatim from the order line").toBeTruthy();
  });

  test("5. Cancelling the invoice reverses it and releases the order", async ({ page }) => {
    await page.goto("/sales/invoices");

    const invoiceRow = page.getByRole("row", { name: new RegExp(PARTY_NAME, "i") }).first();
    await invoiceRow.getByRole("button", { name: /row actions/i }).click();
    await page.getByRole("menuitem", { name: /cancel invoice/i }).click();
    await page.getByRole("button", { name: /^cancel invoice$/i }).click();

    const state = await page.evaluate(async (partyName: string) => {
      const { supabase } = await import(/* @vite-ignore */ "/src/integrations/supabase/client.ts");
      const businessId = localStorage.getItem("rdpro.activeBusinessId");
      const { data: inv } = await supabase
        .from("sales_invoices")
        .select("status, voucher_id, order_id")
        .eq("business_id", businessId)
        .eq("party_name", partyName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = inv as { status: string; voucher_id: string | null; order_id: string | null } | null;
      if (!row) return null;
      const { data: voucher } = row.voucher_id
        ? await supabase.from("vouchers").select("status").eq("id", row.voucher_id).maybeSingle()
        : { data: null };
      const { data: order } = row.order_id
        ? await supabase.from("orders").select("status").eq("id", row.order_id).maybeSingle()
        : { data: null };
      return {
        invoiceStatus: row.status,
        voucherStatus: (voucher as { status: string } | null)?.status ?? null,
        orderStatus: (order as { status: string } | null)?.status ?? null,
      };
    }, PARTY_NAME);

    expect(state).toBeTruthy();
    expect(state!.invoiceStatus).toBe("cancelled");
    // A cancelled invoice must not leave its auto-posted sales voucher live,
    // or the ledger keeps counting revenue that no longer exists.
    expect(state!.voucherStatus, "the invoice's ledger voucher must be cancelled too").toBe("cancelled");
    // …and the order must be released so it can be re-invoiced.
    expect(state!.orderStatus, "cancelling the invoice must release the order").not.toBe("invoiced");
  });
});
