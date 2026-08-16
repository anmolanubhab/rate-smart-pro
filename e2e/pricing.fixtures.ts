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
const PRICE_LIST_NAME = "E2E_PRICING_LIST";
const PRICE_LIST_RATE = 145;

interface FixtureResult {
  error?: string;
  partyCreated?: boolean;
  productCreated?: boolean;
  priceListCreated?: boolean;
  businessId?: string;
}

test("ensure the pricing E2E fixture party + product exist in the QA business", async ({ page }) => {
  // Any already-authenticated route works — just need the page's own
  // module graph (and localStorage) loaded so the dynamic import + active
  // business id are available to evaluate() below.
  await page.goto("/companies");

  // Every value the browser side needs must be destructured here: evaluate()
  // runs in the page, so it cannot close over Node-scope constants. The call
  // below already passed priceListName/priceListRate, but they were missing
  // from both the type parameter and this destructuring, so the price-list
  // half of the fixture threw "priceListName is not defined" inside the page.
  const result = await page.evaluate<
    FixtureResult,
    { partyName: string; productQuery: string; priceListName: string; priceListRate: number }
  >(
    async ({ partyName, productQuery, priceListName, priceListRate }) => {
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

      // Price list @ PRICE_LIST_RATE assigned to the fixture party. Without
      // it the party's own legacy RD discount (agreed_discount 10) would be
      // what prices the line, and the spec could only assert "some number
      // came back". With it the whole chain is deterministic: base 145,
      // discount 0 (a resolved Price List always outranks the legacy
      // fallback — never both), 18% GST, 171.10.
      //
      // is_active/status are set explicitly: price_lists.is_active defaults
      // to true while status defaults to 'draft', and basePriceResolver
      // resolves on is_active alone, so an "active" list must say so on both.
      let priceListCreated = false;
      const { data: existingList, error: listLookupErr } = await supabase
        .from("price_lists")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", priceListName)
        .maybeSingle();
      if (listLookupErr) return { error: `Price list lookup failed: ${listLookupErr.message}` };

      let priceListId = (existingList as { id: string } | null)?.id ?? null;
      if (!priceListId) {
        const { data: createdList, error: listInsertErr } = await supabase
          .from("price_lists")
          .insert({
            business_id: businessId,
            name: priceListName,
            list_type: "dealer",
            currency: "INR",
            status: "active",
            is_active: true,
            is_default: false,
            effective_from: "2020-01-01",
          })
          .select("id")
          .single();
        if (listInsertErr) return { error: `Price list insert failed: ${listInsertErr.message}` };
        priceListId = (createdList as { id: string }).id;
        priceListCreated = true;
      }

      const { data: productRow, error: prodIdErr } = await supabase
        .from("products")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", productQuery)
        .maybeSingle();
      if (prodIdErr) return { error: `Product id lookup failed: ${prodIdErr.message}` };
      const productId = (productRow as { id: string } | null)?.id;
      if (!productId) return { error: "Fixture product missing right after ensuring it exists." };

      const { data: existingItem, error: itemLookupErr } = await supabase
        .from("price_list_items")
        .select("id")
        .eq("price_list_id", priceListId)
        .eq("product_id", productId)
        .maybeSingle();
      if (itemLookupErr) return { error: `Price list item lookup failed: ${itemLookupErr.message}` };
      if (!existingItem) {
        const { error: itemInsertErr } = await supabase.from("price_list_items").insert({
          price_list_id: priceListId,
          product_id: productId,
          price: priceListRate,
          effective_from: "2020-01-01",
        });
        if (itemInsertErr) return { error: `Price list item insert failed: ${itemInsertErr.message}` };
      }

      const { data: partyRow, error: partyIdErr } = await supabase
        .from("parties")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", partyName)
        .maybeSingle();
      if (partyIdErr) return { error: `Party id lookup failed: ${partyIdErr.message}` };
      const partyId = (partyRow as { id: string } | null)?.id;
      if (!partyId) return { error: "Fixture party missing right after ensuring it exists." };

      const { data: existingAssignment, error: assignLookupErr } = await supabase
        .from("party_price_assignments")
        .select("id")
        .eq("business_id", businessId)
        .eq("party_id", partyId)
        .eq("price_list_id", priceListId)
        .maybeSingle();
      if (assignLookupErr) return { error: `Assignment lookup failed: ${assignLookupErr.message}` };
      if (!existingAssignment) {
        const { error: assignInsertErr } = await supabase.from("party_price_assignments").insert({
          business_id: businessId,
          party_id: partyId,
          price_list_id: priceListId,
          priority: 100,
          is_active: true,
          effective_from: "2020-01-01",
        });
        if (assignInsertErr) return { error: `Assignment insert failed: ${assignInsertErr.message}` };
      }

      return { partyCreated, productCreated, priceListCreated, businessId };
    },
    { partyName: PARTY_NAME, productQuery: PRODUCT_QUERY, priceListName: PRICE_LIST_NAME, priceListRate: PRICE_LIST_RATE }
  );

  expect(result.error, result.error).toBeUndefined();
  console.log("Pricing fixture check:", JSON.stringify(result));
});
