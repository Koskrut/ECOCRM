import test from "node:test";
import assert from "node:assert/strict";
import { monthBucketDate } from "../sales-history-1c.util";
import {
  parseFlatMonthColumnSheet,
  soldAtToYearMonth,
} from "../sales-history.service";

test("parseFlatMonthColumnSheet reads SKU row and YYYY-MM columns", () => {
  const rows = [
    ["SKU", "2025-01", "2025-02"],
    ["KIT-1", 10, 20],
    ["KIT-2", 0, 5],
  ];
  const parsed = parseFlatMonthColumnSheet(rows);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]!.skuRaw, "KIT-1");
  assert.equal(parsed[0]!.qty, 10);
  assert.equal(parsed[0]!.yearMonth, "2025-01");
  assert.equal(parsed[2]!.skuRaw, "KIT-2");
  assert.equal(parsed[2]!.qty, 5);
});

test("soldAtToYearMonth formats UTC month bucket", () => {
  const d = monthBucketDate(2025, 0);
  assert.equal(soldAtToYearMonth(d), "2025-01");
});
