import { describe, it, expect } from "vitest";
import { classifyCashFlowLine } from "./cashFlow";

describe("classifyCashFlowLine", () => {
  it("classifies a Fixed Assets sibling as investing", () => {
    expect(classifyCashFlowLine(["Fixed Assets"], [false])).toBe("investing");
  });

  it("classifies a Capital sibling as financing", () => {
    expect(classifyCashFlowLine(["Capital"], [false])).toBe("financing");
  });

  it("classifies a Loans sibling as financing", () => {
    expect(classifyCashFlowLine(["Loans"], [false])).toBe("financing");
  });

  it("classifies trade/income/expense siblings (Sundry Debtors, Sales, etc.) as operating", () => {
    expect(classifyCashFlowLine(["Sundry Debtors"], [false])).toBe("operating");
    expect(classifyCashFlowLine(["Sales Accounts"], [false])).toBe("operating");
    expect(classifyCashFlowLine(["Indirect Expenses"], [false])).toBe("operating");
    expect(classifyCashFlowLine(["Duties & Taxes"], [false])).toBe("operating");
  });

  it("treats a voucher with only cash/bank siblings as an internal transfer (Contra)", () => {
    expect(classifyCashFlowLine(["Bank"], [true])).toBe("internal");
  });

  it("does not treat a mixed cash+non-cash sibling set as internal", () => {
    // e.g. a receipt partly against a party, never actually possible on a
    // single leg, but the classifier must not accidentally short-circuit
    // to "internal" just because ANY sibling is cash/bank.
    expect(classifyCashFlowLine(["Sundry Debtors"], [false, true])).not.toBe("internal");
  });

  it("Fixed Assets takes priority over Capital when a purchase is partly loan-funded", () => {
    expect(classifyCashFlowLine(["Fixed Assets", "Loans"], [false, false])).toBe("investing");
  });

  it("defaults to operating with no siblings recognized (defensive fallback)", () => {
    expect(classifyCashFlowLine([], [])).toBe("operating");
  });
});
