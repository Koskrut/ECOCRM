import type { ModuleId } from "./module-ids";

export type SystemModuleState = {
  id: ModuleId | string;
  kind: "core" | "extension" | "integration";
  version?: number;
  displayName: string;
  description?: string;
  dependsOn: string[];
  delivery?: "in_process" | "external_service";
  controlPlane?: {
    entitlementKey: string;
    bundleSelectable: boolean;
  };
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  effective: boolean;
};

export type SystemModulesResponse = {
  modules: SystemModuleState[];
};
