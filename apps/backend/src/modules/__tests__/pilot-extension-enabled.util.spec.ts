import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModuleIds, type ModuleId } from "../module-ids";
import { ModuleStateService } from "../module-state.service";
import { EnabledModulesProvider } from "../enabled/enabled-modules.provider";
import { LicenseStateProvider } from "../license/license-state.provider";
import { ModuleHealthService } from "../module-health.service";

class EnabledStub extends EnabledModulesProvider {
  constructor(private readonly enabled: ModuleId[]) {
    super();
  }
  async getEnabledModules() {
    return { enabledModules: new Set(this.enabled), source: "license_state" as const };
  }
}

class LicenseStub extends LicenseStateProvider {
  constructor(private readonly licensed: ModuleId[]) {
    super();
  }
  async getLicenseState() {
    return {
      isValid: true,
      licensedModules: new Set(this.licensed),
      status: "valid" as const,
      expiresAt: null,
      customer: "test",
      shortLicenseId: "test",
    };
  }
}

class HealthStub {
  isUpstreamOk(_id: ModuleId): boolean {
    return true;
  }
}

describe("CP-only module compatibility", () => {
  it("legacy ext.voice_outbound still expands ringostat but not manual calling", async () => {
    const legacy = [ModuleIds.CoreCrm, ModuleIds.VoiceOutbound];
    const svc = new ModuleStateService(
      new EnabledStub(legacy),
      new LicenseStub(legacy),
      new HealthStub() as unknown as ModuleHealthService,
    );
    const states = await svc.listStates();
    const manual = states.find((m) => m.id === ModuleIds.ManualCalling);
    const ringostat = states.find((m) => m.id === ModuleIds.Ringostat);
    assert.equal(manual?.enabled, false);
    assert.equal(manual?.licensed, false);
    assert.equal(ringostat?.enabled, true);
    assert.equal(ringostat?.licensed, true);
  });
});
