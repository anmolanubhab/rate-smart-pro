import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the "a brand-new price list prices orders before anyone
// clicks Activate" bug.
//
// price_lists.status defaults to 'draft' but price_lists.is_active defaults to
// TRUE, and basePriceResolver.ts resolves purely on is_active (it never looks
// at status). savePriceList() used to send neither column on insert, so every
// freshly-created list went live immediately while the editor still showed it
// as a draft with an Activate button. duplicatePriceList() had always set the
// pair explicitly, which is what pins the intended invariant: draft => inactive.

interface MockResult {
  data: unknown;
  error: unknown;
}

let insertedPayload: Record<string, unknown> | null = null;
let duplicateNameRows: unknown[] = [];

interface MockQuery extends PromiseLike<MockResult> {
  select(): MockQuery;
  eq(): MockQuery;
  neq(): MockQuery;
  ilike(): MockQuery;
  limit(): MockQuery;
  maybeSingle(): Promise<MockResult>;
  single(): Promise<MockResult>;
}

function selectQuery(result: MockResult): MockQuery {
  const q: MockQuery = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    ilike: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => selectQuery({ data: duplicateNameRows, error: null }),
      insert: (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return selectQuery({ data: { id: "new-list-id" }, error: null });
      },
      update: () => selectQuery({ data: null, error: null }),
    }),
  },
}));

import { savePriceList } from "./priceLists";

describe("savePriceList — new lists must start inactive", () => {
  beforeEach(() => {
    insertedPayload = null;
    duplicateNameRows = [];
  });

  it("stamps status=draft and is_active=false when creating", async () => {
    const id = await savePriceList({ business_id: "biz-1", name: "Dealer 2026-27" } as never);

    expect(id).toBe("new-list-id");
    expect(insertedPayload).not.toBeNull();
    // The whole point: without is_active=false the DB default (true) applies
    // and basePriceResolver starts pricing against an unactivated draft.
    expect(insertedPayload!.is_active).toBe(false);
    expect(insertedPayload!.status).toBe("draft");
  });

  it("still carries the caller's own fields through", async () => {
    await savePriceList({
      business_id: "biz-1",
      name: "Wholesale",
      list_type: "wholesale",
      currency: "INR",
      is_default: false,
    } as never);

    expect(insertedPayload!.name).toBe("Wholesale");
    expect(insertedPayload!.list_type).toBe("wholesale");
    expect(insertedPayload!.business_id).toBe("biz-1");
  });
});
