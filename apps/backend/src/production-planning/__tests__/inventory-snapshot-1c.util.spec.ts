import test from "node:test";
import assert from "node:assert/strict";
import {
  isOneCStockPivotSheet,
  parseOneCStockPivotSheet,
  parseSnapshotQty,
} from "../inventory-snapshot-1c.util";

test("parseSnapshotQty handles 1C number formats", () => {
  assert.equal(parseSnapshotQty(12.9), 12);
  assert.equal(parseSnapshotQty("1,816.500"), 1816);
  assert.equal(parseSnapshotQty("1.816,5"), 1816);
  assert.equal(parseSnapshotQty(""), 0);
  assert.equal(parseSnapshotQty(-3), 0);
});

test("parseOneCStockPivotSheet unpivots warehouses and skips totals", () => {
  const rows: unknown[][] = [
    ["Товари на складах"],
    [
      "Номенклатура.Артикул ",
      "12 Склад Suprex",
      "44 Склад Готової продукції (СУПРЕКС)",
      "Підсумок",
    ],
    ["", "Кількість", "Кількість", "Кількість"],
    ["", "Кінцевий залишок", "Кінцевий залишок", "Кінцевий залишок"],
    ["", 100, 200, 300],
    ["01.010", 2, "", 2],
    ["ST-RC-AN", "", 12, 12],
    ["Підсумок", 2, 12, 14],
  ];

  assert.equal(isOneCStockPivotSheet(rows), true);
  const parsed = parseOneCStockPivotSheet(rows);
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((e) => ({ sku: e.skuNormalized, qty: e.qty, wh: e.warehouseRaw })),
    [
      { sku: "01.010", qty: 2, wh: "12 Склад Suprex" },
      { sku: "ST-RC-AN", qty: 12, wh: "44 Склад Готової продукції (СУПРЕКС)" },
    ],
  );
});
