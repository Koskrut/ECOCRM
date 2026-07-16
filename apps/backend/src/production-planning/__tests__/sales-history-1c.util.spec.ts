import test from "node:test";
import assert from "node:assert/strict";
import {
  isOneCSalesPivotSheet,
  parseMonthPeriodHeader,
  parseOneCSalesPivotSheet,
  monthBucketDate,
} from "../sales-history-1c.util";

test("parseMonthPeriodHeader understands Ukrainian months", () => {
  assert.deepEqual(parseMonthPeriodHeader("Січень 2025 р."), { year: 2025, monthIndex: 0 });
  assert.deepEqual(parseMonthPeriodHeader("Липень 2026 р."), { year: 2026, monthIndex: 6 });
  assert.equal(parseMonthPeriodHeader("Підсумок"), null);
});

test("parseOneCSalesPivotSheet unpivots monthly quantities", () => {
  const rows: unknown[][] = [
    ["Продажі"],
    ["Період: 01.01.2025"],
    [
      "Номенклатура.Артикул ",
      "Січень 2025 р.",
      "Лютий 2025 р.",
      "Підсумок",
    ],
    ["", "Кількість", "Кількість", "Кількість"],
    ["00.100", "", 2, 2],
    ["00.101", 2, -1, 1],
    ["Підсумок", 2, 1, 3],
  ];

  assert.equal(isOneCSalesPivotSheet(rows), true);
  const parsed = parseOneCSalesPivotSheet(rows);
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((p) => ({ sku: p.skuRaw, qty: p.qty, month: p.soldAt.getUTCMonth() })),
    [
      { sku: "00.100", qty: 2, month: 1 },
      { sku: "00.101", qty: 2, month: 0 },
      { sku: "00.101", qty: -1, month: 1 },
    ],
  );
  assert.equal(parsed[0]?.soldAt.getTime(), monthBucketDate(2025, 1).getTime());
});

test("parseOneCSalesPivotSheet skips amount columns when measure sub-header present", () => {
  const rows: unknown[][] = [
    ["Продажі"],
    ["Номенклатура.Артикул ", "Січень 2025 р.", "Січень 2025 р."],
    ["", "Кількість", "Сума"],
    ["00.100", 2, 5000],
  ];
  const parsed = parseOneCSalesPivotSheet(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.qty, 2);
});

test("parseOneCSalesPivotSheet accepts a single month column", () => {
  const rows: unknown[][] = [
    ["Номенклатура.Артикул ", "Лютий 2026 р.", "Підсумок"],
    ["KIT-1", 4, 4],
  ];
  assert.equal(isOneCSalesPivotSheet(rows), true);
  const parsed = parseOneCSalesPivotSheet(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.qty, 4);
});
