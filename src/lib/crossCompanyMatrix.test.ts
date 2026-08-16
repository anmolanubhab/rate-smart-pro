import { describe, it, expect, vi, beforeEach } from "vitest";

// THE CROSS-COMPANY ATTACK MATRIX
//
// One data-driven suite that every business-scoped service entry point is
// registered in. Adding a module is one row in ENTITIES below — that is the
// point: as the remaining ~300 implicit-context call sites get scoped, each
// one arrives with automated proof instead of a hand-run attack.
//
// WHY THIS EXISTS AT THE SERVICE LAYER
// RD-Pro has two boundaries and only one is in the database:
//
//   Membership (RLS)      — blocks a NON-member outright. Verified live.
//   Active business (here)— a user who belongs to BOTH companies passes RLS
//                           for both, so the database returns either row. This
//                           was proven live: with company A active, a raw
//                           client both READ and UPDATED company B's order
//                           through RLS without error.
//
// So the assertions below are the real active-company boundary, not a
// convenience wrapper.
//
// The mock applies the .eq() filters against a fake dataset rather than
// returning canned rows, so a denial has to come from actual business
// filtering — a service that forgot its scope will return the foreign row and
// fail here.

const BIZ_A = "biz-aaaa-akl";
const BIZ_B = "biz-bbbb-qa";

const TABLES: Record<string, Record<string, unknown>[]> = {
  orders: [
    { id: "order-A", business_id: BIZ_A, order_number: "ORD-A-1", status: "pending" },
    { id: "order-B", business_id: BIZ_B, order_number: "ORD-B-1", status: "pending" },
  ],
  order_items: [
    { id: "oi-A", order_id: "order-A", part_number: "A-PART", position: 0 },
    { id: "oi-B", order_id: "order-B", part_number: "B-PART", position: 0 },
  ],
  sales_invoices: [
    { id: "inv-A", business_id: BIZ_A, invoice_number: "INV-A-1", status: "posted" },
    { id: "inv-B", business_id: BIZ_B, invoice_number: "INV-B-1", status: "posted" },
  ],
  sales_invoice_items: [
    { id: "sii-A", invoice_id: "inv-A", business_id: BIZ_A, position: 0 },
    { id: "sii-B", invoice_id: "inv-B", business_id: BIZ_B, position: 0 },
  ],
  dispatches: [
    { id: "disp-A", business_id: BIZ_A, status: "draft", order_id: "order-A" },
    { id: "disp-B", business_id: BIZ_B, status: "draft", order_id: "order-B" },
  ],
  dispatch_items: [
    { id: "di-A", dispatch_id: "disp-A" },
    { id: "di-B", dispatch_id: "disp-B" },
  ],
  purchase_invoices: [
    { id: "pinv-A", business_id: BIZ_A, invoice_number: "PINV-A-1", status: "unpaid" },
    { id: "pinv-B", business_id: BIZ_B, invoice_number: "PINV-B-1", status: "unpaid" },
  ],
  purchase_invoice_items: [
    { id: "pii-A", purchase_invoice_id: "pinv-A", position: 0 },
    { id: "pii-B", purchase_invoice_id: "pinv-B", position: 0 },
  ],
  ledger_accounts: [
    { id: "led-A", business_id: BIZ_A, name: "Cash", is_system: false },
    { id: "led-B", business_id: BIZ_B, name: "Cash", is_system: false },
  ],
  goods_receipts: [
    { id: "grn-A", business_id: BIZ_A, grn_number: "GRN-A-1", status: "draft" },
    { id: "grn-B", business_id: BIZ_B, grn_number: "GRN-B-1", status: "draft" },
  ],
  goods_receipt_items: [
    { id: "gri-A", goods_receipt_id: "grn-A" },
    { id: "gri-B", goods_receipt_id: "grn-B" },
  ],
  sales_returns: [
    { id: "sr-A", business_id: BIZ_A, return_number: "CN-A-1", status: "draft" },
    { id: "sr-B", business_id: BIZ_B, return_number: "CN-B-1", status: "draft" },
  ],
  sales_return_items: [
    { id: "sri-A", return_id: "sr-A", position: 0 },
    { id: "sri-B", return_id: "sr-B", position: 0 },
  ],
  // ─── Modules scoped after the first milestone ────────────────────────────
  stock_take_sheets: [
    { id: "st-A", business_id: BIZ_A, sheet_no: "ST-A-1", status: "draft" },
    { id: "st-B", business_id: BIZ_B, sheet_no: "ST-B-1", status: "draft" },
  ],
  // stock_take_items has no business_id — ownership runs through sheet_id.
  stock_take_items: [
    { id: "sti-A", sheet_id: "st-A", counted_qty: null },
    { id: "sti-B", sheet_id: "st-B", counted_qty: null },
  ],
  stock_transfers: [
    { id: "tr-A", business_id: BIZ_A, transfer_no: "TR-A-1", status: "draft" },
    { id: "tr-B", business_id: BIZ_B, transfer_no: "TR-B-1", status: "draft" },
  ],
  purchase_orders: [
    { id: "po-A", business_id: BIZ_A, po_number: "PO-A-1", status: "draft" },
    { id: "po-B", business_id: BIZ_B, po_number: "PO-B-1", status: "draft" },
  ],
  purchase_order_items: [
    { id: "poi-A", purchase_order_id: "po-A", position: 0 },
    { id: "poi-B", purchase_order_id: "po-B", position: 0 },
  ],
  po_activity_logs: [
    { id: "pal-A", purchase_order_id: "po-A" },
    { id: "pal-B", purchase_order_id: "po-B" },
  ],
  quotations: [
    { id: "q-A", business_id: BIZ_A, quotation_number: "QT-A-1", status: "draft" },
    { id: "q-B", business_id: BIZ_B, quotation_number: "QT-B-1", status: "draft" },
  ],
  quotation_items: [
    { id: "qi-A", quotation_id: "q-A", position: 0 },
    { id: "qi-B", quotation_id: "q-B", position: 0 },
  ],
  picking_lists: [
    { id: "pl-A", business_id: BIZ_A, order_id: "order-A", status: "open" },
    { id: "pl-B", business_id: BIZ_B, order_id: "order-B", status: "open" },
  ],
  picking_list_items: [
    { id: "pli-A", picking_list_id: "pl-A", qty_to_pick: 5, qty_picked: 0, position: 0 },
    { id: "pli-B", picking_list_id: "pl-B", qty_to_pick: 5, qty_picked: 0, position: 0 },
  ],
  goods_receipts_for_po: [],
};

let activeBusinessId: string | null = BIZ_A;
/** Rows an UPDATE actually matched — how a write-side denial is detected. */
let lastUpdateMatched = 0;

vi.mock("@/lib/activeBusiness", () => ({
  getActiveBusinessIdSync: () => activeBusinessId,
  onActiveBusinessChange: () => () => {},
}));

interface Result {
  data: unknown;
  error: unknown;
}

function query(rows: Record<string, unknown>[], mode: "select" | "update" = "select") {
  let filtered = [...rows];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      if (mode === "update") lastUpdateMatched = filtered.length;
      return q;
    },
    neq: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    maybeSingle: (): Promise<Result> => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    single: (): Promise<Result> =>
      Promise.resolve(filtered[0] ? { data: filtered[0], error: null } : { data: null, error: { message: "no rows" } }),
    then: (ok: (r: Result) => unknown, err: (e: unknown) => unknown) =>
      Promise.resolve({ data: filtered, error: null }).then(ok, err),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => query(TABLES[table] ?? []),
      update: () => query(TABLES[table] ?? [], "update"),
      delete: () => query(TABLES[table] ?? [], "update"),
    }),
    // Several newly scoped modules (stock take, stock transfer) do their work
    // in a SECURITY DEFINER RPC. Those RPCs already refuse a NON-member; what
    // is asserted here is the ownership check the service layer performs
    // BEFORE calling them, so the stub just succeeds — if the guard is
    // missing, the foreign case reaches this stub and resolves, failing the
    // "DENIED" expectation.
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { fetchOrder, fetchOrderItems } from "./orders";
import { fetchInvoice, fetchInvoiceItems } from "./salesInvoices";
import { fetchDispatchItems, confirmDispatch } from "./dispatches";
import {
  fetchPurchaseInvoice,
  fetchInvoiceItems as fetchPurchaseInvoiceItems,
  deletePurchaseInvoice,
} from "./purchaseInvoices";
import { updateLedger } from "./accounting";
import { fetchGoodsReceipt, fetchGoodsReceiptItems, cancelGRN } from "./goodsReceipts";
import { fetchSalesReturnById, fetchSalesReturnItems, postSalesReturn } from "./salesReturns";
import {
  fetchStockTakeSheet,
  fetchStockTakeItems,
  postStockTake,
  cancelStockTake,
  setCountedQty,
  removeStockTakeItem,
} from "./stockTake";
import {
  fetchStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  cancelStockTransfer,
} from "./stockTransfers";
import {
  fetchPurchaseOrder,
  fetchPOItems,
  fetchPOActivityLogs,
  approvePurchaseOrder,
  rejectPurchaseOrder,
} from "./purchaseOrders";
import {
  fetchQuotationById,
  fetchQuotationItems,
  updateQuotationStatus,
  deleteQuotation,
} from "./quotations";
import { fetchPickingListItems, markItemPicked } from "./pickingLists";

/**
 * One row per business-scoped read path.
 *   own     — an id belonging to the active company
 *   foreign — the same entity in the other company
 */
const ENTITIES: {
  name: string;
  call: (id: string) => Promise<unknown>;
  ownA: string;
  ownB: string;
}[] = [
  { name: "order", call: (id) => fetchOrder(id), ownA: "order-A", ownB: "order-B" },
  { name: "order items", call: (id) => fetchOrderItems(id), ownA: "order-A", ownB: "order-B" },
  { name: "sales invoice", call: (id) => fetchInvoice(id), ownA: "inv-A", ownB: "inv-B" },
  { name: "sales invoice items", call: (id) => fetchInvoiceItems(id), ownA: "inv-A", ownB: "inv-B" },
  { name: "dispatch items", call: (id) => fetchDispatchItems(id), ownA: "disp-A", ownB: "disp-B" },
  { name: "purchase invoice", call: (id) => fetchPurchaseInvoice(id), ownA: "pinv-A", ownB: "pinv-B" },
  { name: "purchase invoice items", call: (id) => fetchPurchaseInvoiceItems(id), ownA: "pinv-A", ownB: "pinv-B" },
  { name: "goods receipt", call: (id) => fetchGoodsReceipt(id), ownA: "grn-A", ownB: "grn-B" },
  { name: "goods receipt items", call: (id) => fetchGoodsReceiptItems(id), ownA: "grn-A", ownB: "grn-B" },
  { name: "sales return", call: (id) => fetchSalesReturnById(id), ownA: "sr-A", ownB: "sr-B" },
  { name: "sales return items", call: (id) => fetchSalesReturnItems(id), ownA: "sr-A", ownB: "sr-B" },

  // Modules scoped after the first milestone.
  { name: "stock take sheet", call: (id) => fetchStockTakeSheet(id), ownA: "st-A", ownB: "st-B" },
  { name: "stock take items", call: (id) => fetchStockTakeItems(id, 0, 50), ownA: "st-A", ownB: "st-B" },
  { name: "stock transfer", call: (id) => fetchStockTransfer(id), ownA: "tr-A", ownB: "tr-B" },
  { name: "purchase order", call: (id) => fetchPurchaseOrder(id), ownA: "po-A", ownB: "po-B" },
  { name: "purchase order items", call: (id) => fetchPOItems(id), ownA: "po-A", ownB: "po-B" },
  { name: "purchase order activity log", call: (id) => fetchPOActivityLogs(id), ownA: "po-A", ownB: "po-B" },
  { name: "quotation", call: (id) => fetchQuotationById(id), ownA: "q-A", ownB: "q-B" },
  { name: "quotation items", call: (id) => fetchQuotationItems(id), ownA: "q-A", ownB: "q-B" },
  { name: "picking list items", call: (id) => fetchPickingListItems(id), ownA: "pl-A", ownB: "pl-B" },
];

describe("Cross-company attack matrix — A ↔ B", () => {
  beforeEach(() => {
    activeBusinessId = BIZ_A;
    lastUpdateMatched = 0;
  });

  describe("READ: company A active", () => {
    for (const e of ENTITIES) {
      it(`${e.name}: own record ALLOWED`, async () => {
        activeBusinessId = BIZ_A;
        await expect(e.call(e.ownA)).resolves.toBeDefined();
      });

      it(`${e.name}: company B record DENIED`, async () => {
        activeBusinessId = BIZ_A;
        await expect(e.call(e.ownB)).rejects.toThrow();
      });
    }
  });

  describe("READ: company B active (reverse direction)", () => {
    for (const e of ENTITIES) {
      it(`${e.name}: own record ALLOWED`, async () => {
        activeBusinessId = BIZ_B;
        await expect(e.call(e.ownB)).resolves.toBeDefined();
      });

      it(`${e.name}: company A record DENIED`, async () => {
        activeBusinessId = BIZ_B;
        await expect(e.call(e.ownA)).rejects.toThrow();
      });
    }
  });

  describe("MUTATION: a foreign record must not be writable", () => {
    it("confirmDispatch on own dispatch matches a row", async () => {
      activeBusinessId = BIZ_A;
      await confirmDispatch("disp-A", "user-1");
      expect(lastUpdateMatched, "own dispatch should be updatable").toBe(1);
    });

    it("confirmDispatch on company B's dispatch matches nothing", async () => {
      activeBusinessId = BIZ_A;
      await confirmDispatch("disp-B", "user-1");
      // Confirming deducts stock and can trigger invoicing — the update must
      // filter to zero rows rather than move company B's inventory.
      expect(lastUpdateMatched, "foreign dispatch must not be updatable").toBe(0);
    });

    it("deletePurchaseInvoice refuses company B's invoice before touching its lines", async () => {
      activeBusinessId = BIZ_A;
      // Ownership is asserted BEFORE the line delete; an unscoped call used to
      // destroy the foreign invoice's items even if the header delete failed.
      await expect(deletePurchaseInvoice("pinv-B")).rejects.toThrow();
    });

    it("updateLedger on company B's ledger matches nothing", async () => {
      activeBusinessId = BIZ_A;
      await updateLedger("led-B", {
        name: "Hijacked",
        ledger_type: "cash",
        group_id: null,
        opening_balance: 0,
        opening_balance_type: "dr",
      });
      expect(lastUpdateMatched, "foreign ledger must not be updatable").toBe(0);
    });

    it("cancelGRN refuses company B's receipt before reversing any stock", async () => {
      activeBusinessId = BIZ_A;
      // Cancelling a GRN decrements products.stock and unwinds batches/serials.
      // Ownership is asserted first, so a foreign GRN never reaches that code.
      await expect(cancelGRN("grn-B")).rejects.toThrow();
    });

    it("postSalesReturn refuses company B's return before restocking", async () => {
      activeBusinessId = BIZ_A;
      // Posting a return puts stock back and creates a Credit Note voucher.
      await expect(postSalesReturn("sr-B")).rejects.toThrow();
    });

    // ─── Modules scoped after the first milestone ─────────────────────────
    // Each of these ends in a SECURITY DEFINER RPC or a direct write. The
    // RPCs refuse a non-member on their own; these assert the ACTIVE-company
    // guard that runs before them.

    it("postStockTake refuses company B's sheet before writing stock", async () => {
      activeBusinessId = BIZ_A;
      // Posting a stock take overwrites products.stock and raises a journal
      // voucher — it must never run against another company's count.
      await expect(postStockTake("st-B")).rejects.toThrow();
    });

    it("postStockTake on own sheet is allowed", async () => {
      activeBusinessId = BIZ_A;
      await expect(postStockTake("st-A")).resolves.toBeUndefined();
    });

    it("cancelStockTake refuses company B's sheet", async () => {
      activeBusinessId = BIZ_A;
      await expect(cancelStockTake("st-B")).rejects.toThrow();
    });

    it("setCountedQty refuses a line on company B's sheet", async () => {
      activeBusinessId = BIZ_A;
      await expect(setCountedQty("sti-B", 99)).rejects.toThrow();
    });

    it("removeStockTakeItem refuses a line on company B's sheet", async () => {
      activeBusinessId = BIZ_A;
      await expect(removeStockTakeItem("sti-B")).rejects.toThrow();
    });

    it("dispatchStockTransfer refuses company B's transfer before moving stock", async () => {
      activeBusinessId = BIZ_A;
      await expect(dispatchStockTransfer("tr-B")).rejects.toThrow();
    });

    it("receiveStockTransfer refuses company B's transfer", async () => {
      activeBusinessId = BIZ_A;
      await expect(receiveStockTransfer("tr-B")).rejects.toThrow();
    });

    it("cancelStockTransfer refuses company B's transfer", async () => {
      activeBusinessId = BIZ_A;
      await expect(cancelStockTransfer("tr-B")).rejects.toThrow();
    });

    it("approvePurchaseOrder on company B's PO matches nothing", async () => {
      activeBusinessId = BIZ_A;
      // Approval is what unlocks goods receipt against a PO.
      await approvePurchaseOrder("po-B", "user-1");
      expect(lastUpdateMatched, "foreign PO must not be approvable").toBe(0);
    });

    it("approvePurchaseOrder on own PO matches a row", async () => {
      activeBusinessId = BIZ_A;
      await approvePurchaseOrder("po-A", "user-1");
      expect(lastUpdateMatched, "own PO should be approvable").toBe(1);
    });

    it("rejectPurchaseOrder on company B's PO matches nothing", async () => {
      activeBusinessId = BIZ_A;
      await rejectPurchaseOrder("po-B", "user-1", "no");
      expect(lastUpdateMatched, "foreign PO must not be rejectable").toBe(0);
    });

    it("updateQuotationStatus on company B's quotation matches nothing", async () => {
      activeBusinessId = BIZ_A;
      await updateQuotationStatus("q-B", "accepted");
      expect(lastUpdateMatched, "foreign quotation must not be updatable").toBe(0);
    });

    it("deleteQuotation on company B's quotation matches nothing", async () => {
      activeBusinessId = BIZ_A;
      await deleteQuotation("q-B");
      expect(lastUpdateMatched, "foreign quotation must not be deletable").toBe(0);
    });

    it("markItemPicked refuses a line on company B's picking list", async () => {
      activeBusinessId = BIZ_A;
      await expect(markItemPicked("pli-B", 5)).rejects.toThrow();
    });

    it("updateLedger on own ledger matches a row", async () => {
      activeBusinessId = BIZ_A;
      await updateLedger("led-A", {
        name: "Cash Renamed",
        ledger_type: "cash",
        group_id: null,
        opening_balance: 0,
        opening_balance_type: "dr",
      });
      expect(lastUpdateMatched, "own ledger should be updatable").toBe(1);
    });
  });

  describe("no business context is refused, not silently unscoped", () => {
    for (const e of ENTITIES) {
      it(`${e.name}: refused when no active business`, async () => {
        activeBusinessId = null;
        await expect(e.call(e.ownA)).rejects.toThrow();
      });
    }
  });

  describe("a UUID probe cannot distinguish foreign from absent", () => {
    for (const e of ENTITIES) {
      it(`${e.name}: identical failure for foreign and nonexistent`, async () => {
        activeBusinessId = BIZ_A;
        const foreign = await e.call(e.ownB).catch((err: Error) => err.message);
        const absent = await e.call("does-not-exist").catch((err: Error) => err.message);
        expect(foreign).toBe(absent);
      });
    }
  });
});
