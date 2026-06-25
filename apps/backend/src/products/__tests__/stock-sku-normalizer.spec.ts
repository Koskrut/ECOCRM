const { describe, it } = require("node:test");
const assert = require("node:assert");
const { buildStockSkuIndex, resolveStockSkuToProduct } = require("../stock-sku-normalizer");

describe("stock-sku-normalizer", () => {
  it("matches exact trimmed SKU", () => {
    const index = buildStockSkuIndex([
      { id: "a", sku: "04.043" },
      { id: "b", sku: "04.043M" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("04.043", index)?.id, "a");
    assert.strictEqual(resolveStockSkuToProduct("04.043M", index)?.id, "b");
    assert.strictEqual(resolveStockSkuToProduct(" 04.043M ", index)?.id, "b");
  });

  it("normalizeArticle strips trailing cyrillic suffix (04.043М → 04.043)", () => {
    const index = buildStockSkuIndex([
      { id: "a", sku: "04.043" },
      { id: "b", sku: "04.043M" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("04.043М", index)?.id, "a");
    assert.strictEqual(resolveStockSkuToProduct("04.043M", index)?.id, "b");
  });

  it("matches Excel-corrupted numeric SKU 0.1 to product 00.100", () => {
    const index = buildStockSkuIndex([{ id: "p", sku: "00.100" }]);
    assert.strictEqual(resolveStockSkuToProduct("0.1", index)?.sku, "00.100");
    assert.strictEqual(resolveStockSkuToProduct("00.100", index)?.sku, "00.100");
  });

  it("matches Excel-corrupted 1.011 to product 01.011", () => {
    const index = buildStockSkuIndex([{ id: "p", sku: "01.011" }]);
    assert.strictEqual(resolveStockSkuToProduct("1.011", index)?.sku, "01.011");
  });
});
