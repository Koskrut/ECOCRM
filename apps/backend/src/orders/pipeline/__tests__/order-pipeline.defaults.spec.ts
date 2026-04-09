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

  it("buildDefaultPipelineRows has 12 rows with sorted MAIN then FINAL sortOrder", () => {
    const rows = buildDefaultPipelineRows();
    assert.equal(rows.length, 12);
    const stages = new Set(rows.map((r) => r.stage));
    assert.equal(stages.size, 12);
    for (let i = 0; i < rows.length - 1; i++) {
      assert.ok(rows[i].sortOrder <= rows[i + 1].sortOrder);
    }
  });

  it("default graph matches legacy transition matrix shape", () => {
    const fromKeys = Object.keys(DEFAULT_ALLOWED_TRANSITIONS) as OrderStage[];
    assert.equal(fromKeys.length, 12);
    assert.deepEqual(DEFAULT_ALLOWED_TRANSITIONS.NEW, ["AWAITING_PAYMENT", "AWAITING_STOCK", "CANCELED"]);
    assert.deepEqual(DEFAULT_ALLOWED_TRANSITIONS.REFUSED, []);
  });
});
