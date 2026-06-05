const { describe, it } = require("node:test");
const assert = require("node:assert");
const { buildStockSkuIndex, resolveStockSkuToProduct } = require("../stock-sku-normalizer");

describe("stock-sku-normalizer", () => {
  it("matches only exact trimmed SKU", () => {
    const index = buildStockSkuIndex([
      { id: "a", sku: "04.043" },
      { id: "b", sku: "04.043M" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("04.043", index)?.id, "a");
    assert.strictEqual(resolveStockSkuToProduct("04.043M", index)?.id, "b");
    assert.strictEqual(resolveStockSkuToProduct(" 04.043M ", index)?.id, "b");
  });

  it("does not match cyrillic М to latin M or collapse suffix variants", () => {
    const index = buildStockSkuIndex([
      { id: "a", sku: "04.043" },
      { id: "b", sku: "04.043M" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("04.043М", index), null);
    assert.strictEqual(resolveStockSkuToProduct("04.043", index)?.id, "a");
  });
});
