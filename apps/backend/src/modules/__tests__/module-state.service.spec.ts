import test from "node:test";
import assert from "node:assert/strict";
import { assertModuleManifestV1 } from "@crm/module-sdk/manifest";
import { ModuleIds, type ModuleId } from "../module-ids";
import { MODULE_REGISTRY, entitledModuleIds, registryModuleIds } from "../module-registry";
import { ModuleStateService } from "../module-state.service";
import { ModuleHealthService } from "../module-health.service";
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

test("ModuleStateService: effective = installed && licensed && enabled && depsOk", async () => {
  const enabled = [
    ModuleIds.CoreCrm,
    ModuleIds.VoiceOutbound,
    ModuleIds.Finance,
    ModuleIds.IntegrationsTelegram,
  ];
  const licensed = enabled;
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed), new HealthStub() as unknown as ModuleHealthService);
  const states = await svc.listStates();
  const outbound = states.find((m) => m.id === ModuleIds.VoiceOutbound);
  assert.equal(outbound?.effective, true);
});

test("ModuleStateService: unlicensed => effective=false", async () => {
  const enabled = [ModuleIds.CoreCrm, ModuleIds.VoiceOutbound];
  const licensed = [ModuleIds.CoreCrm]; // outbound missing
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed), new HealthStub() as unknown as ModuleHealthService);
  const states = await svc.listStates();
  const outbound = states.find((m) => m.id === ModuleIds.VoiceOutbound);
  assert.equal(outbound?.licensed, false);
  assert.equal(outbound?.effective, false);
});

test("ModuleStateService: disabled => effective=false", async () => {
  const enabled = [ModuleIds.CoreCrm];
  const licensed = [ModuleIds.CoreCrm, ModuleIds.Finance];
  const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed), new HealthStub() as unknown as ModuleHealthService);
  const states = await svc.listStates();
  const finance = states.find((m) => m.id === ModuleIds.Finance);
  assert.equal(finance?.enabled, false);
  assert.equal(finance?.effective, false);
});

test("ModuleStateService: outbound_worker marks only core + voice outbound installed", async () => {
  const prev = process.env.BACKEND_VARIANT;
  process.env.BACKEND_VARIANT = "outbound_worker";
  try {
    const enabled = [ModuleIds.CoreCrm, ModuleIds.VoiceOutbound];
    const licensed = enabled;
    const svc = new ModuleStateService(new EnabledStub(enabled), new LicenseStub(licensed), new HealthStub() as unknown as ModuleHealthService);
    const states = await svc.listStates();
    const voice = states.find((m) => m.id === ModuleIds.VoiceOutbound);
    const finance = states.find((m) => m.id === ModuleIds.Finance);
    assert.equal(voice?.installed, true);
    assert.equal(finance?.installed, false);
    assert.equal(voice?.effective, true);
    assert.equal(finance?.effective, false);
  } finally {
    if (prev === undefined) delete process.env.BACKEND_VARIANT;
    else process.env.BACKEND_VARIANT = prev;
  }
});

test("MODULE_REGISTRY: manifest ids, entitlements, and dependencies are consistent", () => {
  const ids = registryModuleIds();
  assert(ids.includes(ModuleIds.CoreCrm));
  assert(ids.includes(ModuleIds.ProductionPlanning));
  assert(ids.includes(ModuleIds.IntegrationsTelegram));
  assert(ids.includes(ModuleIds.NovaPoshta));

  for (const id of ids) {
    const def = MODULE_REGISTRY[id];
    assert(def, `module missing from registry: ${id}`);
    assert.equal(def.id, id);
    assert.equal(def.version, 1);
    assert.equal(def.controlPlane.entitlementKey, id);
    assert.equal(assertModuleManifestV1(def), def);
    for (const dep of def.dependsOn) {
      assert(ids.includes(dep), `module ${id} depends on unknown module ${dep}`);
    }
  }
});

test("MODULE_REGISTRY: entitled ids are all non-core modules", () => {
  const entitled = new Set(entitledModuleIds());
  assert.equal(entitled.has(ModuleIds.CoreCrm), false);
  for (const id of registryModuleIds()) {
    const def = MODULE_REGISTRY[id]!;
    assert.equal(entitled.has(id), def.kind !== "core");
  }
});
