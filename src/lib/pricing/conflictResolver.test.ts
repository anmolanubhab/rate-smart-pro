import { describe, it, expect } from "vitest";
import { resolveConflicts, type RuleCandidate } from "./conflictResolver";

let seq = 0;
function rule(overrides: Partial<RuleCandidate>): RuleCandidate {
  seq += 1;
  return {
    ruleId: `rule-${seq}`,
    ruleType: "PARTY_DISCOUNT",
    name: `Rule ${seq}`,
    priority: 100,
    version: 1,
    benefitType: "PERCENT_DISCOUNT",
    value: 5,
    freeProductId: null,
    freeQty: null,
    maxBenefitAmount: null,
    approvalRequired: false,
    stackingMode: "USE_BUSINESS_DEFAULT",
    ...overrides,
  };
}

describe("resolveConflicts", () => {
  it("applies ADD_TOGETHER rules together", () => {
    const rules = [
      rule({ stackingMode: "ADD_TOGETHER", value: 10, priority: 1 }),
      rule({ stackingMode: "ADD_TOGETHER", value: 3, priority: 2 }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "rule_based");
    expect(applied).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it("keeps only the best rule within a HIGHEST_WINS group and rejects the rest", () => {
    const rules = [
      rule({ stackingMode: "HIGHEST_WINS", value: 5, name: "Five", priority: 1 }),
      rule({ stackingMode: "HIGHEST_WINS", value: 12, name: "Twelve", priority: 2 }),
      rule({ stackingMode: "HIGHEST_WINS", value: 8, name: "Eight", priority: 3 }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "rule_based");
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("Twelve");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.decision === "rejected_lower_priority")).toBe(true);
  });

  it("keeps only the smallest rule within a LOWEST_WINS group", () => {
    const rules = [
      rule({ stackingMode: "LOWEST_WINS", value: 5, name: "Five" }),
      rule({ stackingMode: "LOWEST_WINS", value: 2, name: "Two" }),
    ];
    const { applied } = resolveConflicts(rules, "rule_based");
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("Two");
  });

  it("an EXCLUSIVE rule blocks every lower-priority rule for the line", () => {
    const rules = [
      rule({ stackingMode: "EXCLUSIVE", name: "Coupon", priority: 1 }),
      rule({ stackingMode: "ADD_TOGETHER", name: "Festival", priority: 2 }),
      rule({ stackingMode: "ADD_TOGETHER", name: "Item Discount", priority: 3 }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "rule_based");
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("Coupon");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.decision === "rejected_exclusive")).toBe(true);
  });

  it("does not let a higher-priority EXCLUSIVE rule block an even-higher-priority rule that already ran", () => {
    // priority 1 (ADD_TOGETHER) is evaluated before priority 2 (EXCLUSIVE) —
    // the exclusive rule can only block what comes AFTER it, not before.
    const rules = [
      rule({ stackingMode: "ADD_TOGETHER", name: "Party Discount", priority: 1 }),
      rule({ stackingMode: "EXCLUSIVE", name: "Coupon", priority: 2 }),
      rule({ stackingMode: "ADD_TOGETHER", name: "Group Discount", priority: 3 }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "rule_based");
    expect(applied.map((r) => r.name).sort()).toEqual(["Coupon", "Party Discount"].sort());
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe("Group Discount");
  });

  it("routes SETTLEMENT_ONLY rules to settlementEligible without touching applied/rejected", () => {
    const rules = [
      rule({ stackingMode: "SETTLEMENT_ONLY", ruleType: "TOD", name: "Quarterly TOD" }),
      rule({ stackingMode: "ADD_TOGETHER", name: "Party Discount" }),
    ];
    const { applied, rejected, settlementEligible } = resolveConflicts(rules, "rule_based");
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("Party Discount");
    expect(rejected).toHaveLength(0);
    expect(settlementEligible).toHaveLength(1);
    expect(settlementEligible[0].name).toBe("Quarterly TOD");
    expect(settlementEligible[0].decision).toBe("settlement_only");
  });

  it("a coupon (EXCLUSIVE) never blocks a settlement-only TOD rule", () => {
    const rules = [
      rule({ stackingMode: "EXCLUSIVE", name: "Coupon", priority: 1 }),
      rule({ stackingMode: "SETTLEMENT_ONLY", ruleType: "TOD", name: "Quarterly TOD", priority: 2 }),
    ];
    const { settlementEligible } = resolveConflicts(rules, "rule_based");
    expect(settlementEligible).toHaveLength(1);
    expect(settlementEligible[0].name).toBe("Quarterly TOD");
  });

  it("REPLACE_PREVIOUS: only the highest-priority one wins, and normal discounts still stack on top of it", () => {
    const rules = [
      rule({ stackingMode: "REPLACE_PREVIOUS", name: "Special Price A", priority: 1, value: 900 }),
      rule({ stackingMode: "REPLACE_PREVIOUS", name: "Special Price B", priority: 2, value: 950 }),
      rule({ stackingMode: "ADD_TOGETHER", name: "Festival", priority: 3 }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "rule_based");
    const replaced = applied.find((r) => r.decision === "replaced_base");
    expect(replaced?.name).toBe("Special Price A");
    expect(applied.some((r) => r.name === "Festival")).toBe(true);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe("Special Price B");
  });

  it("resolves USE_BUSINESS_DEFAULT via the rule-type default table under a 'rule_based' policy", () => {
    const rules = [rule({ ruleType: "COUPON", stackingMode: "USE_BUSINESS_DEFAULT" })];
    const { applied } = resolveConflicts(rules, "rule_based");
    expect(applied[0].stackingMode).toBe("EXCLUSIVE");
  });

  it("a rule's own explicit stackingMode overrides its rule-type default", () => {
    const rules = [rule({ ruleType: "COUPON", stackingMode: "ADD_TOGETHER" })];
    const { applied } = resolveConflicts(rules, "rule_based");
    expect(applied[0].stackingMode).toBe("ADD_TOGETHER");
  });

  it("a fixed business policy (not rule_based) applies uniformly, ignoring rule-type defaults", () => {
    const rules = [
      rule({ ruleType: "COUPON", stackingMode: "USE_BUSINESS_DEFAULT", value: 5, name: "A" }),
      rule({ ruleType: "PARTY_DISCOUNT", stackingMode: "USE_BUSINESS_DEFAULT", value: 9, name: "B" }),
    ];
    const { applied, rejected } = resolveConflicts(rules, "highest_wins");
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("B");
    expect(rejected).toHaveLength(1);
  });
});
