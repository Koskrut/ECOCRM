import type { ModuleId } from "./module-ids";

export type ModuleKind = "core" | "extension";

export type ModuleDef = {
  id: ModuleId;
  kind: ModuleKind;
  displayName: string;
  dependsOn: ModuleId[];
};
