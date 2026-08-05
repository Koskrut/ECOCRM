import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCanPackQty,
  computeMaxBuildFromBomLines,
  constrainsKitCapacity,
  looksLikeComponentSku,
  looksLikePackagingName,
} from "../kit-capacity.util";
import { isNonInventoriedPackagingSku } from "../bom-part.util";

test("looksLikeComponentSku accepts metal articles with underscore, spaces, units", () => {
  assert.equal(looksLikeComponentSku("MG-PF-CAD_CAM-MU"), true);
  assert.equal(looksLikeComponentSku("MG-HA 4030"), true);
  assert.equal(looksLikeComponentSku("ST-SF-RA 1"), true);
  assert.equal(looksLikeComponentSku("OS-ATS-MU-1 mm"), true);
  assert.equal(looksLikeComponentSku("ST-NC-HA-4.8 x2.0"), true);
  assert.equal(looksLikeComponentSku("OS-TB-LNK-1x6 D4.5"), true);
  assert.equal(looksLikeComponentSku("MG-SF-M2.0"), true);
  assert.equal(looksLikeComponentSku("01.092"), true);
});

test("looksLikeComponentSku rejects packaging prose", () => {
  assert.equal(looksLikeComponentSku("Блистер Suprex  (Костя)"), false);
  assert.equal(looksLikeComponentSku("Этикетка 25*40"), false);
  assert.equal(looksLikePackagingName("Блистер Suprex  (Костя)"), true);
});

test("false PKG metal parts constrain capacity after hardening", () => {
  assert.equal(
    isNonInventoriedPackagingSku("PKG:mg-pf-cadcam-mu", "MG-PF-CAD_CAM-MU"),
    false,
  );
  assert.equal(constrainsKitCapacity({ sku: "PKG:mg-pf-cadcam-mu", name: "MG-PF-CAD_CAM-MU" }), true);
  assert.equal(isNonInventoriedPackagingSku("PKG:блистер-suprex"), true);
});

test("kit 04.042 maxBuildNow=0 when platform has 0 stock (screws do not dominate)", () => {
  const { maxBuildNow, bottleneckSku } = computeMaxBuildFromBomLines([
    { sku: "PKG:mg-pf-cadcam-mu", name: "MG-PF-CAD_CAM-MU", qtyPerKit: 1, available: 0 },
    { sku: "MG-SF-M2.0", name: "Screw", qtyPerKit: 2, available: 8990 },
    { sku: "PKG:blister", name: "Блистер Suprex", qtyPerKit: 1, available: 0 },
  ]);
  assert.equal(maxBuildNow, 0);
  assert.equal(bottleneckSku, "PKG:mg-pf-cadcam-mu");
});

test("CAN_PACK qty is min(need, maxFromParts) not raw maxBuildNow", () => {
  assert.equal(computeCanPackQty(110, 4495), 110);
  assert.equal(computeCanPackQty(5000, 100), 100);
  assert.equal(computeCanPackQty(110, 0), 0);
});
