import type { ModuleId } from "@crm/contracts/modules";
import type { ModuleRegistrationV1 } from "./manifest";

export type ModuleSdkRegistry = {
  register(manifest: ModuleRegistrationV1): ModuleRegistrationV1;
  get(id: ModuleId): ModuleRegistrationV1 | null;
  has(id: ModuleId): boolean;
  list(): ModuleRegistrationV1[];
  ids(): ModuleId[];
};

export declare function createModuleRegistry(initialModules?: ModuleRegistrationV1[]): ModuleSdkRegistry;
