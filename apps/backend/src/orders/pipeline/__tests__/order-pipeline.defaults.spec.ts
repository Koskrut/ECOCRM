import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderStage } from "@prisma/client";
import {
  assertDefaultPipelineCoversAllStages,
  buildDefaultPipelineRows,
  DEFAULT_ALLOWED_TRANSITIONS,
} from "../order-pipeline.defaults";

describe("order-pipeline.defaults", () => {
  it("covers all OrderStage values exactly once", () => {
    assert.doesNotThrow(() => assertDefaultPipelineCoversAllStages());
  });

  it("buildDefaultPipelineRows has all stages with sorted MAIN then FINAL sortOrder", () => {
    const rows = buildDefaultPipelineRows();
    assert.equal(rows.length, 13);
    const stages = new Set(rows.map((r) => r.stage));
    assert.equal(stages.size, 13);
    assert.ok(stages.has("FULLY_RETURNED"));
    for (let i = 0; i < rows.length - 1; i++) {
      assert.ok(rows[i].sortOrder <= rows[i + 1].sortOrder);
    }
  });

  it("default graph matches legacy transition matrix shape", () => {
    const fromKeys = Object.keys(DEFAULT_ALLOWED_TRANSITIONS) as OrderStage[];
    assert.equal(fromKeys.length, 13);
    assert.deepEqual(DEFAULT_ALLOWED_TRANSITIONS.NEW, ["AWAITING_PAYMENT", "AWAITING_STOCK", "CANCELED"]);
    assert.deepEqual(DEFAULT_ALLOWED_TRANSITIONS.REFUSED, []);
    assert.deepEqual(DEFAULT_ALLOWED_TRANSITIONS.FULLY_RETURNED, []);
  });
});
