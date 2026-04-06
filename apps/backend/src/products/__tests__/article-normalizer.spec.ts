const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  extractArticleFromFileName,
  extractArticleCandidatesFromFileName,
  normalizeArticle,
  resolveProductMatchForImageFile,
} = require("../article-normalizer");

describe("article-normalizer / extract by mask in filename", () => {
  it("finds numeric article anywhere in basename (underscore prefix)", () => {
    assert.strictEqual(extractArticleFromFileName("IMG_10.051_OS-TB-NHPL.png"), "10.051");
  });

  it("prefers numeric code over leading letter-hyphen token", () => {
    assert.strictEqual(extractArticleFromFileName("S-WF_03.041_extra.png"), "03.041");
    const all = extractArticleCandidatesFromFileName("S-WF_03.041_extra.png");
    assert.ok(all.includes("03.041"));
    assert.strictEqual(all[0], "03.041");
  });

  it("classic Drive-style name: code then description", () => {
    assert.strictEqual(extractArticleFromFileName("00.107 WF-OS-MU.png"), "00.107");
    assert.strictEqual(extractArticleFromFileName("10.090 OS-SF-TB-M2.0.png"), "10.090");
  });

  it("PM.* mask", () => {
    assert.strictEqual(extractArticleFromFileName("photo_PM.12.3_suffix.png"), "PM.12.3");
  });

  it("hyphen-only SKU when no numeric token", () => {
    assert.strictEqual(extractArticleFromFileName("S-WF-AS-SA-MU.png"), "S.WF.AS.SA.MU");
  });

  it("resolveProductMatchForImageFile matches product by extracted article", () => {
    const products = [
      { id: "a", sku: "10.051 | OS", skuNormalized: normalizeArticle("10.051 | OS") },
      { id: "b", sku: "00.107", skuNormalized: normalizeArticle("00.107") },
    ];
    const m1 = resolveProductMatchForImageFile("prefix_10.051_OS-TB.png", products);
    assert.strictEqual(m1?.productId, "a");
    const m2 = resolveProductMatchForImageFile("00.107 WF-OS-MU.png", products);
    assert.strictEqual(m2?.productId, "b");
  });
});
