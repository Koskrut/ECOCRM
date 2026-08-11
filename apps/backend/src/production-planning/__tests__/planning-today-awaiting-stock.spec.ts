import assert from "node:assert/strict";
import test from "node:test";
import {
  groupAwaitingStockLines,
  type AwaitingStockLineInput,
} from "../planning-awaiting-stock.util";

function line(partial: Partial<AwaitingStockLineInput> & Pick<AwaitingStockLineInput, "orderItemId">): AwaitingStockLineInput {
  return {
    orderId: "ord-1",
    orderNumber: "WH-1",
    warehouseId: null,
    productId: "p1",
    sku: "SKU-1",
    name: "Kit A",
    qty: 2,
    qtyShipped: 0,
    ...partial,
  };
}

test("groups remaining lines of the same SKU from different orders", () => {
  const view = groupAwaitingStockLines(
    [
      line({ orderItemId: "i1", orderId: "ord-1", orderNumber: "WH-1", qty: 3 }),
      line({ orderItemId: "i2", orderId: "ord-2", orderNumber: "WH-2", qty: 5 }),
    ],
    new Map([["p1", 2]]),
    new Map(),
  );

  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0]!.totalQtyRemaining, 8);
  assert.equal(view.groups[0]!.orderCount, 2);
  assert.equal(view.groups[0]!.availableQty, 2);
  assert.equal(view.groups[0]!.stockGap, 6);
  assert.deepEqual(
    view.groups[0]!.orders.map((o) => o.orderNumber),
    ["WH-1", "WH-2"],
  );
  assert.equal(view.summary.skuCount, 1);
  assert.equal(view.summary.orderCount, 2);
  assert.equal(view.summary.totalQty, 8);
});

test("skips fully shipped qty when grouping", () => {
  const view = groupAwaitingStockLines(
    [
      line({ orderItemId: "i1", qty: 4, qtyShipped: 4 }),
      line({ orderItemId: "i2", orderId: "ord-2", orderNumber: "WH-2", qty: 3, qtyShipped: 1 }),
    ],
    new Map([["p1", 10]]),
    new Map(),
  );

  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0]!.totalQtyRemaining, 2);
  assert.equal(view.groups[0]!.orders.length, 1);
  assert.equal(view.groups[0]!.orders[0]!.qtyRemaining, 2);
  assert.equal(view.summary.totalQty, 2);
  assert.equal(view.summary.orderCount, 1);
});

test("line availableQty uses warehouse stock while group uses catalog stock", () => {
  const view = groupAwaitingStockLines(
    [line({ orderItemId: "i1", warehouseId: "wh1", qty: 10 })],
    new Map([["p1", 4]]),
    new Map([["wh1:p1", 7]]),
  );

  assert.equal(view.groups[0]!.availableQty, 4);
  assert.equal(view.groups[0]!.stockGap, 6);
  assert.equal(view.groups[0]!.orders[0]!.availableQty, 7);
  assert.equal(view.groups[0]!.orders[0]!.stockReadiness, "PARTIAL");
});

test("computes stockGap from catalog stock", () => {
  const view = groupAwaitingStockLines(
    [line({ orderItemId: "i1", qty: 10 })],
    new Map([["p1", 4]]),
    new Map(),
  );

  assert.equal(view.groups[0]!.availableQty, 4);
  assert.equal(view.groups[0]!.stockGap, 6);
});

test("stockGap is zero when catalog stock covers remaining qty", () => {
  const view = groupAwaitingStockLines(
    [line({ orderItemId: "i1", qty: 3 })],
    new Map([["p1", 10]]),
    new Map(),
  );

  assert.equal(view.groups[0]!.stockGap, 0);
});

test("lines without productId form a separate group by name", () => {
  const view = groupAwaitingStockLines(
    [
      line({ orderItemId: "i1", qty: 2 }),
      line({
        orderItemId: "i2",
        orderId: "ord-2",
        orderNumber: "WH-2",
        productId: null,
        sku: null,
        name: "Custom part",
        qty: 4,
      }),
      line({
        orderItemId: "i3",
        orderId: "ord-3",
        orderNumber: "WH-3",
        productId: null,
        sku: null,
        name: "Custom part",
        qty: 1,
      }),
    ],
    new Map([["p1", 0]]),
    new Map(),
  );

  assert.equal(view.groups.length, 2);
  const unmapped = view.groups.find((g) => g.productId === null);
  assert.ok(unmapped);
  assert.equal(unmapped.groupKey, "unmapped:custom part");
  assert.equal(unmapped.totalQtyRemaining, 5);
  assert.equal(unmapped.availableQty, null);
  assert.equal(unmapped.stockGap, 5);
  assert.equal(unmapped.orderCount, 2);
  assert.equal(unmapped.orders.every((o) => o.availableQty === null), true);
});

test("sorts groups by stockGap then remaining qty", () => {
  const view = groupAwaitingStockLines(
    [
      line({ orderItemId: "i1", productId: "p-small", sku: "SMALL", qty: 2 }),
      line({ orderItemId: "i2", productId: "p-gap", sku: "GAP", qty: 10 }),
      line({ orderItemId: "i3", productId: "p-big", sku: "BIG", qty: 8 }),
    ],
    new Map([
      ["p-small", 2],
      ["p-gap", 1],
      ["p-big", 8],
    ]),
    new Map(),
  );

  assert.deepEqual(
    view.groups.map((g) => g.sku),
    ["GAP", "BIG", "SMALL"],
  );
});
