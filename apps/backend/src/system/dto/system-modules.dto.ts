export type SystemModuleDto = {
  id: string;
  kind: "core" | "extension" | "integration";
  version: number;
  displayName: string;
  description: string;
  dependsOn: string[];
  delivery: "in_process" | "external_service";
  controlPlane: {
    entitlementKey: string;
    bundleSelectable: boolean;
  };
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  effective: boolean;
};

export type SystemModulesResponseDto = {
  modules: SystemModuleDto[];
};
