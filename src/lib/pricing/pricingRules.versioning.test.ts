import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the rule-versioning date-overlap bug: editing an
// active rule used to close the old row's effective_to on the SAME date the
// new version's effective_from starts, and dateEligibility() in
// ruleResolver.ts treats both bounds as inclusive — so for one day both the
// old and new version were simultaneously eligible. savePricingRule must
// close the old row the day BEFORE the new version starts.

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(...args: unknown[]): MockQuery;
  eq(...args: unknown[]): MockQuery;
  or(...args: unknown[]): MockQuery;
  in(...args: unknown[]): MockQuery;
  order(...args: unknown[]): MockQuery;
  limit(...args: unknown[]): MockQuery;
  update(payload: unknown): MockQuery;
  insert(payload: unknown): MockQuery;
  delete(...args: unknown[]): MockQuery;
  maybeSingle(): Promise<MockResult>;
  single(): Promise<MockResult>;
}

function makeQuery(result: MockResult, onUpdate?: (p: unknown) => void, onInsert?: (p: unknown) => void): MockQuery {
  const q: MockQuery = {
    select: () => q,
    eq: () => q,
    or: () => q,
    in: () => q,
    order: () => q,
    limit: () => q,
    update: (payload) => {
      onUpdate?.(payload);
      return q;
    },
    insert: (payload) => {
      onInsert?.(payload);
      return q;
    },
    delete: () => q,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return q;
}

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

import { savePricingRule, type PricingRuleRow } from "./pricingRules";

describe("savePricingRule — active rule versioning", () => {
  let closeUpdatePayload: Record<string, unknown> | null = null;
  let insertPayload: Record<string, unknown> | null = null;

  beforeEach(() => {
    closeUpdatePayload = null;
    insertPayload = null;
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => {
      if (table !== "pricing_rules") {
        // pricing_rule_targets/conditions/benefits — replaceChildren() only
        // issues deletes here since we pass empty arrays.
        return makeQuery({ data: null, error: null });
      }
      return makeQuery(
        { data: { id: "new-rule-id" }, error: null },
        (payload) => { closeUpdatePayload = payload as Record<string, unknown>; },
        (payload) => { insertPayload = payload as Record<string, unknown>; }
      );
    });
  });

  it("closes the old version the day before the new version's effective_from, not on the same day", async () => {
    const existing: PricingRuleRow = {
      id: "old-rule-id",
      business_id: "biz-1",
      rule_type: "PARTY_DISCOUNT",
      name: "Diwali Scheme",
      description: null,
      priority: 100,
      stacking_mode: null,
      status: "active",
      effective_from: "2026-01-01",
      effective_to: null,
      approval_required: false,
      supersedes_rule_id: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const newId = await savePricingRule(
      "biz-1",
      {
        name: "Diwali Scheme",
        rule_type: "PARTY_DISCOUNT",
        priority: 100,
        stacking_mode: null,
        effective_from: "2026-08-14",
        effective_to: null,
        approval_required: false,
      },
      [],
      [],
      [],
      existing
    );

    expect(newId).toBe("new-rule-id");
    // Old row must be closed the day BEFORE the new version starts.
    expect(closeUpdatePayload?.effective_to).toBe("2026-08-13");
    // New row must carry the versioning link.
    expect(insertPayload?.supersedes_rule_id).toBe("old-rule-id");
    expect(insertPayload?.version).toBe(2);
    expect(insertPayload?.effective_from).toBe("2026-08-14");
  });

  it("still respects an existing effective_to that already ends before the new version starts", async () => {
    const existing: PricingRuleRow = {
      id: "old-rule-id",
      business_id: "biz-1",
      rule_type: "PARTY_DISCOUNT",
      name: "Diwali Scheme",
      description: null,
      priority: 100,
      stacking_mode: null,
      status: "active",
      effective_from: "2026-01-01",
      effective_to: "2026-06-30", // already scheduled to end earlier
      approval_required: false,
      supersedes_rule_id: null,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    await savePricingRule(
      "biz-1",
      {
        name: "Diwali Scheme",
        rule_type: "PARTY_DISCOUNT",
        priority: 100,
        stacking_mode: null,
        effective_from: "2026-08-14",
        effective_to: null,
        approval_required: false,
      },
      [],
      [],
      [],
      existing
    );

    expect(closeUpdatePayload?.effective_to).toBe("2026-06-30");
  });
});
