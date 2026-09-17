import test from "node:test";
import assert from "node:assert/strict";
import {
  displayBottleneckSku,
  inferArticleSkuFromFalsePkg,
  isFastenerComponent,
  isNonInventoriedPackagingSku,
  looksLikeComponentSku,
  monthsOfCover,
  monthsOfCoverForHorizon,
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

test("isFastenerComponent matches SF codes and fastener words", () => {
  assert.equal(isFastenerComponent({ sku: "MG-SF-M2.0", name: "Screw M2" }), true);
  assert.equal(isFastenerComponent({ sku: "ND-SF-RA 1", name: null }), true);
  assert.equal(isFastenerComponent({ sku: "SF-M3", name: "" }), true);
  assert.equal(isFastenerComponent({ sku: "01.010", name: "Винт титан M1.6" }), true);
  assert.equal(isFastenerComponent({ sku: "BOLT-01", name: "hex bolt" }), true);
  assert.equal(isFastenerComponent({ sku: "MG-PF-CAD_CAM-MU", name: "Platform" }), false);
  assert.equal(isFastenerComponent({ sku: "ST-RC-AN", name: "Abutment" }), false);
  assert.equal(isFastenerComponent({ sku: "PKG:блистер", name: "Блистер" }), false);
});

test("monthsOfCover helpers", () => {
  assert.equal(monthsOfCover(100, 10), 10);
  assert.equal(monthsOfCover(0, 10), 0);
  assert.equal(monthsOfCover(100, 0), null);
  assert.equal(monthsOfCoverForHorizon(100, 10, 2), 5);
  assert.equal(monthsOfCoverForHorizon(100, 0, 2), null);
});
