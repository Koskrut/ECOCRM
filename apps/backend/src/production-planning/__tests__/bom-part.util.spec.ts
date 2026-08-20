import test from "node:test";
import assert from "node:assert/strict";
import {
  displayBottleneckSku,
  inferArticleSkuFromFalsePkg,
  isNonInventoriedPackagingSku,
  looksLikeComponentSku,
  looksLikePackagingName,
} from "../bom-part.util";

test("isNonInventoriedPackagingSku matches real PKG packaging", () => {
  assert.equal(isNonInventoriedPackagingSku("PKG:блистер-suprex-(костя)"), true);
  assert.equal(isNonInventoriedPackagingSku("pkg:этикетка"), true);
  assert.equal(isNonInventoriedPackagingSku("PKG-блистер-suprex"), true);
  assert.equal(isNonInventoriedPackagingSku("ND-TB-2.5x3.5mm"), false);
  assert.equal(isNonInventoriedPackagingSku(""), false);
  assert.equal(isNonInventoriedPackagingSku(null), false);
});

test("inferArticleSkuFromFalsePkg maps known false PKG slugs", () => {
  assert.equal(
    inferArticleSkuFromFalsePkg("PKG:mg-pf-cadcam-mu", "MG-PF-CAD_CAM-MU"),
    "MG-PF-CAD_CAM-MU",
  );
  assert.equal(
    inferArticleSkuFromFalsePkg("PKG-mg-pf-cadcam-mu", "MG-PF-CAD_CAM-MU"),
    "MG-PF-CAD_CAM-MU",
  );
  assert.equal(inferArticleSkuFromFalsePkg("PKG:блистер-suprex", "Блистер Suprex"), null);
  assert.equal(inferArticleSkuFromFalsePkg("PKG-блистер-suprex", "Блистер Suprex"), null);
});

test("false PKG metal parts with PKG- prefix do not count as packaging", () => {
  assert.equal(
    isNonInventoriedPackagingSku("PKG-mg-pf-cadcam-mu", "MG-PF-CAD_CAM-MU"),
    false,
  );
  assert.equal(
    displayBottleneckSku("PKG-mg-pf-cadcam-mu", "MG-PF-CAD_CAM-MU"),
    "MG-PF-CAD_CAM-MU",
  );
});

test("looksLikeComponentSku regression from bom-suprex", () => {
  assert.equal(looksLikeComponentSku("ST-RC-AN"), true);
  assert.equal(looksLikeComponentSku("01.010"), true);
  assert.equal(looksLikeComponentSku("Блистер Suprex  (Костя)"), false);
});
