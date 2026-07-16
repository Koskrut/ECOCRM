import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArticlePartSku,
  buildPackagingPartSku,
  buildPartDisplayName,
  uniquifyPartSku,
} from "../bom-part.util";

test("buildPackagingPartSku slugs Cyrillic packaging names", () => {
  assert.equal(
    buildPackagingPartSku("Блистер Suprex  (Костя)"),
    "PKG:блистер-suprex-(костя)",
  );
});

test("buildArticlePartSku keeps article codes as-is", () => {
  assert.equal(buildArticlePartSku(" ST-RC-AN "), "ST-RC-AN");
});

test("uniquifyPartSku appends hash when preferred is taken", () => {
  const taken = new Set(["PKG:блистер"]);
  const sku = uniquifyPartSku("PKG:блистер", "Блистер", taken);
  assert.notEqual(sku, "PKG:блистер");
  assert.match(sku, /^PKG:блистер#[a-f0-9]+$/);
});

test("buildPartDisplayName prefers componentName", () => {
  assert.equal(
    buildPartDisplayName({
      componentName: "Блистер Suprex (Костя)",
      componentSku: "Блистер Suprex (Костя)",
      componentSkuRaw: "Блистер Suprex (Костя)",
    }),
    "Блистер Suprex (Костя)",
  );
  assert.equal(
    buildPartDisplayName({
      componentName: null,
      componentSku: "ST-RC-AN",
      componentSkuRaw: "ST-RC-AN",
    }),
    "ST-RC-AN",
  );
});
