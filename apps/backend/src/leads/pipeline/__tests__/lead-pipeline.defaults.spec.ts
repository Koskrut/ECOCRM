import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_LEAD_STATUSES,
  assertDefaultLeadPipelineCoversAllStatuses,
  buildDefaultPipelineRows,
  buildFullAllowedTransitions,
  STEPPER_LABEL_BY_UI_STEP_KEY,
} from "../lead-pipeline.defaults";

describe("lead-pipeline.defaults", () => {
  it("covers all LeadStatus values exactly once", () => {
    assertDefaultLeadPipelineCoversAllStatuses();
    assert.equal(ALL_LEAD_STATUSES.length, 6);
  });

  it("full transition graph allows every target from every source", () => {
    const g = buildFullAllowedTransitions();
    for (const from of ALL_LEAD_STATUSES) {
      const next = g[from];
      assert.ok(next);
      assert.equal(next.length, ALL_LEAD_STATUSES.length);
      for (const t of ALL_LEAD_STATUSES) {
        assert.ok(next.includes(t), `${from} should allow -> ${t}`);
      }
    }
  });

  it("default rows match enum count and stepper labels are fixed", () => {
    const rows = buildDefaultPipelineRows();
    assert.equal(rows.length, 6);
    assert.equal(STEPPER_LABEL_BY_UI_STEP_KEY.NEW, "Новий");
    assert.equal(STEPPER_LABEL_BY_UI_STEP_KEY.IN_PROGRESS, "В роботі");
    assert.equal(STEPPER_LABEL_BY_UI_STEP_KEY.PROCESSED, "Оброблено");
  });
});
