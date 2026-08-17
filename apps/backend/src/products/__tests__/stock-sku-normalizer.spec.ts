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

  it("matches file article 10.046 to Product.sku «10.046 | Test» via primary article index", () => {
    const index = buildStockSkuIndex([{ id: "p-1046", sku: "10.046 | Test" }]);
    const ref = resolveStockSkuToProduct("10.046", index);
    assert.strictEqual(ref?.id, "p-1046");
    assert.strictEqual(ref?.sku, "10.046 | Test");
    assert.ok(index.byArticle.has("10.046"));
    assert.strictEqual(index.byArticle.get("10.046")?.id, "p-1046");
  });

  it("matches 1C externalCode when file uses nomenclature code instead of SKU", () => {
    const index = buildStockSkuIndex([
      { id: "p", sku: "10.046", externalCode: "000000190" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("000000190", index)?.id, "p");
    assert.strictEqual(resolveStockSkuToProduct("10.046", index)?.id, "p");
  });

  it("prefers exact SKU over another product's 1C code", () => {
    const index = buildStockSkuIndex([
      { id: "by-sku", sku: "000000190" },
      { id: "by-code", sku: "10.046", externalCode: "000000190" },
    ]);
    assert.strictEqual(resolveStockSkuToProduct("000000190", index)?.id, "by-sku");
  });
});
