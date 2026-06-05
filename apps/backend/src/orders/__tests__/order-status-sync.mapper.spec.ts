import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyStatusesForOrderStage,
  legacyStatusesForOrderStages,
  legacyStatusToOrderStage,
} from "../order-status-sync.mapper";

test("IN_WORK maps to CONFIRMED", () => {
  assert.equal(legacyStatusToOrderStage("IN_WORK"), "CONFIRMED");
});

test("legacyStatusesForOrderStage(CONFIRMED) includes IN_WORK", () => {
  assert.deepEqual(legacyStatusesForOrderStage("CONFIRMED"), ["IN_WORK"]);
});

test("legacyStatusesForOrderStages includes IN_WORK when CONFIRMED requested", () => {
  const statuses = legacyStatusesForOrderStages(["CONFIRMED", "READY_TO_SHIP"]);
  assert.ok(statuses.includes("IN_WORK"));
  assert.ok(statuses.includes("READY_TO_SHIP"));
});
