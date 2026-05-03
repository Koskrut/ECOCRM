import test from "node:test";
import assert from "node:assert/strict";
import { stableStringify } from "../stable-json";

test("stableStringify: key order independent", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});

test("stableStringify: nested objects", () => {
  assert.equal(
    stableStringify({ x: { c: 1, b: 2 }, y: 0 }),
    stableStringify({ y: 0, x: { b: 2, c: 1 } }),
  );
});
