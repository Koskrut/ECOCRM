import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionAssignments,
  resolvePrimaryRegionForManager,
  type OrgChartStructure,
} from "../../settings/org-chart-region-resolver";

describe("resolvePrimaryRegionForManager", () => {
  const org: OrgChartStructure = {
    assignments: {
      "m1-1": "manager-a",
      "m1-2": "manager-b",
      lead1: "lead-user",
    },
    extraSlots: [],
    regions: {
      "m1-1": ["Вінницька", "Київська"],
      "m1-2": ["Львівська"],
    },
  };

  it("returns first assigned region for manager", () => {
    assert.equal(resolvePrimaryRegionForManager(org, "manager-a"), "Вінницька");
    assert.equal(resolvePrimaryRegionForManager(org, "manager-b"), "Львівська");
  });

  it("falls back to Київська when manager has no regions", () => {
    assert.equal(resolvePrimaryRegionForManager(org, "unknown-manager"), "Київська");
    assert.equal(resolvePrimaryRegionForManager(org, ""), "Київська");
  });

  it("buildRegionAssignments maps one region per slot priority", () => {
    const map = buildRegionAssignments(org);
    assert.equal(map.get("Вінницька")?.managerId, "manager-a");
    assert.equal(map.get("Київська")?.managerId, "manager-a");
    assert.equal(map.get("Львівська")?.managerId, "manager-b");
  });
});
