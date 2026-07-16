import test from "node:test";
import assert from "node:assert/strict";
import { PlanningDemandMix } from "@prisma/client";
import { mixKitDemand, uncoveredKitDemand } from "../demand-mix.util";

test("mixKitDemand HARD_PLUS ignores soft and adds forecast beyond hard", () => {
  assert.equal(
    mixKitDemand(PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED, 80, 200, 50),
    200,
  );
  assert.equal(
    mixKitDemand(PlanningDemandMix.HARD_PLUS_FORECAST_BEYOND_COVERED, 80, 50, 50),
    80,
  );
});

test("mixKitDemand MAX includes soft in the max side", () => {
  assert.equal(mixKitDemand(PlanningDemandMix.MAX_FORECAST_HARD, 80, 100, 50), 130);
  assert.equal(mixKitDemand(PlanningDemandMix.MAX_FORECAST_HARD, 80, 200, 50), 200);
});

test("uncoveredKitDemand nets stock", () => {
  assert.equal(uncoveredKitDemand(200, 50), 150);
  assert.equal(uncoveredKitDemand(80, 100), 0);
});
