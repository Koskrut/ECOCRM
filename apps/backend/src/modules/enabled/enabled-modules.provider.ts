import type { ModuleId } from "../module-ids";

export type EnabledModulesState = {
  enabledModules: Set<ModuleId>;
  source: "license_state" | "error_fallback";
};

export abstract class EnabledModulesProvider {
  abstract getEnabledModules(): Promise<EnabledModulesState>;
}
