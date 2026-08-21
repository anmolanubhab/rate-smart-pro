import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for: renaming a party (e.g. a test party corrected to the real
// supplier name) left its linked ledger_accounts.name frozen at the old
// value forever, because ensure_party_ledger() only sets the ledger's name
// once, at creation -- Party.name and ledger_accounts.name are independent
// columns with no ongoing sync. Voucher Center, Ledger Accounts, and every
// report read ledger_accounts.name, so PV-2608-0001 (a Purchase voucher
// auto-posted from an invoice against "TVS Motor Co.") kept showing
// "Credited To: Anushka Test Party" -- the party's name before it was
// corrected -- even though purchase_invoices.supplier_id and every FK
// pointed at the right party the whole time.
//
// Fix: src/lib/accounting.ts's syncPartyLedgerName(), called from
// PartyFormDialog's save handler whenever an edited party's name changes.
// It updates ledger_accounts.name scoped by the real party_id foreign key
// (added in 20260421082816_...) AND business_id -- never by name-matching --
// so it can only ever touch the ledger(s) definitively linked to that exact
// party in that exact company.
//
// The one-time backfill for already-drifted data
// (supabase/migrations/20260821140000_backfill_stale_party_ledger_names.sql)
// runs the same WHERE clause in SQL; `backfillMirror` below is a pure JS
// mirror of that statement, in the same style as partyBalance.reversal.test.ts,
// so its exact scoping rule is pinned without needing a live database.

const BIZ_A = "biz-aaaa";
const BIZ_B = "biz-bbbb";

interface Party {
  id: string;
  business_id: string;
  name: string;
}

interface LedgerAccount {
  id: string;
  business_id: string;
  party_id: string | null;
  name: string;
}

let LEDGERS: LedgerAccount[];

function resetFixtures() {
  LEDGERS = [
    // The party at the centre of the bug: originally created as test data,
    // later corrected to the real supplier name -- but its ledger never
    // followed.
    { id: "ledger-tvs", business_id: BIZ_A, party_id: "party-tvs", name: "Anushka Test Party" },
    // A different, unrelated party in the same company -- must never be
    // touched by a rename of party-tvs.
    { id: "ledger-other", business_id: BIZ_A, party_id: "party-other", name: "Other Supplier Pvt Ltd" },
    // A non-party system ledger (party_id null) -- must never be touched.
    { id: "ledger-purchase", business_id: BIZ_A, party_id: null, name: "Purchase Account" },
    // Same party_id value, but a different company -- must never be touched
    // by a rename scoped to BIZ_A (party_id alone is not a safe filter).
    { id: "ledger-cross-biz", business_id: BIZ_B, party_id: "party-tvs", name: "Anushka Test Party" },
  ];
}

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockQuery extends PromiseLike<MockResult> {
  update(patch: Record<string, unknown>): MockQuery;
  eq(col: string, val: unknown): MockQuery;
}

/** Mirrors supabase-js's .from("ledger_accounts").update(...).eq().eq()
 *  chain against the real LEDGERS array, so a passing test proves the
 *  filter chain actually restricts which rows get written -- not that a
 *  mock decided to allow it. */
function ledgerAccountsTable(): MockQuery {
  let matches = LEDGERS;
  let patch: Record<string, unknown> | null = null;
  const q: MockQuery = {
    update: (p) => {
      patch = p;
      return q;
    },
    eq: (col, val) => {
      matches = matches.filter((r) => (r as any)[col] === val);
      return q;
    },
    then: (onfulfilled, onrejected) =>
      Promise.resolve().then(() => {
        if (patch) {
          for (const row of matches) Object.assign(row, patch);
        }
        return { data: null, error: null };
      }).then(onfulfilled, onrejected),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "ledger_accounts") return ledgerAccountsTable();
      throw new Error(`unexpected table in mock: ${table}`);
    },
  },
}));

import { syncPartyLedgerName } from "./accounting";

describe("syncPartyLedgerName — party rename propagation", () => {
  beforeEach(resetFixtures);

  it("renames only the ledger definitively linked to that party in that business (PV-2608-0001 scenario)", async () => {
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    expect(LEDGERS.find((l) => l.id === "ledger-tvs")!.name).toBe("TVS Motor Co.");
  });

  it("leaves the ledger's id unchanged -- this is a rename, not a re-link", async () => {
    const before = LEDGERS.find((l) => l.id === "ledger-tvs")!;
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    const after = LEDGERS.find((l) => l.name === "TVS Motor Co.");
    expect(after!.id).toBe(before.id);
    expect(LEDGERS).toHaveLength(4); // no row created or deleted
  });

  it("never touches an unrelated party's ledger", async () => {
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    expect(LEDGERS.find((l) => l.id === "ledger-other")!.name).toBe("Other Supplier Pvt Ltd");
  });

  it("never touches a non-party (system) ledger", async () => {
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    expect(LEDGERS.find((l) => l.id === "ledger-purchase")!.name).toBe("Purchase Account");
  });

  it("business isolation: a matching party_id in a different company is not renamed", async () => {
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    expect(LEDGERS.find((l) => l.id === "ledger-cross-biz")!.name).toBe("Anushka Test Party");
  });

  it("renaming the same party in its own other business only affects that business's row", async () => {
    await syncPartyLedgerName("party-tvs", BIZ_B, "TVS Motor Co. (Branch)");
    expect(LEDGERS.find((l) => l.id === "ledger-cross-biz")!.name).toBe("TVS Motor Co. (Branch)");
    expect(LEDGERS.find((l) => l.id === "ledger-tvs")!.name).toBe("Anushka Test Party");
  });
});

describe("voucher display reflects the synced name (Voucher Center regression)", () => {
  beforeEach(resetFixtures);

  // Mirrors fetchVouchers() in accounting.ts: a voucher's "Credited To"
  // column is read from voucher_items -> ledger_accounts.name, joined by
  // ledger_account_id -- never by party name. Renaming the ledger must not
  // require touching voucher_items at all.
  const VOUCHER_ITEMS = [
    { id: "vi-1", voucher_id: "PV-2608-0001", ledger_account_id: "ledger-tvs", cr_amount: 162921, dr_amount: 0 },
  ];

  function creditedTo() {
    return VOUCHER_ITEMS
      .filter((i) => i.cr_amount > 0)
      .map((i) => LEDGERS.find((l) => l.id === i.ledger_account_id)?.name)
      .filter(Boolean);
  }

  it("PV-2608-0001 shows the stale name before the fix runs", () => {
    expect(creditedTo()).toEqual(["Anushka Test Party"]);
  });

  it("PV-2608-0001 shows 'TVS Motor Co.' after syncPartyLedgerName runs, with no change to the voucher posting itself", async () => {
    const itemsBefore = JSON.parse(JSON.stringify(VOUCHER_ITEMS));
    await syncPartyLedgerName("party-tvs", BIZ_A, "TVS Motor Co.");
    expect(creditedTo()).toEqual(["TVS Motor Co."]);
    // voucher_items -- the actual accounting posting -- is untouched: same
    // ledger_account_id, same amounts.
    expect(VOUCHER_ITEMS).toEqual(itemsBefore);
  });
});

describe("backfillMirror — stale-data migration (20260821140000_backfill_stale_party_ledger_names.sql)", () => {
  // Pure mirror of:
  //   update ledger_accounts la set name = p.name from parties p
  //   where la.party_id = p.id and la.business_id = p.business_id and la.name <> p.name;
  function backfillMirror(ledgers: LedgerAccount[], parties: Party[]): LedgerAccount[] {
    return ledgers.map((l) => {
      const p = parties.find((p) => p.id === l.party_id && p.business_id === l.business_id);
      return p && p.name !== l.name ? { ...l, name: p.name } : l;
    });
  }

  const PARTIES: Party[] = [
    { id: "party-tvs", business_id: BIZ_A, name: "TVS Motor Co." },
    { id: "party-other", business_id: BIZ_A, name: "Other Supplier Pvt Ltd" },
    // Same id value scoped to a different business -- must not leak across.
    { id: "party-tvs", business_id: BIZ_B, name: "TVS Motor Co. (Branch)" },
  ];

  beforeEach(resetFixtures);

  it("repairs the stale PV-2608-0001 ledger to match the party's current name", () => {
    const result = backfillMirror(LEDGERS, PARTIES);
    expect(result.find((l) => l.id === "ledger-tvs")!.name).toBe("TVS Motor Co.");
  });

  it("is a no-op for a ledger whose name already matches its party", () => {
    const already = backfillMirror(LEDGERS, PARTIES).find((l) => l.id === "ledger-other")!;
    expect(already.name).toBe("Other Supplier Pvt Ltd");
  });

  it("does not touch a ledger with no linked party", () => {
    const result = backfillMirror(LEDGERS, PARTIES);
    expect(result.find((l) => l.id === "ledger-purchase")!.name).toBe("Purchase Account");
  });

  it("resolves the cross-business row against its own business's party, not BIZ_A's", () => {
    const result = backfillMirror(LEDGERS, PARTIES);
    expect(result.find((l) => l.id === "ledger-cross-biz")!.name).toBe("TVS Motor Co. (Branch)");
  });

  it("never renames a ledger id or reassigns party_id", () => {
    const result = backfillMirror(LEDGERS, PARTIES);
    for (const l of LEDGERS) {
      const after = result.find((r) => r.id === l.id)!;
      expect(after.party_id).toBe(l.party_id);
      expect(after.business_id).toBe(l.business_id);
    }
    expect(result.map((l) => l.id).sort()).toEqual(LEDGERS.map((l) => l.id).sort());
  });
});
