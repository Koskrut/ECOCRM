import test from "node:test";
import assert from "node:assert/strict";
import { mergeMonthlySalesHistory, monthKeyUtc } from "../forecast-history-merge.util";

test("Excel net-negative month blocks CRM gap-fill and stores 0", () => {
  const soldAt = new Date(Date.UTC(2025, 1, 15));
  const monthly = mergeMonthlySalesHistory({
    excelRows: [{ productId: "kit-1", soldAt, qty: -3 }],
    crmRows: [{ productId: "kit-1", soldAt, qty: 40 }],
  });
  assert.equal(monthly.get("kit-1")?.get(monthKeyUtc(soldAt)), 0);
});

test("Excel net-zero month blocks CRM gap-fill", () => {
  const soldAt = new Date(Date.UTC(2025, 2, 15));
  const monthly = mergeMonthlySalesHistory({
    excelRows: [{ productId: "kit-1", soldAt, qty: 0 }],
    crmRows: [{ productId: "kit-1", soldAt, qty: 12 }],
  });
  assert.equal(monthly.get("kit-1")?.get(monthKeyUtc(soldAt)), 0);
});

test("CRM fills only months without Excel coverage", () => {
  const jan = new Date(Date.UTC(2025, 0, 15));
  const feb = new Date(Date.UTC(2025, 1, 15));
  const monthly = mergeMonthlySalesHistory({
    excelRows: [{ productId: "kit-1", soldAt: jan, qty: 5 }],
    crmRows: [
      { productId: "kit-1", soldAt: jan, qty: 99 },
      { productId: "kit-1", soldAt: feb, qty: 7 },
    ],
  });
  assert.equal(monthly.get("kit-1")?.get(monthKeyUtc(jan)), 5);
  assert.equal(monthly.get("kit-1")?.get(monthKeyUtc(feb)), 7);
});
