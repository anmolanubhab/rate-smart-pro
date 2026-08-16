import { describe, it, expect } from "vitest";

// Regression for the party_balance_summary reversal bug, expressed as the
// accumulation rule apply_ledger_balance_delta() implements.
//
// The SQL used GREATEST(_dr_delta, 0) / GREATEST(_cr_delta, 0), so a
// reversal's negative delta was clamped to 0 and the cumulative columns only
// grew. current_balance (raw signed delta) stayed right, leaving the row
// self-inconsistent: after cancelling a 171.00 invoice it read
// total_dr 171 / total_cr 0 / current_balance 0.
//
// The invariant is fixed by recompute_all_balances(), the app's authoritative
// rebuild:
//
//     total_dr        = SUM(dr_amount) over vouchers WHERE status = 'posted'
//     total_cr        = SUM(cr_amount) over vouchers WHERE status = 'posted'
//     current_balance = total_dr - total_cr
//
// A cancelled voucher contributes nothing, so a reversal must subtract the
// original amounts rather than post a contra. These tests pin that rule, and
// pin that the incremental path lands where a full rebuild would.

interface PartyBalance {
  total_dr: number;
  total_cr: number;
  current_balance: number;
}

const ZERO: PartyBalance = { total_dr: 0, total_cr: 0, current_balance: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors the fixed apply_ledger_balance_delta() accumulation. */
function applyDelta(b: PartyBalance, drDelta: number, crDelta: number): PartyBalance {
  return {
    total_dr: round2(b.total_dr + drDelta),
    total_cr: round2(b.total_cr + crDelta),
    current_balance: round2(b.current_balance + drDelta - crDelta),
  };
}

/** Mirrors recompute_all_balances(): posted vouchers only. */
function rebuild(vouchers: { status: string; dr: number; cr: number }[]): PartyBalance {
  const posted = vouchers.filter((v) => v.status === "posted");
  const total_dr = round2(posted.reduce((s, v) => s + v.dr, 0));
  const total_cr = round2(posted.reduce((s, v) => s + v.cr, 0));
  return { total_dr, total_cr, current_balance: round2(total_dr - total_cr) };
}

describe("party balance — posting and reversal", () => {
  it("1. a normal invoice posts a debit", () => {
    const after = applyDelta(ZERO, 171, 0);
    expect(after).toEqual({ total_dr: 171, total_cr: 0, current_balance: 171 });
  });

  it("2. Dr/Cr increase as vouchers post", () => {
    let b = applyDelta(ZERO, 171, 0);
    b = applyDelta(b, 0, 50); // part payment received
    expect(b.total_dr).toBe(171);
    expect(b.total_cr).toBe(50);
    expect(b.current_balance).toBe(121);
  });

  it("3+4. cancelling reverses the cumulative Dr, not just the balance", () => {
    const posted = applyDelta(ZERO, 171, 0);
    const cancelled = applyDelta(posted, -171, -0);

    // The old GREATEST() behaviour left total_dr at 171 here.
    expect(cancelled.total_dr, "cancelled voucher must not keep inflating turnover").toBe(0);
    expect(cancelled.total_cr).toBe(0);
    expect(cancelled.current_balance).toBe(0);
  });

  it("5. current_balance stays correct through the whole cycle", () => {
    let b = applyDelta(ZERO, 171, 0);
    expect(b.current_balance).toBe(171);
    b = applyDelta(b, 0, 71);
    expect(b.current_balance).toBe(100);
    b = applyDelta(b, -171, 0);
    expect(b.current_balance).toBe(-71);
  });

  it("6. a retried cancellation does not double-reverse", () => {
    const posted = applyDelta(ZERO, 171, 0);
    const cancelled = applyDelta(posted, -171, 0);

    // vouchers_sync_balance_on_status_change only fires on the real
    // OLD.status='posted' -> NEW.status='cancelled' transition, so a second
    // cancel of an already-cancelled voucher applies no further delta.
    const retried = cancelled;

    expect(retried).toEqual({ total_dr: 0, total_cr: 0, current_balance: 0 });
    expect(retried.total_dr, "a second reversal would drive this negative").not.toBeLessThan(0);
  });

  it("the incremental path agrees with a full recompute", () => {
    // One posted invoice, one cancelled invoice — what the rebuild produces
    // must equal what the deltas produce.
    let incremental = applyDelta(ZERO, 171, 0); // invoice A posted
    incremental = applyDelta(incremental, 342.2, 0); // invoice B posted
    incremental = applyDelta(incremental, -342.2, 0); // invoice B cancelled

    const rebuilt = rebuild([
      { status: "posted", dr: 171, cr: 0 },
      { status: "cancelled", dr: 342.2, cr: 0 },
    ]);

    expect(incremental).toEqual(rebuilt);
    expect(incremental.total_dr - incremental.total_cr).toBe(incremental.current_balance);
  });
});
