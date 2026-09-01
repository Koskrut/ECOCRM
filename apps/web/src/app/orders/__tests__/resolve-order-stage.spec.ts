import assert from "node:assert/strict";
import test from "node:test";
import { resolveStage } from "../orders-kanban.util";

test("legacy IN_WORK without orderStage resolves to CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: null, status: "IN_WORK" }), "CONFIRMED");
});

test("explicit CONFIRMED orderStage stays CONFIRMED", () => {
  assert.equal(resolveStage({ orderStage: "CONFIRMED", status: "IN_WORK" }), "CONFIRMED");
});
