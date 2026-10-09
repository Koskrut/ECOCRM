import assert from "node:assert/strict";
import test from "node:test";
import { computeFixedDropdownRect } from "../fixed-dropdown-rect";

test("opens under the field when the viewport has room", () => {
  const rect = computeFixedDropdownRect({
    box: { top: 100, left: 16, bottom: 140, width: 320 },
    viewportWidth: 390,
    viewportHeight: 800,
    fixedOriginX: 0,
    fixedOriginY: 0,
    preferredMaxPx: 224,
    minWidth: 240,
    preferUp: false,
  });
  assert.equal(rect.openedUp, false);
  assert.equal(rect.top, 144);
  assert.equal(rect.left, 16);
  assert.equal(rect.width, 320);
});

test("shifts fixed coordinates by the iOS keyboard pan so the panel stays on the field", () => {
  const rect = computeFixedDropdownRect({
    box: { top: 80, left: 16, bottom: 120, width: 320 },
    viewportWidth: 390,
    viewportHeight: 500,
    fixedOriginX: 0,
    fixedOriginY: -180,
    preferredMaxPx: 224,
    minWidth: 240,
    preferUp: false,
  });
  assert.equal(rect.openedUp, false);
  assert.equal(rect.top, 120 + 4 - -180);
});

test("opens above the field when the keyboard covers the space below", () => {
  const rect = computeFixedDropdownRect({
    box: { top: 320, left: 16, bottom: 360, width: 320 },
    viewportWidth: 390,
    viewportHeight: 400,
    fixedOriginX: 0,
    fixedOriginY: -180,
    preferredMaxPx: 224,
    minWidth: 240,
    preferUp: false,
  });
  assert.equal(rect.openedUp, true);
  // top is the panel bottom, just above the field, in fixed coordinates
  assert.equal(rect.top, 320 - 4 - -180);
  assert.equal(rect.top + -180, 316);
});

test("stays above while typing once it has flipped up", () => {
  const rect = computeFixedDropdownRect({
    box: { top: 200, left: 16, bottom: 240, width: 320 },
    viewportWidth: 390,
    viewportHeight: 400,
    fixedOriginX: 0,
    fixedOriginY: 0,
    preferredMaxPx: 224,
    minWidth: 240,
    preferUp: true,
  });
  assert.equal(rect.openedUp, true);
});
