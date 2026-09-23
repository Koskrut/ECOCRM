import assert from "node:assert/strict";
import test from "node:test";
import { matchesAging } from "../aging";

test("matchesAging chips", () => {
  assert.equal(matchesAging(3, ""), true);
  assert.equal(matchesAging(3, "0-7"), true);
  assert.equal(matchesAging(10, "0-7"), false);
  assert.equal(matchesAging(10, "8-30"), true);
  assert.equal(matchesAging(45, "31-60"), true);
  assert.equal(matchesAging(90, "90+"), true);
  assert.equal(matchesAging(61, "90+"), true);
  assert.equal(matchesAging(30, "90+"), false);
});
