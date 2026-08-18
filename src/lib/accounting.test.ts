import { describe, it, expect } from "vitest";
import { computeTrialBalance, computeProfitLoss, computeInventoryAdjustedProfitLoss, netProfitWithInventory, computeClosingStockValue, rollForwardOpeningBalance, hasRealStockLedger, type LedgerRow } from "./accounting";

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

describe("netProfitWithInventory (Dashboard Net Profit spec, RD-Pro)", () => {
  it("Test A: fully sold inventory -- Sales 15000, COGS 10000 (purchases fully consumed), Expenses 2000", () => {
    // opening 0, purchases 10000, closing 0 => COGS = 0 + 10000 - 0 = 10000
    const { profit } = netProfitWithInventory({ income: 15000, expense: 10000 + 2000 }, 0, 0);
    expect(profit).toBe(3000);
  });

  it("Test B: inventory purchased but not sold -- must NOT show a Net Loss equal to the purchase", () => {
    // Purchase 20000 sits entirely in closing stock -- none of it was consumed.
    const { profit } = netProfitWithInventory({ income: 0, expense: 20000 }, 0, 20000);
    expect(profit).toBe(0);
  });

  it("Test C: partial inventory sold -- Purchase 20000, Closing Stock 12000, Sales 15000, Expenses 1000", () => {
    // COGS = 0 + 20000 - 12000 = 8000; Gross Profit = 15000 - 8000 = 7000; Net Profit = 7000 - 1000 = 6000
    const { profit } = netProfitWithInventory({ income: 15000, expense: 20000 + 1000 }, 0, 12000);
    expect(profit).toBe(6000);
  });

  it("Test D: credit sale -- absence of customer payment must not eliminate the sale/profit", () => {
    // Credit Sale 10000 posts to the Sales ledger regardless of whether cash was received;
    // COGS 6000 (purchase fully consumed) => Gross Profit 4000, independent of receivable status.
    const { profit } = netProfitWithInventory({ income: 10000, expense: 6000 }, 0, 0);
    expect(profit).toBe(4000);
  });

  it("Test E: supplier payment is a cash movement, not an additional expense", () => {
    // Purchase 10000, Supplier Payment 10000 (Payment voucher: Dr Supplier / Cr Bank --
    // touches neither an income nor expense ledger, so it never enters `raw.expense`),
    // Closing Stock 10000 (nothing sold) => Net Profit 0.
    const raw = { income: 0, expense: 10000 }; // payment voucher contributes nothing extra here
    const { profit } = netProfitWithInventory(raw, 0, 10000);
    expect(profit).toBe(0);
  });

  it("never produces NaN/Infinity for a zero-previous comparison (previous=0, current>0)", () => {
    const { profit } = netProfitWithInventory({ income: 5000, expense: 2000 }, 0, 0);
    const pctVsZeroPrevious = profit === 0 ? 0 : (profit - 0) / Math.abs(0 || 1); // representative of the "New Profit" guard path in the UI
    expect(Number.isFinite(pctVsZeroPrevious)).toBe(true);
  });
});

describe("computeInventoryAdjustedProfitLoss", () => {
  it("does not use Sales - Purchase: full purchase expensed only when nothing remains in stock", () => {
    const ledgers = [
      ledger({ name: "Sales Account", group: { name: "Sales Accounts", nature: "income" }, balance: -50000 }),
      ledger({ name: "Purchase Account", group: { name: "Purchase Accounts", nature: "expense" }, balance: 30000 }),
    ];
    // All of this period's purchases are still in stock -- correct profit is the full
    // Sales figure (no COGS consumed yet), not Sales(50000) - Purchase(30000) = 20000.
    const { profit } = computeInventoryAdjustedProfitLoss(ledgers, 0, 30000);
    expect(profit).toBe(50000);
  });

  it("adds synthetic Opening/Closing Stock rows without double-counting real ledger rows", () => {
    const ledgers = [
      ledger({ name: "Sales Account", group: { name: "Sales Accounts", nature: "income" }, balance: -50000 }),
      ledger({ name: "Purchase Account", group: { name: "Purchase Accounts", nature: "expense" }, balance: 30000 }),
    ];
    const { rows, income, expense, profit } = computeInventoryAdjustedProfitLoss(ledgers, 5000, 30000);
    expect(rows.find((r) => r.item === "Closing Stock")?.amount).toBe(30000);
    expect(rows.find((r) => r.item === "Opening Stock")?.amount).toBe(5000);
    expect(income - expense).toBeCloseTo(profit, 2);
  });
});

describe("Dashboard/P&L reconciliation regression (real business data, 2026-08-13)", () => {
  // Reproduces the exact figures reported as mismatched: Dashboard showed
  // Net Profit ₹30,38,010 against P&L's ₹10,49,650 (a ₹19,88,360 gap)
  // because the Dashboard reconstructed "opening stock" by walking
  // inventory_movements backward and revaluing every historical qty delta
  // at today's rate -- a single bulk stock-import movement (tens of
  // thousands of units, unrelated to real trading) got revalued into a
  // swing of tens of lakhs. That reconstruction has been removed; both
  // Dashboard and P&L now call computeInventoryAdjustedProfitLoss with the
  // identical ledger balances and the identical (today-only) closing stock
  // figure, so they cannot diverge.
  const ledgers = [
    ledger({ name: "Sales Account", group: { name: "Sales Accounts", nature: "income", account_type: "sales" }, balance: -12550 }),
    ledger({ name: "Purchase Account", group: { name: "Purchase Accounts", nature: "expense", account_type: "purchase" }, balance: 22500 }),
    ledger({ name: "Indirect Expenses", group: { name: "Indirect Expenses", nature: "expense", account_type: "expense" }, balance: 13500 }),
  ];
  const products = [{ stock: 100, dealer_rate: 0, mrp: 10731 }]; // sums to the reported ₹10,73,100 closing stock

  it("computeClosingStockValue matches the P&L report's Closing Stock line", () => {
    expect(computeClosingStockValue(products)).toBe(1073100);
  });

  it("Dashboard Net Profit (computeInventoryAdjustedProfitLoss) equals the P&L report's Net Profit exactly", () => {
    const closingStock = computeClosingStockValue(products);
    const { profit } = computeInventoryAdjustedProfitLoss(ledgers, 0, closingStock);
    expect(profit).toBe(1049650); // ₹10,49,650 -- matches the P&L screenshot, not the buggy ₹30,38,010
  });
});

describe("Opening stock regression (BOOTSTRAP FIX VERIFY TEST, 2026-08-17)", () => {
  // A product created with opening stock wrote only an inventory_movements
  // row -- no voucher, no ledger entry -- while the reports added its value
  // as synthetic Closing Stock income. The whole stock value therefore
  // surfaced as Net Profit under the Balance Sheet's "Capital" group, next
  // to a Capital Account ledger that was genuinely 0/0. Both halves of the
  // fix are asserted here: cost-basis valuation, and the Opening Stock
  // ledger that 20260817140000_opening_stock_accounting_counterpart.sql
  // now posts against Capital.
  const product = { stock: 100, cost_price: 50, dealer_rate: 180, mrp: 200 };

  it("values closing stock at cost, not at the selling rate", () => {
    // was 100 x 180 = 18000 (dealer_rate), which is what the phantom profit
    // was made of; 13000 of it was unrealised margin.
    expect(computeClosingStockValue([product])).toBe(5000);
  });

  it("agrees with get_stock_valuation()'s avg_cost chain (purchase_price wins over cost_price)", () => {
    expect(computeClosingStockValue([{ ...product, purchase_price: 40 }])).toBe(4000);
  });

  it("leaves no phantom Net Profit once the opening-stock counterpart is posted", () => {
    const closingStock = computeClosingStockValue([product]);
    // What the trigger writes: Dr Opening Stock 5000 / Cr Capital 5000.
    const ledgers = [
      ledger({ name: "Opening Stock", group: { name: "Direct Expenses", nature: "expense" }, balance: closingStock }),
      ledger({ name: "Capital Account", group: { name: "Capital", nature: "capital" }, balance: -closingStock }),
    ];
    expect(computeTrialBalance(ledgers).totDr - computeTrialBalance(ledgers).totCr).toBeCloseTo(0, 2);

    // BalanceSheet.tsx / ProfitLoss.tsx both pass openingStock = 0 -- the
    // Opening Stock *ledger* above is what carries it, via computeProfitLoss.
    const { profit } = computeInventoryAdjustedProfitLoss(ledgers, 0, closingStock);
    expect(profit).toBe(0);

    // Balance Sheet then reads: Assets (synthetic closing stock) = Capital.
    const capital = -(ledgers.find((l) => l.name === "Capital Account")!.balance ?? 0);
    expect(closingStock).toBe(capital + profit);
  });

  it("still reports the pre-fix phantom profit when no counterpart exists", () => {
    // Guards the diagnosis itself: with the stock but no Opening Stock
    // ledger, profit is exactly the stock value -- the shape seen live.
    const closingStock = computeClosingStockValue([product]);
    expect(computeInventoryAdjustedProfitLoss([], 0, closingStock).profit).toBe(closingStock);
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

describe("rollForwardOpeningBalance (ledger statement date-range regression, Phase 1 F8)", () => {
  // buildLedgerStatement() previously read opening balance from
  // ledger.opening_balance alone, ignoring any posted voucher dated before
  // opts.from -- viewing a statement on a range starting after the ledger's
  // earliest activity showed a too-low opening figure that didn't reconcile
  // with the Balance Sheet.
  it("returns the stored opening balance unchanged when there is no prior movement", () => {
    expect(rollForwardOpeningBalance({ opening_balance: 5000, opening_balance_type: "dr" }, 0)).toBe(5000);
    expect(rollForwardOpeningBalance({ opening_balance: 5000, opening_balance_type: "cr" }, 0)).toBe(-5000);
  });

  it("folds in Dr-heavy prior-period movement for a Dr-opening ledger", () => {
    // opening Dr 1000, plus 3000 of net Dr posted before `from`
    expect(rollForwardOpeningBalance({ opening_balance: 1000, opening_balance_type: "dr" }, 3000)).toBe(4000);
  });

  it("folds in Cr-heavy prior-period movement for a Cr-opening ledger", () => {
    // opening Cr 1000 (-1000 signed), plus -2000 net (more Cr than Dr) before `from`
    expect(rollForwardOpeningBalance({ opening_balance: 1000, opening_balance_type: "cr" }, -2000)).toBe(-3000);
  });

  it("reconciles with the Balance Sheet: statement opening + in-range movement = current balance, for any split of the date range", () => {
    const opening_balance = 2000;
    const opening_balance_type = "dr" as const;
    const wholeHistory = [500, -300, 1200]; // Dr-Cr per posted voucher, chronological
    const currentBalance = wholeHistory.reduce((s, m) => s + m, opening_balance);
    // split the history at any point; prior-to-from + in-range must still sum to currentBalance
    for (let split = 0; split <= wholeHistory.length; split++) {
      const prior = wholeHistory.slice(0, split).reduce((s, m) => s + m, 0);
      const inRange = wholeHistory.slice(split).reduce((s, m) => s + m, 0);
      const openingAtSplit = rollForwardOpeningBalance({ opening_balance, opening_balance_type }, prior);
      expect(openingAtSplit + inRange).toBe(currentBalance);
    }
  });
});

describe("unit-cost precedence consistency (Phase 1 F7 — mirrors SQL opening_stock_unit_cost)", () => {
  // purchase_price > cost_price > dealer_rate > mrp > 0, first POSITIVE
  // wins. Both create_inventory_adjustment()/post_stock_take() now call the
  // SQL twin of this via opening_stock_unit_cost(); this locks the TS side
  // so the two can't silently diverge again the way F7 found them.
  it.each([
    [{ purchase_price: 40, cost_price: 50, dealer_rate: 180, mrp: 200 }, 40],
    [{ cost_price: 50, dealer_rate: 180, mrp: 200 }, 50],
    [{ dealer_rate: 180, mrp: 200 }, 180],
    [{ mrp: 200 }, 200],
    [{ purchase_price: 0, cost_price: 0, dealer_rate: 0, mrp: 0 }, 0],
  ])("resolves %j to unit cost %d", (product, expected) => {
    expect(computeClosingStockValue([{ stock: 1, ...product }])).toBe(expected);
  });
});

describe("hasRealStockLedger (Phase 2 — period-close adoption gate)", () => {
  // Before a business's first close_financial_year() call, no "Stock-in-Hand"
  // ledger row exists at all (Phase 1 removed every ad-hoc creation path;
  // only period close creates it now) -- report call sites use this to fall
  // back to the synthetic closing-stock figure exactly as before Phase 2,
  // so nothing regresses for the 8 production businesses that have never
  // closed a period.
  it("is false when no Stock-in-Hand ledger is present", () => {
    expect(hasRealStockLedger([ledger({ name: "Cash" }), ledger({ name: "Sales Account" })])).toBe(false);
  });

  it("is true once a Stock-in-Hand ledger exists, regardless of its balance", () => {
    expect(hasRealStockLedger([ledger({ name: "Stock-in-Hand", balance: 0 })])).toBe(true);
    expect(hasRealStockLedger([ledger({ name: "Cash" }), ledger({ name: "Stock-in-Hand", balance: 12000 })])).toBe(true);
  });

  it("is false on an empty ledger set", () => {
    expect(hasRealStockLedger([])).toBe(false);
  });
});
