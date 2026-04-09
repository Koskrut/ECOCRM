import type { ModuleId } from "../module-ids";

export type EnabledModulesState = {
  enabledModules: Set<ModuleId>;
  source: "default_all_enabled" | "system_setting" | "error_fallback";
};

export abstract class EnabledModulesProvider {
  abstract getEnabledModules(): Promise<EnabledModulesState>;
}
