import { describe, it, expect } from "vitest";
import { canBackdateVoucher, canUnlockVouchers } from "./permissions";

// can_backdate_voucher role model: owner/admin always have it by role
// (mirroring canUnlockVouchers' existing convention for accounting-period
// controls); anyone else needs the explicit per-user financial right.
describe("canBackdateVoucher — role + financial-rights model", () => {
  it("owner always has the right, regardless of financial_rights", () => {
    expect(canBackdateVoucher("owner", null)).toBe(true);
    expect(canBackdateVoucher("owner", { can_backdate_voucher: false })).toBe(true);
  });

  it("admin always has the right, regardless of financial_rights", () => {
    expect(canBackdateVoucher("admin", { can_backdate_voucher: false })).toBe(true);
  });

  it("manager does not have the right by default", () => {
    expect(canBackdateVoucher("manager", null)).toBe(false);
    expect(canBackdateVoucher("manager", { can_backdate_voucher: false })).toBe(false);
  });

  it("manager gains the right via the explicit financial_rights flag", () => {
    expect(canBackdateVoucher("manager", { can_backdate_voucher: true })).toBe(true);
  });

  it("accountant/salesman/staff/store_manager/viewer follow the same explicit-flag rule as manager", () => {
    for (const role of ["accountant", "salesman", "staff", "store_manager", "viewer"] as const) {
      expect(canBackdateVoucher(role, null)).toBe(false);
      expect(canBackdateVoucher(role, { can_backdate_voucher: true })).toBe(true);
    }
  });

  it("mirrors the same role set canUnlockVouchers uses for owner/admin", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(canBackdateVoucher(role, null)).toBe(canUnlockVouchers(role, null));
    }
  });
});
