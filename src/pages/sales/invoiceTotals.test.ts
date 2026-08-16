import { describe, it, expect } from "vitest";

// Regression for "Total Value counts cancelled invoices".
//
// The Invoices page summed grand_total across every filtered row, so a
// cancelled invoice — already reversed out of the ledger, its auto-posted
// sales voucher cancelled with it — still inflated the money KPI. Counts
// (Invoices / Posted) are status breakdowns and must keep counting every row;
// only the money figures exclude cancelled.

interface InvoiceRow {
  status: "draft" | "posted" | "cancelled";
  grand_total: number;
}

/** Mirrors the `totals` reducer in src/pages/sales/Invoices.tsx. */
function summarise(rows: InvoiceRow[]) {
  return rows.reduce(
    (acc, i) => {
      acc.count += 1;
      if (i.status !== "cancelled") acc.amount += Number(i.grand_total) || 0;
      if (i.status === "posted") acc.posted += 1;
      return acc;
    },
    { count: 0, amount: 0, posted: 0 }
  );
}

/** Mirrors the page-total footer in the same file. */
function pageTotal(rows: InvoiceRow[]) {
  return rows.reduce((s, i) => (i.status === "cancelled" ? s : s + Number(i.grand_total)), 0);
}

describe("Invoices — Total Value excludes cancelled", () => {
  it("a posted invoice contributes to Total Value", () => {
    const t = summarise([{ status: "posted", grand_total: 171 }]);
    expect(t.amount).toBe(171);
    expect(t.posted).toBe(1);
    expect(t.count).toBe(1);
  });

  it("a cancelled invoice does not contribute to Total Value", () => {
    const t = summarise([
      { status: "posted", grand_total: 171 },
      { status: "cancelled", grand_total: 342.2 },
    ]);
    expect(t.amount, "cancelled invoice must not inflate the money KPI").toBe(171);
    // …but it is still a real row, so the counts must not hide it.
    expect(t.count).toBe(2);
    expect(t.posted).toBe(1);
  });

  it("a draft invoice still contributes (only cancellation reverses value)", () => {
    const t = summarise([{ status: "draft", grand_total: 100 }]);
    expect(t.amount).toBe(100);
    expect(t.posted).toBe(0);
  });

  it("deleting a cancelled invoice leaves the total unchanged", () => {
    const before = summarise([
      { status: "posted", grand_total: 171 },
      { status: "cancelled", grand_total: 342.2 },
    ]);
    const afterDelete = summarise([{ status: "posted", grand_total: 171 }]);

    expect(afterDelete.amount).toBe(before.amount);
    expect(afterDelete.count).toBe(before.count - 1);
  });

  it("the page-total footer applies the same rule", () => {
    const rows: InvoiceRow[] = [
      { status: "posted", grand_total: 171 },
      { status: "cancelled", grand_total: 342.2 },
      { status: "posted", grand_total: 29 },
    ];
    expect(pageTotal(rows)).toBe(200);
    expect(pageTotal(rows)).toBe(summarise(rows).amount);
  });
});
