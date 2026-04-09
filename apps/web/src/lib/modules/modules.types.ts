import type { ModuleId } from "./module-ids";

export type SystemModuleState = {
  id: ModuleId | string;
  kind: "core" | "extension";
  displayName: string;
  dependsOn: string[];
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  effective: boolean;
};

export type SystemModulesResponse = {
  modules: SystemModuleState[];
};
