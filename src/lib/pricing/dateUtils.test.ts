import { describe, it, expect } from "vitest";
import { localDateISO, addDaysISO } from "./dateUtils";

describe("localDateISO", () => {
  it("uses the local calendar date, not UTC", () => {
    // Just after local midnight — in a UTC-behind timezone (e.g. IST,
    // UTC+5:30) toISOString().slice(0,10) at this instant would still read
    // as the PREVIOUS day. localDateISO must read the local day instead.
    const d = new Date(2026, 0, 15, 0, 30); // 15 Jan 2026, 00:30 local
    expect(localDateISO(d)).toBe("2026-01-15");
  });

  it("pads single-digit month/day", () => {
    const d = new Date(2026, 0, 5); // 5 Jan 2026
    expect(localDateISO(d)).toBe("2026-01-05");
  });
});

describe("addDaysISO", () => {
  it("subtracts a day, crossing month boundaries", () => {
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds a day, crossing year boundaries", () => {
    expect(addDaysISO("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("is a no-op for +0 days", () => {
    expect(addDaysISO("2026-06-15", 0)).toBe("2026-06-15");
  });
});
