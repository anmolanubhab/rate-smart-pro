import { describe, it, expect } from "vitest";
import { calculateTotals, validateVoucher, validateContraLegs, validateContraInstrument, type VoucherItem } from "./voucherService";

const item = (debit: number, credit: number, ledger = "l1"): VoucherItem => ({
  ledger_account_id: ledger,
  debit,
  credit,
  remarks: "",
});

describe("calculateTotals", () => {
  it("sums debit and credit independently and flags balance", () => {
    const t = calculateTotals([item(100, 0, "a"), item(0, 100, "b")]);
    expect(t.totalDebit).toBe(100);
    expect(t.totalCredit).toBe(100);
    expect(t.isBalanced).toBe(true);
  });

  it("flags an unbalanced set of items", () => {
    const t = calculateTotals([item(150, 0, "a"), item(0, 100, "b")]);
    expect(t.difference).toBe(50);
    expect(t.isBalanced).toBe(false);
  });
});

// Every voucher type (Sales, Purchase, Receipt, Payment, Contra, Journal,
// Credit Note, Debit Note) is created through the same createVoucher/
// postVoucher path and validated by this one function -- these cases cover
// the balance invariant for all of them at once.
describe("validateVoucher — Dr = Cr invariant, shared by every voucher type", () => {
  const base = { voucher_type: "Journal" as const, voucher_date: "2026-01-01" };

  it("accepts a balanced two-leg voucher when balance is required (post-time)", () => {
    const r = validateVoucher({ ...base, items: [item(500, 0, "a"), item(0, 500, "b")] }, { requireBalanced: true });
    expect(r.valid).toBe(true);
  });

  it("rejects posting an unbalanced voucher", () => {
    const r = validateVoucher({ ...base, items: [item(500, 0, "a"), item(0, 300, "b")] }, { requireBalanced: true });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Debit must equal Total Credit/);
  });

  it("allows an unbalanced draft to be saved (balance only enforced at post time)", () => {
    const r = validateVoucher({ ...base, items: [item(500, 0, "a"), item(0, 300, "b")] });
    expect(r.valid).toBe(true);
  });

  it("rejects a row with both debit and credit filled", () => {
    const r = validateVoucher({ ...base, items: [item(100, 100, "a"), item(0, 100, "b")] });
    expect(r.errors.join(" ")).toMatch(/cannot have both Debit and Credit/);
  });

  it("rejects a row with neither debit nor credit", () => {
    const r = validateVoucher({ ...base, items: [item(0, 0, "a"), item(0, 100, "b")] });
    expect(r.errors.join(" ")).toMatch(/non-zero Debit or Credit/);
  });

  it("rejects fewer than two ledger rows", () => {
    const r = validateVoucher({ ...base, items: [item(100, 0, "a")] });
    expect(r.errors.join(" ")).toMatch(/At least two ledger account rows/);
  });

  it("rejects a row with no ledger selected", () => {
    const r = validateVoucher({ ...base, items: [item(100, 0, ""), item(0, 100, "b")] });
    expect(r.errors.join(" ")).toMatch(/ledger account selected/);
  });
});

describe("validateContraLegs — Contra voucher specific rules", () => {
  it("rejects a cash-to-cash transfer", () => {
    const r = validateContraLegs(
      [item(1000, 0, "cash1"), item(0, 1000, "cash2")],
      { cash1: "cash", cash2: "cash" }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Cash to Cash transfer/);
  });

  it("allows a cash-to-bank transfer", () => {
    const r = validateContraLegs(
      [item(1000, 0, "bank1"), item(0, 1000, "cash1")],
      { bank1: "bank", cash1: "cash" }
    );
    expect(r.valid).toBe(true);
  });

  it("rejects the same ledger used for both legs", () => {
    const r = validateContraLegs(
      [item(1000, 0, "bank1"), item(0, 1000, "bank1")],
      { bank1: "bank" }
    );
    expect(r.errors.join(" ")).toMatch(/cannot be the same ledger/);
  });
});

describe("validateContraInstrument", () => {
  it("requires cheque number and date for Cheque", () => {
    const r = validateContraInstrument("Cheque", null, null);
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it("requires a reference number for NEFT", () => {
    const r = validateContraInstrument("NEFT", null, null);
    expect(r.errors.join(" ")).toMatch(/UTR \/ Reference Number/);
  });

  it("Cash needs no reference details", () => {
    const r = validateContraInstrument("Cash", null, null);
    expect(r.valid).toBe(true);
  });
});
