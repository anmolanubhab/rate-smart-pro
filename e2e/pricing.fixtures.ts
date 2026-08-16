import { test, expect } from "@playwright/test";

// Idempotent fixture guarantee for e2e/pricing-flow.spec.ts. Runs
// automatically before the pricing spec (wired as a dependency of the
// "chromium" project in playwright.config.ts) — no manual SQL, no
// duplicate records on repeated runs.
//
// Reuses the QA session's own RLS-scoped access (business owner on
// BOOTSTRAP FIX VERIFY TEST) rather than driving the multi-tab Add
// Party/Product dialogs through the UI — those forms have enough
// conditional fields (party groups, group-default toggles, etc.) that
// UI-automating them would be far more fragile than a direct,
// search-then-insert Supabase call under the user's own permissions.
// Nothing here needs elevated/service-role access; every insert is
// exactly what BOOTSTRAP FIX VERIFY TEST's owner could do by hand.
//
// Uses `import("/src/integrations/supabase/client.ts")` — the same
// module path Vite's dev server serves raw, matching how the rest of
// this suite already assumes a dev-server target (E2E_BASE_URL defaults
// to localhost:8080). Would need adjusting if ever pointed at a built
// bundle instead.

test.use({ storageState: "e2e/.auth/qa-user.json" });

const PARTY_NAME = process.env.E2E_PARTY_NAME ?? "E2E_PRICING_PARTY";
const PRODUCT_QUERY = process.env.E2E_PRODUCT_QUERY ?? "E2E_PRICING_PRODUCT";

interface FixtureResult {
  error?: string;
  partyCreated?: boolean;
  productCreated?: boolean;
  businessId?: string;
}

test("ensure the pricing E2E fixture party + product exist in the QA business", async ({ page }) => {
  // Any already-authenticated route works — just need the page's own
  // module graph (and localStorage) loaded so the dynamic import + active
  // business id are available to evaluate() below.
  await page.goto("/companies");

  const result = await page.evaluate<FixtureResult, { partyName: string; productQuery: string }>(
    async ({ partyName, productQuery }) => {
      const clientModule = await import(/* @vite-ignore */ "/src/integrations/supabase/client.ts");
      const supabase = clientModule.supabase;

      const businessId = localStorage.getItem("rdpro.activeBusinessId");
      if (!businessId) return { error: "No active business id in localStorage — was the QA business actually selected during setup?" };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { error: "No authenticated user — session did not carry over from storageState." };

      let partyCreated = false;
      const { data: existingParty, error: partyLookupErr } = await supabase
        .from("parties")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", partyName)
        .maybeSingle();
      if (partyLookupErr) return { error: `Party lookup failed: ${partyLookupErr.message}` };
      if (!existingParty) {
        const { error: partyInsertErr } = await supabase.from("parties").insert({
          user_id: user.id,
          business_id: businessId,
          name: partyName,
          discount_type: "RD",
          agreed_discount: 10,
          default_discount: 5,
          preferred_customer: true,
        });
        if (partyInsertErr) return { error: `Party insert failed: ${partyInsertErr.message}` };
        partyCreated = true;
      }

      let productCreated = false;
      const { data: existingProduct, error: productLookupErr } = await supabase
        .from("products")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", productQuery)
        .maybeSingle();
      if (productLookupErr) return { error: `Product lookup failed: ${productLookupErr.message}` };
      if (!existingProduct) {
        const { error: productInsertErr } = await supabase.from("products").insert({
          user_id: user.id,
          business_id: businessId,
          part_number: "E2E-PRICING-001",
          name: productQuery,
          mrp: 1000,
          dealer_rate: 800,
          gst_pct: 18,
          cost_price: 500,
        });
        if (productInsertErr) return { error: `Product insert failed: ${productInsertErr.message}` };
        productCreated = true;
      }

      return { partyCreated, productCreated, businessId };
    },
    { partyName: PARTY_NAME, productQuery: PRODUCT_QUERY }
  );

  expect(result.error, result.error).toBeUndefined();
  console.log("Pricing fixture check:", JSON.stringify(result));
});
