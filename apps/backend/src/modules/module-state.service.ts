import { Inject, Injectable } from "@nestjs/common";
import { MODULE_REGISTRY } from "./module-registry";
import type { ModuleId } from "./module-ids";
import type { ModuleDef } from "./module-types";
import { EnabledModulesProvider } from "./enabled/enabled-modules.provider";
import { LicenseStateProvider } from "./license/license-state.provider";

export type ModuleRuntimeState = {
  id: ModuleId;
  kind: ModuleDef["kind"];
  displayName: string;
  dependsOn: ModuleId[];
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  effective: boolean;
};

@Injectable()
export class ModuleStateService {
  constructor(
    @Inject(EnabledModulesProvider) private readonly enabledProvider: EnabledModulesProvider,
    @Inject(LicenseStateProvider) private readonly licenseProvider: LicenseStateProvider,
  ) {}

  async listStates(): Promise<ModuleRuntimeState[]> {
    const [enabledState, licenseState] = await Promise.all([
      this.enabledProvider.getEnabledModules(),
      this.licenseProvider.getLicenseState(),
    ]);
    const enabled = enabledState.enabledModules;
    const licensed = licenseState.licensedModules;

    const installed = new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]);

    const result: ModuleRuntimeState[] = [];
    const byId = MODULE_REGISTRY as Record<ModuleId, ModuleDef>;

    // compute in stable order for determinism
    const ids = Object.keys(MODULE_REGISTRY) as ModuleId[];
    ids.sort();

    // first pass: base flags
    const base = Object.create(null) as Record<
      ModuleId,
      Omit<ModuleRuntimeState, "depsOk" | "effective">
    >;
    for (const id of ids) {
      const def = byId[id];
      base[id] = {
        id,
        kind: def.kind,
        displayName: def.displayName,
        dependsOn: def.dependsOn ?? [],
        installed: installed.has(id),
        licensed: licensed.has(id),
        enabled: enabled.has(id),
      };
    }

    // second pass: deps + effective
    const effectiveMemo = new Map<ModuleId, boolean>();
    const depsOkMemo = new Map<ModuleId, boolean>();
    const visiting = new Set<ModuleId>();

    const computeDepsOk = (id: ModuleId): boolean => {
      const cached = depsOkMemo.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) {
        // cycle => deps not ok
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
      const eff = b.installed && b.licensed && b.enabled && depsOk;
      effectiveMemo.set(id, eff);
      return eff;
    };

    for (const id of ids) {
      const depsOk = computeDepsOk(id);
      const effective = computeEffective(id);
      result.push({ ...base[id], depsOk, effective });
    }

    return result;
  }

  async isEffective(id: ModuleId): Promise<boolean> {
    const states = await this.listStates();
    const s = states.find((x) => x.id === id);
    return s?.effective ?? true;
  }
}
