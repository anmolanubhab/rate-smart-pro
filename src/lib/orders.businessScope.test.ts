import { describe, it, expect, vi, beforeEach } from "vitest";

// Security regression: a single order must never be readable across
// businesses.
//
// fetchOrders() (the list) was always scoped by business_id, but its
// single-record sibling fetchOrder(id) filtered on id alone. Proven live:
// with company A active, /orders/edit/<company-B-order-id> loaded B's order
// and rendered it under A's letterhead — editable, printable, invoiceable.
//
// RLS cannot close this. orders_team_member_select only requires
// is_business_member(business_id), and a user who owns two companies is a
// member of both, so the database legitimately returns either row. "Active
// business" is an application concept, so these tests assert the service
// layer enforces it.
//
// The mock below actually applies the .eq() filters against a fake table
// rather than returning a canned row, so a cross-business denial has to come
// from real filtering — not from the mock deciding to say no.

const BIZ_A = "biz-aaaa";
const BIZ_B = "biz-bbbb";

const ORDERS = [
  { id: "order-a1", business_id: BIZ_A, order_number: "ORD-A-1", status: "pending" },
  { id: "order-b1", business_id: BIZ_B, order_number: "ORD-B-1", status: "pending" },
];

const ORDER_ITEMS = [
  { id: "item-a1", order_id: "order-a1", part_number: "A-PART", position: 0 },
  { id: "item-b1", order_id: "order-b1", part_number: "B-PART", position: 0 },
];

let activeBusinessId: string | null = BIZ_A;

vi.mock("@/lib/activeBusiness", () => ({
  getActiveBusinessIdSync: () => activeBusinessId,
}));

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  select(): MockQuery;
  eq(col: string, val: unknown): MockQuery;
  order(): MockQuery;
  maybeSingle(): Promise<MockResult>;
  single(): Promise<MockResult>;
}

function tableQuery(rows: Record<string, unknown>[]): MockQuery {
  let filtered = [...rows];
  const q: MockQuery = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return q;
    },
    order: () => q,
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    single: () =>
      Promise.resolve(
        filtered[0] ? { data: filtered[0], error: null } : { data: null, error: { message: "no rows" } }
      ),
    then: (onfulfilled, onrejected) =>
      Promise.resolve({ data: filtered, error: null }).then(onfulfilled, onrejected),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "orders") return tableQuery(ORDERS);
      if (table === "order_items") return tableQuery(ORDER_ITEMS);
      return tableQuery([]);
    },
  },
}));

import { fetchOrder, fetchOrderItems, ORDER_NOT_FOUND } from "./orders";

describe("fetchOrder — cross-business isolation", () => {
  beforeEach(() => {
    activeBusinessId = BIZ_A;
  });

  it("Test 1 — same business: returns the order", async () => {
    const order = await fetchOrder("order-a1");
    expect(order.id).toBe("order-a1");
    expect(order.business_id).toBe(BIZ_A);
  });

  it("Test 2 — cross business: denied, and leaks no order data", async () => {
    // Business A active, asking for Business B's order id by UUID.
    await expect(fetchOrder("order-b1")).rejects.toThrow(ORDER_NOT_FOUND);
  });

  it("Test 3 — direct edit URL: the id alone does not grant access", async () => {
    // What /orders/edit/<other-company-order-id> does under the hood.
    await expect(fetchOrder("order-b1")).rejects.toThrow(ORDER_NOT_FOUND);
    // …and it still works the moment that business really is the active one.
    activeBusinessId = BIZ_B;
    await expect(fetchOrder("order-b1")).resolves.toMatchObject({ id: "order-b1" });
  });

  it("Test 4 — view/print path: line items are gated by the same check", async () => {
    await expect(fetchOrderItems("order-b1")).rejects.toThrow(ORDER_NOT_FOUND);
    const mine = await fetchOrderItems("order-a1");
    expect(mine).toHaveLength(1);
    expect(mine[0].part_number).toBe("A-PART");
  });

  it("Test 5 — invoice generation: an explicit businessId is honoured over the active one", async () => {
    // generateInvoiceFromOrder passes opts.businessId. Business A must not be
    // able to invoice B's order even if B is what the browser has active.
    activeBusinessId = BIZ_B;
    await expect(fetchOrder("order-b1", BIZ_A)).rejects.toThrow(ORDER_NOT_FOUND);
    await expect(fetchOrderItems("order-b1", BIZ_A)).rejects.toThrow(ORDER_NOT_FOUND);
  });

  it("Test 6 — Salesman Portal: passes its own business and keeps working", async () => {
    // Portal users never set rdpro.activeBusinessId, so the explicit argument
    // is the only context they have. It must be sufficient.
    activeBusinessId = null;
    await expect(fetchOrder("order-b1", BIZ_B)).resolves.toMatchObject({ id: "order-b1" });
    const items = await fetchOrderItems("order-b1", BIZ_B);
    expect(items[0].part_number).toBe("B-PART");
  });

  it("refuses rather than querying unscoped when no business context exists", async () => {
    activeBusinessId = null;
    await expect(fetchOrder("order-a1")).rejects.toThrow(ORDER_NOT_FOUND);
    await expect(fetchOrderItems("order-a1")).rejects.toThrow(ORDER_NOT_FOUND);
  });

  it("does not distinguish 'belongs to another business' from 'does not exist'", async () => {
    // Probing an id must not confirm that some other company holds it.
    const crossBusiness = await fetchOrder("order-b1").catch((e: Error) => e.message);
    const nonexistent = await fetchOrder("order-does-not-exist").catch((e: Error) => e.message);
    expect(crossBusiness).toBe(nonexistent);
  });
});
