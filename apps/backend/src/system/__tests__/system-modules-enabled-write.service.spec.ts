import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SystemSettingEnabledModulesProvider } from "../../modules/enabled/system-setting-enabled-modules.provider";
import { ModuleIds, type ModuleId } from "../../modules/module-ids";
import { LicenseStateProvider } from "../../modules/license/license-state.provider";

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

describe("EnabledModulesProvider (CP-only)", () => {
  it("returns enabled modules from license state", async () => {
    const provider = new SystemSettingEnabledModulesProvider(
      new LicenseStub([ModuleIds.CoreCrm, ModuleIds.Finance]),
    );
    const state = await provider.getEnabledModules();
    assert.equal(state.source, "license_state");
    assert.equal(state.enabledModules.has(ModuleIds.CoreCrm), true);
    assert.equal(state.enabledModules.has(ModuleIds.Finance), true);
    assert.equal(state.enabledModules.has(ModuleIds.Ringostat), false);
  });

  it("falls back to empty enabled set on provider error", async () => {
    const provider = new SystemSettingEnabledModulesProvider({
      getLicenseState: async () => {
        throw new Error("boom");
      },
    } as LicenseStateProvider);
    const state = await provider.getEnabledModules();
    assert.equal(state.source, "error_fallback");
    assert.equal(state.enabledModules.size, 0);
  });
});
