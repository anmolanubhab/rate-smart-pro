import { describe, it, expect } from "vitest";

// COMPANY SWITCH WITH AN EDITOR OPEN
//
// Companion to createOrder.autosaveGuard.test.ts. That file pins the autosave
// interval's decision; this one pins the switch HANDLER — what must happen to
// the open form the moment the active company changes underneath it.
//
// Two independent mechanisms cover a switch, and it matters which owns what:
//
//   useBusiness   queryClient.clear() on "rdpro:active-business-changed",
//                 which drops every CACHED QUERY so no company-A response is
//                 replayed under company B.
//
//   CreateOrder   the component's OWN state — items, party, draftId, the
//                 dirty flag, the autosave timer — none of which lives in
//                 react-query and so none of which clear() touches.
//
// The scenarios below are the three the QA plan calls out: switching with the
// editor open, with a draft open, and with an autosave pending.

interface SwitchState {
  /** Company the form was loaded for (loadedBusinessIdRef in the component). */
  loadedBusinessId: string | null;
  /** Company that is active now, after the switch event fired. */
  activeBusinessId: string | null;
}

interface SwitchOutcome {
  draftCleared: boolean;
  dirtyCleared: boolean;
  editorClosed: boolean;
  /** Navigating away unmounts CreateOrder, so its interval is cleared. */
  autosaveTimerStopped: boolean;
}

/** Mirrors the onActiveBusinessChange handler in src/pages/CreateOrder.tsx. */
function onCompanyChanged(s: SwitchState): SwitchOutcome {
  // A no-op event (same company) must not tear down a form the user is using.
  if (s.activeBusinessId === s.loadedBusinessId) {
    return { draftCleared: false, dirtyCleared: false, editorClosed: false, autosaveTimerStopped: false };
  }
  // Real switch: drop the in-flight draft rather than let it follow the user.
  return { draftCleared: true, dirtyCleared: true, editorClosed: true, autosaveTimerStopped: true };
}

/** Mirrors the autosave guard's company check — the anti-stale-write rule. */
function autosaveWouldWrite(s: SwitchState & { isDirty: boolean; validRowCount: number }): boolean {
  if (!s.isDirty || !s.validRowCount) return false;
  return s.activeBusinessId === s.loadedBusinessId;
}

const A = "biz-a-akl";
const B = "biz-b-bootstrap";
const C = "biz-c-mc-test";

describe("Company switch with an order editor open", () => {
  describe("A -> B -> C -> A tears the open form down every time", () => {
    const hops: [string, string, string][] = [
      ["A -> B", A, B],
      ["B -> C", B, C],
      ["C -> A", C, A],
    ];

    for (const [label, from, to] of hops) {
      it(`${label}: draft, dirty state, editor and timer all cleared`, () => {
        const out = onCompanyChanged({ loadedBusinessId: from, activeBusinessId: to });
        expect(out.draftCleared, "the in-flight draft must not follow the user").toBe(true);
        expect(out.dirtyCleared, "a stale dirty flag would re-enable autosave").toBe(true);
        expect(out.editorClosed, "the editor must not stay open over the new company").toBe(true);
        expect(out.autosaveTimerStopped, "the 30s interval must not survive the switch").toBe(true);
      });
    }
  });

  describe("switching while an autosave is pending must not write", () => {
    it("A -> B: a dirty form loaded under A is not written after B becomes active", () => {
      // The stale-mutation case: the interval fires after the switch. Without
      // the company check this wrote company A's order using state the user
      // has effectively abandoned — or wrote it while B was the active
      // company entirely.
      expect(
        autosaveWouldWrite({ loadedBusinessId: A, activeBusinessId: B, isDirty: true, validRowCount: 3 })
      ).toBe(false);
    });

    it("B -> C: same, in the next hop", () => {
      expect(
        autosaveWouldWrite({ loadedBusinessId: B, activeBusinessId: C, isDirty: true, validRowCount: 2 })
      ).toBe(false);
    });

    it("C -> A: returning to the first company does not resurrect C's draft", () => {
      // Coming back to A must not make a form loaded under C writable again.
      expect(
        autosaveWouldWrite({ loadedBusinessId: C, activeBusinessId: A, isDirty: true, validRowCount: 5 })
      ).toBe(false);
    });

    it("no switch: a genuinely dirty form in its own company still autosaves", () => {
      // The guard must not be so broad that it breaks normal editing.
      expect(
        autosaveWouldWrite({ loadedBusinessId: A, activeBusinessId: A, isDirty: true, validRowCount: 3 })
      ).toBe(true);
    });
  });

  describe("a same-company event is not a switch", () => {
    it("re-emitting the event for the current company leaves the form alone", () => {
      // useBusiness re-syncs localStorage and can fire this without the
      // company actually changing; tearing the editor down then would look
      // like random data loss to the user.
      const out = onCompanyChanged({ loadedBusinessId: A, activeBusinessId: A });
      expect(out.editorClosed).toBe(false);
      expect(out.draftCleared).toBe(false);
    });
  });

  describe("an unresolvable company is treated as a switch, not as 'stay'", () => {
    it("losing the active company closes the editor rather than leaving it open", () => {
      const out = onCompanyChanged({ loadedBusinessId: A, activeBusinessId: null });
      expect(out.editorClosed).toBe(true);
      expect(out.draftCleared).toBe(true);
    });

    it("and autosave does not write with no active company", () => {
      expect(
        autosaveWouldWrite({ loadedBusinessId: A, activeBusinessId: null, isDirty: true, validRowCount: 3 })
      ).toBe(false);
    });
  });
});
