export type SystemModuleDto = {
  id: string;
  kind: "core" | "extension";
  displayName: string;
  dependsOn: string[];
  installed: boolean;
  licensed: boolean;
  enabled: boolean;
  depsOk: boolean;
  effective: boolean;
};

export type SystemModulesResponseDto = {
  modules: SystemModuleDto[];
};
