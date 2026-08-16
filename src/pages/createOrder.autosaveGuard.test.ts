import { describe, it, expect } from "vitest";

// Security regression for the autosave that wrote to the database during
// read-only viewing.
//
// The old guard was effectively `user && validRows().length && !saving`, so
// simply OPENING an existing order and leaving the tab alone for 30s rewrote
// it — saveOrder() delete-and-reinserts order_items, so a look became a real
// mutation. It also never re-checked the active company, so an order loaded
// under company A could be written after the user switched to company B.
//
// This pins the decision function the interval in CreateOrder.tsx now applies.

interface AutosaveState {
  user: boolean;
  saving: boolean;
  isDirty: boolean;
  validRowCount: number;
  activeBusinessId: string | null;
  loadedBusinessId: string | null;
  msSinceLastSave: number;
}

/** Mirrors the autosave interval guard in src/pages/CreateOrder.tsx. */
function shouldAutosave(s: AutosaveState): boolean {
  if (!s.user || s.saving) return false;
  if (!s.isDirty) return false;
  if (!s.validRowCount) return false;
  if (s.activeBusinessId !== s.loadedBusinessId) return false;
  if (s.msSinceLastSave < 25000) return false;
  return true;
}

const BIZ_A = "biz-a";
const BIZ_B = "biz-b";

const viewingExistingOrder: AutosaveState = {
  user: true,
  saving: false,
  isDirty: false, // hydrating a loaded order must not mark the form dirty
  validRowCount: 3, // a real saved order does have valid rows
  activeBusinessId: BIZ_A,
  loadedBusinessId: BIZ_A,
  msSinceLastSave: 60000,
};

describe("CreateOrder autosave guard", () => {
  it("opening an order and waiting past the interval does NOT write", () => {
    // This is the exact situation that mutated ORD-20260816-0001.
    expect(shouldAutosave(viewingExistingOrder)).toBe(false);
  });

  it("viewing is not made writable by having valid rows alone", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, validRowCount: 99 })).toBe(false);
  });

  it("an explicit edit enables autosave", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, isDirty: true })).toBe(true);
  });

  it("an edited form with nothing valid still does not write", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, isDirty: true, validRowCount: 0 })).toBe(false);
  });

  it("switching company stops autosave for the open form", () => {
    // Company A's order is dirty on screen, user switches to company B.
    expect(
      shouldAutosave({ ...viewingExistingOrder, isDirty: true, activeBusinessId: BIZ_B })
    ).toBe(false);
  });

  it("a cross-business form is never autosaved even when dirty and valid", () => {
    expect(
      shouldAutosave({
        ...viewingExistingOrder,
        isDirty: true,
        loadedBusinessId: BIZ_B,
        activeBusinessId: BIZ_A,
      })
    ).toBe(false);
  });

  it("no authenticated user means no write", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, isDirty: true, user: false })).toBe(false);
  });

  it("no business context at all means no write", () => {
    expect(
      shouldAutosave({
        ...viewingExistingOrder,
        isDirty: true,
        activeBusinessId: null,
        loadedBusinessId: BIZ_A,
      })
    ).toBe(false);
  });

  it("does not re-save within the debounce window", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, isDirty: true, msSinceLastSave: 1000 })).toBe(false);
  });

  it("a save in flight is not duplicated", () => {
    expect(shouldAutosave({ ...viewingExistingOrder, isDirty: true, saving: true })).toBe(false);
  });
});
