import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReturnsToIssuedOrder,
  documentTotalAfterReturns,
  netDocumentLines,
} from "../order-document-net.utils";

const line = (id: string, qty: number, lineTotal: number, price = lineTotal / qty) => ({
  id,
  qty,
  price,
  lineTotal,
  sku: id,
});

test("received return reduces qty, line sum and document total", () => {
  const order = applyReturnsToIssuedOrder({
    totalAmount: 400,
    returnAdjustmentAmount: 100,
    items: [line("i1", 4, 400)],
    returns: [
      {
        status: "RECEIVED_BY_WAREHOUSE",
        reason: "CUSTOMER_CHANGE" as const,
        outboundWaivedAt: null,
        items: [{ orderItemId: "i1", qtyReturned: 1 }],
      },
    ],
  });

  assert.equal(order.totalAmount, 300);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0]!.qty, 3);
  assert.equal(order.items[0]!.lineTotal, 300);
  assert.equal(order.items[0]!.price, 100);
});

test("fully returned line is omitted; partial line on the same order stays", () => {
  const items = netDocumentLines(
    [line("i1", 2, 200), line("i2", 5, 500)],
    [
      {
        status: "CLOSED",
        reason: "DEFECT",
        outboundWaivedAt: null,
        items: [
          { orderItemId: "i1", qtyReturned: 2 },
          { orderItemId: "i2", qtyReturned: 2 },
        ],
      },
    ],
  );
  assert.deepEqual(
    items.map((it) => ({ id: it.id, qty: it.qty, lineTotal: it.lineTotal })),
    [{ id: "i2", qty: 3, lineTotal: 300 }],
  );
});

test("requested return does not change the issued order", () => {
  const order = applyReturnsToIssuedOrder({
    totalAmount: 300,
    returnAdjustmentAmount: 0,
    items: [line("i1", 3, 300)],
    returns: [
      {
        status: "REQUESTED",
        reason: "CUSTOMER_CHANGE",
        outboundWaivedAt: null,
        items: [{ orderItemId: "i1", qtyReturned: 3 }],
      },
    ],
  });
  assert.equal(order.totalAmount, 300);
  assert.equal(order.items[0]!.qty, 3);
  assert.equal(order.items[0]!.lineTotal, 300);
});

test("active mis-pick replacement is not taken off the invoice", () => {
  const items = netDocumentLines([line("i1", 2, 200)], [
    {
      status: "INSPECTION",
      reason: "WRONG_ITEM",
      outboundWaivedAt: null,
      items: [{ orderItemId: "i1", qtyReturned: 2 }],
    },
  ]);
  assert.equal(items[0]!.qty, 2);
});

test("several counting returns on one line add up", () => {
  const items = netDocumentLines([line("i1", 10, 1000)], [
    {
      status: "CLOSED",
      reason: "CUSTOMER_CHANGE",
      outboundWaivedAt: null,
      items: [{ orderItemId: "i1", qtyReturned: 2 }],
    },
    {
      status: "REFUND_OR_ADJUSTMENT",
      reason: "DEFECT",
      outboundWaivedAt: null,
      items: [{ orderItemId: "i1", qtyReturned: 3 }],
    },
  ]);
  assert.equal(items[0]!.qty, 5);
  assert.equal(items[0]!.lineTotal, 500);
});

test("document total keeps the order-level discount already inside the adjustment", () => {
  assert.equal(
    documentTotalAfterReturns({ totalAmount: 900, returnAdjustmentAmount: 450 }),
    450,
  );
});

test("apply is idempotent", () => {
  const once = applyReturnsToIssuedOrder({
    totalAmount: 400,
    returnAdjustmentAmount: 100,
    items: [line("i1", 4, 400)],
    returns: [
      {
        status: "CLOSED",
        reason: "CUSTOMER_CHANGE",
        outboundWaivedAt: null,
        items: [{ orderItemId: "i1", qtyReturned: 1 }],
      },
    ],
  });
  const twice = applyReturnsToIssuedOrder(once);
  assert.equal(twice.totalAmount, 300);
  assert.equal(twice.items[0]!.qty, 3);
});
