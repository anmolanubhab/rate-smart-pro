import { describe, it, expect } from "vitest";
import { validateLedgerImportRows, validatePartyImportRows, validateStockImportRows, parseCsv } from "./migrationImport";

const ledgers = [
  { id: "L1", name: "Cash Account" },
  { id: "L2", name: "Capital Account" },
];

const parties = [
  { id: "P1", name: "Acme Traders", preferred_customer: true, preferred_supplier: false },
  { id: "P2", name: "Bharat Suppliers", preferred_customer: false, preferred_supplier: true },
  { id: "P3", name: "Unclassified Party", preferred_customer: false, preferred_supplier: false },
];

describe("parseCsv", () => {
  it("strips quotes, trims cells, and drops blank lines", () => {
    const rows = parseCsv('"Cash Account",Cash,"50000",Dr\n\nCapital Account,Capital,50000,Cr\n');
    expect(rows).toEqual([
      ["Cash Account", "Cash", "50000", "Dr"],
      ["Capital Account", "Capital", "50000", "Cr"],
    ]);
  });
});

describe("validateLedgerImportRows — real CSV fixture", () => {
  const fixture = [
    "Ledger Name,Group,Opening Balance,Dr/Cr",
    "Cash Account,Cash,50000,Dr",
    "Capital Account,Capital,50000,Cr",
    "Cash Account,Cash,10000,Dr",           // duplicate ledger in file
    "Unknown Ledger,Misc,1000,Dr",          // unknown ledger
    "Capital Account,Capital,-500,Cr",      // will collide with dup-name check first? no — Capital Account already seen above, so this row's dup is fine as its own case below
  ].join("\n");

  const result = validateLedgerImportRows(fixture, ledgers);

  it("accepts the two genuinely valid rows", () => {
    expect(result.valid).toEqual([
      { ledgerId: "L1", amount: 50000, drCr: "dr" },
      { ledgerId: "L2", amount: 50000, drCr: "cr" },
    ]);
  });

  it("flags the duplicate ledger row", () => {
    expect(result.errors.some((e) => /Row 4.*duplicate ledger "Cash Account"/.test(e))).toBe(true);
  });

  it("flags the unknown ledger row", () => {
    expect(result.errors.some((e) => /Row 5.*unknown ledger "Unknown Ledger"/.test(e))).toBe(true);
  });

  it("flags the second Capital Account row as a duplicate before amount is even checked", () => {
    expect(result.errors.some((e) => /Row 6.*duplicate ledger "Capital Account"/.test(e))).toBe(true);
  });

  it("produces exactly one error per bad row, no silent drops", () => {
    expect(result.errors).toHaveLength(3);
  });
});

describe("validateLedgerImportRows — invalid amount and Dr/Cr", () => {
  it("rejects a negative amount", () => {
    const csv = "Ledger Name,Group,Opening Balance,Dr/Cr\nCash Account,Cash,-100,Dr";
    const result = validateLedgerImportRows(csv, ledgers);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Row 2.*invalid amount "-100"/);
  });

  it("rejects a non-numeric amount", () => {
    const csv = "Ledger Name,Group,Opening Balance,Dr/Cr\nCash Account,Cash,abc,Dr";
    const result = validateLedgerImportRows(csv, ledgers);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Row 2.*invalid amount "abc"/);
  });

  it("rejects an invalid Dr/Cr token", () => {
    const csv = "Ledger Name,Group,Opening Balance,Dr/Cr\nCash Account,Cash,5000,Debit";
    const result = validateLedgerImportRows(csv, ledgers);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Row 2.*Dr\/Cr must be "Dr" or "Cr", got "Debit"/);
  });

  it("accepts case-insensitive dr/cr", () => {
    const csv = "Ledger Name,Group,Opening Balance,Dr/Cr\nCash Account,Cash,5000,DR\nCapital Account,Capital,5000,cr";
    const result = validateLedgerImportRows(csv, ledgers);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toEqual([
      { ledgerId: "L1", amount: 5000, drCr: "dr" },
      { ledgerId: "L2", amount: 5000, drCr: "cr" },
    ]);
  });
});

describe("validatePartyImportRows — real CSV fixture", () => {
  const fixture = [
    "Party Name,Party Type,Opening Balance,Dr/Cr",
    "Acme Traders,Customer,15000,Dr",
    "Bharat Suppliers,Supplier,25000,Cr",
    "Acme Traders,Customer,999,Dr",              // duplicate party in file
    "Ghost Party,Customer,1000,Dr",               // unknown party
    "Unclassified Party,Customer,500,Dr",         // exists but not classified as customer/supplier
    "Bharat Suppliers,Supplier,abc,Cr",           // would also be a dup, but proves dup check runs before amount check
  ].join("\n");

  const result = validatePartyImportRows(fixture, parties);

  it("accepts the two genuinely valid rows", () => {
    expect(result.valid).toEqual([
      { partyId: "P1", amount: 15000, drCr: "dr" },
      { partyId: "P2", amount: 25000, drCr: "cr" },
    ]);
  });

  it("flags duplicate, unknown, and unclassified-party rows distinctly", () => {
    expect(result.errors[0]).toMatch(/Row 4.*duplicate party "Acme Traders"/);
    expect(result.errors[1]).toMatch(/Row 5.*unknown party "Ghost Party"/);
    expect(result.errors[2]).toMatch(/Row 6.*not classified as Customer or Supplier/);
    expect(result.errors[3]).toMatch(/Row 7.*duplicate party "Bharat Suppliers"/);
    expect(result.errors).toHaveLength(4);
  });
});

const products = [
  { id: "PR1", part_number: "P001", name: "Oil" },
  { id: "PR2", part_number: "P002", name: "Filter" },
];

describe("validateStockImportRows — real CSV fixture", () => {
  const fixture = [
    "Part Number,Product,Opening Qty,Opening Cost",
    "P001,Oil,100,500",
    "P002,Filter,200,150",
    "P001,Oil,50,500",              // duplicate part number in file
    "P999,Ghost,10,100",            // unknown part number
  ].join("\n");

  const result = validateStockImportRows(fixture, products);

  it("accepts the two genuinely valid rows", () => {
    expect(result.valid).toEqual([
      { productId: "PR1", qty: 100, unitCost: 500 },
      { productId: "PR2", qty: 200, unitCost: 150 },
    ]);
  });

  it("flags the duplicate and unknown part number rows distinctly", () => {
    expect(result.errors[0]).toMatch(/Row 4.*duplicate part number "P001"/);
    expect(result.errors[1]).toMatch(/Row 5.*unknown part number "P999"/);
    expect(result.errors).toHaveLength(2);
  });
});

describe("validateStockImportRows — invalid qty and cost", () => {
  it("rejects a negative qty", () => {
    const csv = "Part Number,Product,Opening Qty,Opening Cost\nP001,Oil,-5,500";
    const result = validateStockImportRows(csv, products);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Row 2.*invalid opening qty "-5"/);
  });

  it("rejects a non-numeric cost", () => {
    const csv = "Part Number,Product,Opening Qty,Opening Cost\nP001,Oil,100,abc";
    const result = validateStockImportRows(csv, products);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Row 2.*invalid opening cost "abc"/);
  });

  it("accepts zero qty (a product being zeroed out)", () => {
    const csv = "Part Number,Product,Opening Qty,Opening Cost\nP001,Oil,0,0";
    const result = validateStockImportRows(csv, products);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toEqual([{ productId: "PR1", qty: 0, unitCost: 0 }]);
  });
});
