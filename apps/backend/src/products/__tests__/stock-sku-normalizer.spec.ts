const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  normalizeStockSku,
  buildStockSkuIndex,
  resolveStockSkuToProduct,
} = require("../stock-sku-normalizer");

describe("stock-sku-normalizer", () => {
  it("keeps latin suffix M (unlike normalizeArticle stripping cyrillic М)", () => {
    assert.strictEqual(normalizeStockSku("04.043M"), "04.043M");
    assert.strictEqual(normalizeStockSku("04.043М"), "04.043M");
    assert.strictEqual(normalizeStockSku("04.043"), "04.043");
  });

  it("does not collapse 04.043M into 04.043", () => {
    const index = buildStockSkuIndex([
      { id: "a", sku: "04.043" },
      { id: "b", sku: "04.043M" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("04.043", index)?.id, "a");
    assert.strictEqual(resolveStockSkuToProduct("04.043M", index)?.id, "b");
    assert.strictEqual(resolveStockSkuToProduct("04.043М", index)?.id, "b");
    assert.strictEqual(resolveStockSkuToProduct("04.043", index)?.id, "a");
  });

  it("matches cyrillic М in file to latin M in catalog", () => {
    const index = buildStockSkuIndex([{ id: "b", sku: "04.043M" }]);
    assert.strictEqual(resolveStockSkuToProduct("04.043М", index)?.id, "b");
  });
});
