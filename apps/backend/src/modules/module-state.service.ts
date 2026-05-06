import { Inject, Injectable } from "@nestjs/common";
import { MODULE_REGISTRY } from "./module-registry";
import { ModuleIds, type ModuleId } from "./module-ids";
import type { ModuleDef } from "./module-types";
import { EnabledModulesProvider } from "./enabled/enabled-modules.provider";
import { LicenseStateProvider } from "./license/license-state.provider";
import { ModuleHealthService, MODULE_UPSTREAM_ENV } from "./module-health.service";

export type ModuleRuntimeState = {
  id: ModuleId;
  kind: ModuleDef["kind"];
  version: ModuleDef["version"];
  displayName: string;
  description: string;
  dependsOn: ModuleId[];
  delivery: ModuleDef["delivery"];
  controlPlane: ModuleDef["controlPlane"];
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  /** Runtime can reach module service (health) or in-process module. */
  reachable: boolean;
  effective: boolean;
};

const WORKER_VARIANT_INSTALLED: Record<string, ModuleId[]> = {
  outbound_worker: [
    ModuleIds.CoreCrm,
    ModuleIds.ManualCalling,
    ModuleIds.Ringostat,
    ModuleIds.IntegrationsTelegram,
    ModuleIds.VoiceOutbound,
  ],
  finance_worker: [ModuleIds.CoreCrm, ModuleIds.Finance],
  planning_worker: [ModuleIds.CoreCrm, ModuleIds.ProductionPlanning],
  np_worker: [ModuleIds.CoreCrm, ModuleIds.NovaPoshta],
  google_sheet_worker: [ModuleIds.CoreCrm, ModuleIds.GoogleSheet],
  bitrix_worker: [ModuleIds.CoreCrm, ModuleIds.Bitrix],
  ringostat_worker: [ModuleIds.CoreCrm, ModuleIds.Ringostat],
  telegram_worker: [ModuleIds.CoreCrm, ModuleIds.IntegrationsTelegram],
};

function withLegacyVoiceOutboundCompat(ids: Set<ModuleId>): Set<ModuleId> {
  const out = new Set(ids);
  if (out.has(ModuleIds.VoiceOutbound)) {
    out.add(ModuleIds.ManualCalling);
    out.add(ModuleIds.Ringostat);
  }
  return out;
}

function externalInstalledFromUpstreamEnv(): Set<ModuleId> {
  const s = new Set<ModuleId>();
  for (const [id, envKey] of Object.entries(MODULE_UPSTREAM_ENV) as [ModuleId, string][]) {
    if (process.env[envKey]?.trim()) {
      s.add(id);
      if (id === ModuleIds.VoiceOutbound || id === ModuleIds.ManualCalling) {
        s.add(ModuleIds.IntegrationsTelegram);
      }
    }
  }
  return s;
}

function resolveInstalledSet(): Set<ModuleId> {
  const variant = process.env.BACKEND_VARIANT ?? "full";
  if (variant === "core") {
    return withLegacyVoiceOutboundCompat(
      new Set<ModuleId>([ModuleIds.CoreCrm, ...externalInstalledFromUpstreamEnv()]),
    );
  }
  const worker = WORKER_VARIANT_INSTALLED[variant];
  if (worker) {
    return withLegacyVoiceOutboundCompat(new Set(worker));
  }
  return withLegacyVoiceOutboundCompat(new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]));
}

@Injectable()
export class ModuleStateService {
  constructor(
    @Inject(EnabledModulesProvider) private readonly enabledProvider: EnabledModulesProvider,
    @Inject(LicenseStateProvider) private readonly licenseProvider: LicenseStateProvider,
    @Inject(ModuleHealthService) private readonly moduleHealth: ModuleHealthService,
  ) {}

  private resolveReachable(id: ModuleId, installed: Set<ModuleId>): boolean {
    const variant = process.env.BACKEND_VARIANT ?? "full";
    if (!variant || variant === "full") {
      return true;
    }
    if (id === ModuleIds.CoreCrm) {
      return true;
    }
    if (variant.endsWith("_worker") && installed.has(id)) {
      return true;
    }
    if (variant !== "core") {
      return true;
    }
    if (!installed.has(id)) {
      return false;
    }
    if (
      id === ModuleIds.IntegrationsTelegram &&
      (installed.has(ModuleIds.ManualCalling) || installed.has(ModuleIds.VoiceOutbound))
    ) {
      const ob = process.env.OUTBOUND_UPSTREAM_URL?.trim();
      if (!ob) return true;
      return (
        this.moduleHealth.isUpstreamOk(ModuleIds.ManualCalling) ||
        this.moduleHealth.isUpstreamOk(ModuleIds.VoiceOutbound)
      );
    }
    const envKey = MODULE_UPSTREAM_ENV[id];
    if (!envKey || !process.env[envKey]?.trim()) {
      return true;
    }
    return this.moduleHealth.isUpstreamOk(id);
  }

  async listStates(): Promise<ModuleRuntimeState[]> {
    const [enabledState, licenseState] = await Promise.all([
      this.enabledProvider.getEnabledModules(),
      this.licenseProvider.getLicenseState(),
    ]);
    const enabled = withLegacyVoiceOutboundCompat(enabledState.enabledModules);
    const licensed = withLegacyVoiceOutboundCompat(licenseState.licensedModules);

    const installed = resolveInstalledSet();

    const result: ModuleRuntimeState[] = [];
    const byId = MODULE_REGISTRY as Record<ModuleId, ModuleDef>;

    const ids = Object.keys(MODULE_REGISTRY) as ModuleId[];
    ids.sort();

    const base = Object.create(null) as Record<
      ModuleId,
      Omit<ModuleRuntimeState, "depsOk" | "reachable" | "effective">
    >;
    for (const id of ids) {
      const def = byId[id];
      base[id] = {
        id,
        kind: def.kind,
        version: def.version,
        displayName: def.displayName,
        description: def.description,
        dependsOn: def.dependsOn ?? [],
        delivery: def.delivery,
        controlPlane: def.controlPlane,
        installed: installed.has(id),
        licensed: licensed.has(id),
        enabled: enabled.has(id),
      };
    }

    const reachableById = new Map<ModuleId, boolean>();
    for (const id of ids) {
      reachableById.set(id, this.resolveReachable(id, installed));
    }

    const effectiveMemo = new Map<ModuleId, boolean>();
    const depsOkMemo = new Map<ModuleId, boolean>();
    const visiting = new Set<ModuleId>();

    const computeDepsOk = (id: ModuleId): boolean => {
      const cached = depsOkMemo.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) {
        depsOkMemo.set(id, false);
        return false;
      }
      visiting.add(id);
      const deps = base[id].dependsOn ?? [];
      const ok = deps.every((d) => computeEffective(d));
      visiting.delete(id);
      depsOkMemo.set(id, ok);
      return ok;
    };

    const computeEffective = (id: ModuleId): boolean => {
      const cached = effectiveMemo.get(id);
      if (cached !== undefined) return cached;
      const b = base[id];
      const depsOk = computeDepsOk(id);
      const reachable = reachableById.get(id) ?? true;
      const eff = b.installed && b.licensed && b.enabled && depsOk && reachable;
      effectiveMemo.set(id, eff);
      return eff;
    };

    for (const id of ids) {
      const depsOk = computeDepsOk(id);
      const effective = computeEffective(id);
      const reachable = reachableById.get(id) ?? true;
      result.push({ ...base[id], depsOk, reachable, effective });
    }

    return result;
  }

  async isEffective(id: ModuleId): Promise<boolean> {
    const states = await this.listStates();
    const s = states.find((x) => x.id === id);
    return s?.effective ?? true;
  }
}
