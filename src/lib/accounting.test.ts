import { describe, it, expect } from "vitest";
import { computeTrialBalance, computeProfitLoss, type LedgerRow } from "./accounting";

const ledger = (over: Partial<LedgerRow>): LedgerRow => ({
  id: over.id ?? Math.random().toString(),
  name: over.name ?? "Ledger",
  ledger_type: over.ledger_type ?? "customer",
  group_id: over.group_id ?? null,
  party_id: over.party_id ?? null,
  opening_balance: over.opening_balance ?? 0,
  opening_balance_type: over.opening_balance_type ?? "dr",
  is_system: over.is_system ?? false,
  status: over.status ?? "active",
  group: over.group ?? null,
  balance: over.balance,
});

describe("computeTrialBalance", () => {
  it("splits positive balances to Debit and negative to Credit, and totals match", () => {
    const { rows, totDr, totCr } = computeTrialBalance([
      ledger({ name: "Cash", balance: 5000 }),
      ledger({ name: "Sales Account", balance: -5000 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.ledger === "Cash")?.dr).toBe(5000);
    expect(rows.find((r) => r.ledger === "Sales Account")?.cr).toBe(5000);
    expect(totDr).toBe(5000);
    expect(totCr).toBe(5000);
  });

  it("Debit = Credit for any set of balances that nets to zero (the core double-entry invariant)", () => {
    const balances = [1200, -300, -900, 450, -450];
    const { totDr, totCr } = computeTrialBalance(balances.map((b, i) => ledger({ name: `L${i}`, balance: b })));
    expect(totDr - totCr).toBeCloseTo(0, 2);
  });

  it("excludes zero-balance ledgers from the report", () => {
    const { rows } = computeTrialBalance([ledger({ name: "Dormant", balance: 0 }), ledger({ name: "Live", balance: 10 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ledger).toBe("Live");
  });
});

describe("computeProfitLoss", () => {
  it("flips sign for credit-natured income and keeps debit-natured expense as-is", () => {
    // Income ledgers accumulate as negative balance (Cr); expense as positive (Dr).
    const { income, expense, profit } = computeProfitLoss([
      ledger({ name: "Sales Account", group: { name: "Sales Accounts", nature: "income" }, balance: -100000 }),
      ledger({ name: "Rent", group: { name: "Indirect Expenses", nature: "expense" }, balance: 30000 }),
    ]);
    expect(income).toBe(100000);
    expect(expense).toBe(30000);
    expect(profit).toBe(70000);
  });

  it("reports a loss when expense exceeds income", () => {
    const { profit } = computeProfitLoss([
      ledger({ group: { name: "Sales Accounts", nature: "income" }, balance: -10000 }),
      ledger({ group: { name: "Indirect Expenses", nature: "expense" }, balance: 25000 }),
    ]);
    expect(profit).toBe(-15000);
  });

  it("ignores asset/liability/capital ledgers entirely", () => {
    const { income, expense } = computeProfitLoss([
      ledger({ group: { name: "Cash", nature: "asset" }, balance: 99999 }),
      ledger({ group: { name: "Sundry Creditors", nature: "liability" }, balance: -99999 }),
    ]);
    expect(income).toBe(0);
    expect(expense).toBe(0);
  });
});

describe("Balance Sheet equation: Assets = Liabilities + Capital + P&L", () => {
  it("holds for a balanced double-entry ledger set (mirrors BalanceSheet.tsx's own aggregation)", () => {
    const ledgers = [
      ledger({ name: "Cash", group: { name: "Cash", nature: "asset" }, balance: 40000 }),
      ledger({ name: "Sundry Debtors", group: { name: "Sundry Debtors", nature: "asset" }, balance: 20000 }),
      ledger({ name: "Sundry Creditors", group: { name: "Sundry Creditors", nature: "liability" }, balance: -15000 }),
      ledger({ name: "Owner Capital", group: { name: "Capital", nature: "capital" }, balance: -25000 }),
      ledger({ name: "Sales Account", group: { name: "Sales Accounts", nature: "income" }, balance: -50000 }),
      ledger({ name: "Purchase Account", group: { name: "Purchase Accounts", nature: "expense" }, balance: 30000 }),
    ];
    // trial balance must be balanced first -- otherwise this wouldn't be a
    // valid input a real ledger set could ever produce.
    const { totDr, totCr } = computeTrialBalance(ledgers);
    expect(totDr - totCr).toBeCloseTo(0, 2);

    const { profit } = computeProfitLoss(ledgers);
    const nature = (l: LedgerRow) => l.group?.nature;
    const asset = ledgers.filter((l) => nature(l) === "asset").reduce((s, l) => s + Math.abs(l.balance ?? 0), 0);
    const liabPlusCapital = ledgers
      .filter((l) => nature(l) === "liability" || nature(l) === "capital")
      .reduce((s, l) => s + Math.abs(l.balance ?? 0), 0);

    expect(asset).toBeCloseTo(liabPlusCapital + profit, 2);
  });
});
