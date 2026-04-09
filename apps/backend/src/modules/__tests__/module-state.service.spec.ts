import test from "node:test";
import assert from "node:assert/strict";
import { ModuleIds, type ModuleId } from "../module-ids";
import { ModuleStateService } from "../module-state.service";
import { EnabledModulesProvider } from "../enabled/enabled-modules.provider";
import { LicenseStateProvider } from "../license/license-state.provider";

class EnabledStub extends EnabledModulesProvider {
  constructor(private readonly enabled: ModuleId[]) {
    super();
  }
  async getEnabledModules() {
    return { enabledModules: new Set(this.enabled), source: "system_setting" as const };
  }
}

class LicenseStub extends LicenseStateProvider {
  constructor(private readonly licensed: ModuleId[]) {
    super();
  }
  async getLicenseState() {
    return { isValid: true, licensedModules: new Set(this.licensed) };
  }
}

test("ModuleStateService: effective = installed && licensed && enabled && depsOk", async () => {
  const enabled = [
    ModuleIds.CoreCrm,
    ModuleIds.VoiceOutbound,
    ModuleIds.Finance,
    ModuleIds.IntegrationsTelegram,
  ];
  const licensed = enabled;
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed));
  const states = await svc.listStates();
  const outbound = states.find((m) => m.id === ModuleIds.VoiceOutbound);
  assert.equal(outbound?.effective, true);
});

test("ModuleStateService: unlicensed => effective=false", async () => {
  const enabled = [ModuleIds.CoreCrm, ModuleIds.VoiceOutbound];
  const licensed = [ModuleIds.CoreCrm]; // outbound missing
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed));
  const states = await svc.listStates();
  const outbound = states.find((m) => m.id === ModuleIds.VoiceOutbound);
  assert.equal(outbound?.licensed, false);
  assert.equal(outbound?.effective, false);
});

test("ModuleStateService: disabled => effective=false", async () => {
  const enabled = [ModuleIds.CoreCrm];
  const licensed = [ModuleIds.CoreCrm, ModuleIds.Finance];
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed));
  const states = await svc.listStates();
  const finance = states.find((m) => m.id === ModuleIds.Finance);
  assert.equal(finance?.enabled, false);
  assert.equal(finance?.effective, false);
});
