import { describe, it, expect } from "vitest";

// Regression for the party auto-select race in CreateOrder.
//
// The party list loads asynchronously. The user can type — or the browser can
// autofill — before it arrives. The load effect is keyed on [user], so the
// `partyQuery` it closed over was the value at mount (empty), and its
// post-load re-check `if (partyQuery) checkExactPartyMatch(partyQuery, data)`
// silently never fired for anyone who typed first. The party stayed
// unselected even though the typed name matched a real party exactly, so the
// whole party-dependent block ("Current Balance", pricing context) never
// rendered and the order could not be completed.
//
// Caught by the Playwright pricing SSOT spec, which fills the party field
// immediately on /orders/new and then waits for "Current Balance".
//
// This pins the resolution rule and the ordering that broke it. `pendingQuery`
// models the ref the component now reads through instead of the stale closure.

interface Party { id: string; name: string }

/** Mirrors checkExactPartyMatch in src/pages/CreateOrder.tsx. */
function resolveExactMatch(query: string, parties: Party[], selected: Party | null): string {
  const clean = query.trim().toLowerCase();
  const exact = parties.find((p) => p.name.trim().toLowerCase() === clean);
  if (exact) return exact.id;
  if (selected && selected.name.trim().toLowerCase() !== clean) return "";
  return selected?.id ?? "";
}

/**
 * Mirrors the load effect's post-fetch re-check.
 * `pendingQuery` is what the user has typed by the time the fetch resolves —
 * read from a ref. Passing the mount-time value here is the bug.
 */
function onPartiesLoaded(pendingQuery: string, parties: Party[]): string {
  if (!pendingQuery) return "";
  return resolveExactMatch(pendingQuery, parties, null);
}

const PARTIES: Party[] = [
  { id: "party-1", name: "E2E_PRICING_PARTY" },
  { id: "party-2", name: "Acme Traders" },
];

describe("CreateOrder party auto-select", () => {
  describe("typing before the party list has loaded", () => {
    it("selects the party once the list arrives", () => {
      // The exact sequence the E2E hits: fill() lands while parties is still [].
      const duringLoad = resolveExactMatch("E2E_PRICING_PARTY", [], null);
      expect(duringLoad, "nothing can match an empty list").toBe("");

      // Then the fetch resolves. Reading the CURRENT query resolves the party.
      expect(onPartiesLoaded("E2E_PRICING_PARTY", PARTIES)).toBe("party-1");
    });

    it("regression: reading the mount-time query leaves the party unselected", () => {
      // This is precisely the old behaviour — the closure captured "" at
      // mount, so the post-load re-check was skipped entirely.
      const staleClosureValue = "";
      expect(onPartiesLoaded(staleClosureValue, PARTIES)).toBe("");
    });

    it("is case- and whitespace-insensitive, as the matcher already was", () => {
      expect(onPartiesLoaded("  e2e_pricing_party  ", PARTIES)).toBe("party-1");
    });

    it("a non-matching query still selects nothing", () => {
      expect(onPartiesLoaded("NO_SUCH_PARTY", PARTIES)).toBe("");
    });
  });

  describe("typing after the list has loaded still works", () => {
    it("an exact name selects the party", () => {
      expect(resolveExactMatch("Acme Traders", PARTIES, null)).toBe("party-2");
    });

    it("editing away from a selected party clears the selection", () => {
      const selected = PARTIES[1];
      expect(resolveExactMatch("Acme Trad", PARTIES, selected)).toBe("");
    });

    it("retyping the same selected name keeps it selected", () => {
      const selected = PARTIES[1];
      expect(resolveExactMatch("Acme Traders", PARTIES, selected)).toBe("party-2");
    });
  });
});
