import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors apps/web/src/lib/planning-kit-parts.ts */
function isKitPartShort(available: number, need: number): boolean {
  return available < need;
}

test("bottleneck with enough stock is not short", () => {
  assert.equal(isKitPartShort(781, 195), false);
});

test("short when available is below gross need even without bottleneck flag", () => {
  assert.equal(isKitPartShort(10, 195), true);
});

test("exact stock match is not short", () => {
  assert.equal(isKitPartShort(195, 195), false);
});
