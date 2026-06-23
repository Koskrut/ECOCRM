import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreDayPlanItem, scoreOverallPercent, dayPlanStatusFromPercent } from "../day-plan.scoring";

describe("day-plan.scoring", () => {
  it("caps target metrics at 100%", () => {
    assert.deepEqual(scoreDayPlanItem("target", 20, 15), {
      plan: 15,
      fact: 20,
      percent: 100,
    });
  });

  it("returns 100% when plan is zero for target metrics", () => {
    assert.equal(scoreDayPlanItem("target", 0, 0).percent, 100);
  });

  it("returns 0% for overdue when fact > 0", () => {
    assert.deepEqual(scoreDayPlanItem("zero_target", 3, 0), {
      plan: 0,
      fact: 3,
      percent: 0,
    });
  });

  it("returns 100% for zero_target when fact is 0", () => {
    assert.equal(scoreDayPlanItem("zero_target", 0, 0).percent, 100);
  });

  it("computes weighted average", () => {
    const overall = scoreOverallPercent([
      { weight: 50, percent: 100 },
      { weight: 50, percent: 0 },
    ]);
    assert.equal(overall, 50);
  });

  it("maps status thresholds", () => {
    assert.equal(dayPlanStatusFromPercent(80), "green");
    assert.equal(dayPlanStatusFromPercent(79), "yellow");
    assert.equal(dayPlanStatusFromPercent(50), "yellow");
    assert.equal(dayPlanStatusFromPercent(49), "red");
  });
});
