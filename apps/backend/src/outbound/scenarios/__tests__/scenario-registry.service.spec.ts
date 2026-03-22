import { describe, it } from "node:test";
import assert from "node:assert";
import { ScenarioRegistryService } from "../scenario-registry.service";
import { LEAD_QUALIFICATION_SCENARIO_VERSION } from "../lead-qualification.scenario";
import { DORMANT_REACTIVATION_SCENARIO_VERSION } from "../dormant-reactivation.scenario";

describe("ScenarioRegistryService", () => {
  it("returns latest lead qualification scenario", () => {
    const reg = new ScenarioRegistryService();
    const s = reg.getLatest("LEAD_QUALIFICATION");
    assert.strictEqual(s.code, "LEAD_QUALIFICATION");
    assert.strictEqual(s.version, LEAD_QUALIFICATION_SCENARIO_VERSION);
    assert.ok(s.outcomeMappings.length > 0);
  });

  it("returns dormant scenario by version", () => {
    const reg = new ScenarioRegistryService();
    const s = reg.getByCodeAndVersion("DORMANT_REACTIVATION", DORMANT_REACTIVATION_SCENARIO_VERSION);
    assert.strictEqual(s.code, "DORMANT_REACTIVATION");
    assert.ok(s.captureFields.some((f) => f.key === "churn_reason"));
  });

  it("listValidOutcomeKeys matches outcomeMappings", () => {
    const reg = new ScenarioRegistryService();
    const s = reg.getLatest("LEAD_QUALIFICATION");
    const keys = reg.listValidOutcomeKeys(s);
    assert.ok(keys.includes("NO_ANSWER"));
    assert.strictEqual(keys.length, s.outcomeMappings.length);
  });
});
