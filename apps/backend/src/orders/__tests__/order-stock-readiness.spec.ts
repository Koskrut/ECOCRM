import assert from "node:assert/strict";
import test from "node:test";
import {
  computeOrderStockReadiness,
  resolveAvailableQty,
  type OrderForStockReadiness,
} from "../order-stock-readiness";

function order(partial: Partial<OrderForStockReadiness> & Pick<OrderForStockReadiness, "items">) {
  return {
    orderStage: "AWAITING_STOCK" as const,
    warehouseId: null,
    ...partial,
  };
}

test("resolveAvailableQty uses warehouse row when present", () => {
  const productStock = new Map([["p1", 5]]);
  const warehouseStock = new Map([["wh1:p1", 12]]);
  assert.equal(resolveAvailableQty("p1", "wh1", productStock, warehouseStock), 12);
});

test("resolveAvailableQty falls back to product stock when warehouse row missing", () => {
  const productStock = new Map([["p1", 7]]);
  const warehouseStock = new Map<string, number>();
  assert.equal(resolveAvailableQty("p1", "wh1", productStock, warehouseStock), 7);
});

test("computeOrderStockReadiness returns null outside AWAITING_STOCK", () => {
  const readiness = computeOrderStockReadiness(
    order({ orderStage: "CONFIRMED", items: [{ productId: "p1", qty: 1 }] }),
    new Map([["p1", 10]]),
    new Map(),
  );
  assert.equal(readiness, null);
});

test("computeOrderStockReadiness FULL when stock covers all lines", () => {
  const readiness = computeOrderStockReadiness(
    order({
      warehouseId: "wh1",
      items: [
        { productId: "p1", qty: 2 },
        { productId: "p2", qty: 1 },
      ],
    }),
    new Map([
      ["p1", 1],
      ["p2", 5],
    ]),
    new Map([
      ["wh1:p1", 2],
      ["wh1:p2", 1],
    ]),
  );
  assert.equal(readiness, "FULL");
});

test("computeOrderStockReadiness PARTIAL when only some lines have stock", () => {
  const readiness = computeOrderStockReadiness(
    order({
      items: [
        { productId: "p1", qty: 5 },
        { productId: "p2", qty: 3 },
      ],
    }),
    new Map([
      ["p1", 2],
      ["p2", 0],
    ]),
    new Map(),
  );
  assert.equal(readiness, "PARTIAL");
});

test("computeOrderStockReadiness NONE when no stock on product lines", () => {
  const readiness = computeOrderStockReadiness(
    order({ items: [{ productId: "p1", qty: 1 }] }),
    new Map([["p1", 0]]),
    new Map(),
  );
  assert.equal(readiness, "NONE");
});

test("computeOrderStockReadiness NONE when lines lack catalog products", () => {
  const readiness = computeOrderStockReadiness(
    order({ items: [{ productId: null, qty: 1 }] }),
    new Map(),
    new Map(),
  );
  assert.equal(readiness, "NONE");
});

test("computeOrderStockReadiness ignores already shipped qty", () => {
  const readiness = computeOrderStockReadiness(
    order({
      items: [{ productId: "p1", qty: 5, qtyShipped: 4 }],
    }),
    new Map([["p1", 1]]),
    new Map(),
  );
  assert.equal(readiness, "FULL");
});
