import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertReturnReasonChange,
  buildReturnItemEdits,
  rematchReturnItemsByProduct,
} from "../order-return-edit.utils";

const orderItems = [
  { id: "i1", qty: 4 },
  { id: "i2", qty: 2 },
];

test("edit keeps qty within what other returns have not taken", () => {
  const items = buildReturnItemEdits({
    orderItems,
    otherReturnedByItem: new Map([["i1", 1]]),
    items: [
      { orderItemId: "i1", qtyReturned: 3 },
      { orderItemId: "i2", qtyReturned: 1 },
    ],
  });
  assert.deepEqual(items, [
    { orderItemId: "i1", qtyReturned: 3 },
    { orderItemId: "i2", qtyReturned: 1 },
  ]);
});

test("edit rejects qty above the remainder and an unknown line", () => {
  assert.throws(
    () =>
      buildReturnItemEdits({
        orderItems,
        otherReturnedByItem: new Map([["i1", 2]]),
        items: [{ orderItemId: "i1", qtyReturned: 3 }],
      }),
    BadRequestException,
  );
  assert.throws(
    () =>
      buildReturnItemEdits({
        orderItems,
        otherReturnedByItem: new Map(),
        items: [{ orderItemId: "missing", qtyReturned: 1 }],
      }),
    BadRequestException,
  );
});

test("reason can change between customer and defect, not to or from mis-pick", () => {
  assert.doesNotThrow(() => assertReturnReasonChange("CUSTOMER_CHANGE", "DEFECT"));
  assert.throws(() => assertReturnReasonChange("CUSTOMER_CHANGE", "WRONG_ITEM"), BadRequestException);
  assert.throws(() => assertReturnReasonChange("WRONG_ITEM", "DEFECT"), BadRequestException);
});

test("rematch maps returned qty onto the new order by product", () => {
  const matched = rematchReturnItemsByProduct(
    [
      { qtyReturned: 2, productId: "p1" },
      { qtyReturned: 1, productId: "p2" },
    ],
    [
      { id: "ni1", productId: "p1", qty: 5 },
      { id: "ni2", productId: "p2", qty: 1 },
    ],
  );
  assert.deepEqual(matched, [
    { orderItemId: "ni1", qtyReturned: 2 },
    { orderItemId: "ni2", qtyReturned: 1 },
  ]);
});

test("rematch fails when the new order has no matching product left", () => {
  assert.equal(
    rematchReturnItemsByProduct(
      [{ qtyReturned: 2, productId: "p1" }],
      [{ id: "ni1", productId: "p1", qty: 1 }],
    ),
    null,
  );
});
