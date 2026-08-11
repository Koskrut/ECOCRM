import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  routePlanConfirmBlockMessage,
  routePlanConfirmBlockReason,
} from "../route-plan-confirm.util";

describe("routePlanConfirmBlockReason", () => {
  it("blocks when plan is missing or empty", () => {
    assert.equal(
      routePlanConfirmBlockReason({
        hasPlan: false,
        stopCount: 0,
        missingCoordsCount: 0,
        geometrySource: "osrm",
      }),
      "no_plan",
    );
    assert.equal(
      routePlanConfirmBlockReason({
        hasPlan: true,
        stopCount: 0,
        missingCoordsCount: 0,
        geometrySource: "osrm",
      }),
      "no_plan",
    );
  });

  it("blocks when visits lack coordinates", () => {
    assert.equal(
      routePlanConfirmBlockReason({
        hasPlan: true,
        stopCount: 3,
        missingCoordsCount: 1,
        geometrySource: "osrm",
      }),
      "missing_coords",
    );
  });

  it("blocks when OSRM fallback is used", () => {
    assert.equal(
      routePlanConfirmBlockReason({
        hasPlan: true,
        stopCount: 2,
        missingCoordsCount: 0,
        geometrySource: "fallback",
      }),
      "osrm_unavailable",
    );
    assert.match(String(routePlanConfirmBlockMessage("osrm_unavailable")), /OSRM/i);
  });

  it("allows confirm when plan is road-routed", () => {
    assert.equal(
      routePlanConfirmBlockReason({
        hasPlan: true,
        stopCount: 2,
        missingCoordsCount: 0,
        geometrySource: "osrm",
      }),
      null,
    );
  });
});
